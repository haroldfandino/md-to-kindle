import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { SMTPServer } from 'smtp-server';
import type { SMTPServerOptions } from 'smtp-server';
import { generate } from 'selfsigned';
import nodemailer from 'nodemailer';
import { MdToKindleMailer, explainMailError, mailMessage, smtpOptions, type MailTransport } from '../src/mail';
import { DEFAULT_SETTINGS, loadSettings, validateRecipient, type MdToKindleSettings } from '../src/settings';
import { prepareFile } from '../src/files';

const settings: MdToKindleSettings = { ...DEFAULT_SETTINGS, kindleEmail: 'reader@kindle.com', senderEmail: 'sender@example.com', smtpHost: 'localhost', smtpUsername: 'sender@example.com', passwordSecret: 'test-password' };
const password = 'test-only-password';
const attachment = prepareFile('Sample.pdf', Buffer.from('%PDF-1.4\nTest attachment bytes.'));

async function smtpServer(overrides: SMTPServerOptions = {}) {
  const certificates = await generate([{ name: 'commonName', value: 'localhost' }], { algorithm: 'sha256', keySize: 2048 });
  const messages: string[] = [];
  let authenticated = 0;
  let tlsUsed = false;
  const server = new SMTPServer({
    key: certificates.private,
    cert: certificates.cert,
    authMethods: ['PLAIN', 'LOGIN'],
    logger: false,
    onAuth(auth, session, callback) {
      authenticated++;
      tlsUsed = session.secure;
      if (auth.username !== settings.smtpUsername || auth.password !== password) return callback(Object.assign(new Error('Invalid credentials'), { responseCode: 535 }));
      callback(null, { user: auth.username });
    },
    onData(stream, _session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => { messages.push(Buffer.concat(chunks).toString()); callback(); });
    },
    ...overrides,
  });
  server.on('error', () => { /* TLS failures are asserted on the SMTP client. */ });
  server.listen(0, '127.0.0.1');
  await once(server.server, 'listening');
  const address = server.server.address();
  assert.ok(address && typeof address === 'object');
  const config = { ...settings, smtpPort: address.port, tlsMode: overrides.secure ? 'tls' as const : 'starttls' as const };
  const mailer = new MdToKindleMailer(options => nodemailer.createTransport({ ...options, tls: { ...options.tls, ca: certificates.cert } }));
  return { server, config, mailer, messages, certificates, authenticated: () => authenticated, tlsUsed: () => tlsUsed, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test('public defaults are blank and saved settings whitelist excludes credentials', () => {
  assert.equal(DEFAULT_SETTINGS.kindleEmail, '');
  const saved = loadSettings({ ...settings, password: 'DO NOT PERSIST', smtpPassword: 'DO NOT PERSIST' });
  assert.equal('password' in saved, false);
  assert.equal('smtpPassword' in saved, false);
  assert.equal(saved.passwordSecret, 'test-password');
});

test('recipient validation accepts only a single complete Kindle address', () => {
  for (const address of ['reader@kindle.com', 'reader@free.kindle.com']) validateRecipient(address);
  for (const address of ['reader@example.com', 'reader@kindle.com,other@example.com', 'reader@kindle.com\r\nBcc: other@example.com', 'reader@kindle.com(attacker@example.com)', 'reader(comment)@kindle.com', '.reader@kindle.com', 'reader..name@kindle.com', 'reader@kindle.com;other@example.com']) assert.throws(() => validateRecipient(address));
});

test('SMTP options always require encryption and certificates; attachments are in-memory buffers', () => {
  assert.equal(smtpOptions(settings, password).requireTLS, true);
  assert.equal(smtpOptions(settings, password).tls?.rejectUnauthorized, true);
  assert.equal(smtpOptions({ ...settings, tlsMode: 'tls' }, password).secure, true);
  assert.equal(smtpOptions(settings, password).disableFileAccess, true);
  assert.equal(smtpOptions(settings, password).disableUrlAccess, true);
  const message = mailMessage(settings, settings.kindleEmail, attachment);
  assert.equal(message.attachments?.length, 1);
  assert.deepEqual(message.attachments![0].content, attachment.content);
  assert.equal(message.attachments![0].path, undefined);
  assert.deepEqual(message.envelope, { from: settings.senderEmail, to: [settings.kindleEmail] });
});

test('missing credentials, invalid ports and oversized files fail before opening a connection', async () => {
  let connections = 0;
  const mailer = new MdToKindleMailer(() => { connections++; throw new Error('Unexpected connection'); });
  await assert.rejects(mailer.send(settings, null, settings.kindleEmail, attachment), /app password/);
  await assert.rejects(mailer.verify({ ...settings, smtpPort: 0 }, password), /port/);
  await assert.rejects(mailer.send({ ...settings, maxAttachmentMB: 1 }, password, settings.kindleEmail, { ...attachment, content: Buffer.alloc(1_000_001) }), /limit/);
  assert.equal(connections, 0);
});

test('STARTTLS connection test sends no message; actual send preserves attachment bytes', async () => {
  const smtp = await smtpServer();
  try {
    await smtp.mailer.verify(smtp.config, password);
    assert.equal(smtp.authenticated(), 1);
    assert.equal(smtp.tlsUsed(), true);
    assert.equal(smtp.messages.length, 0);
    await smtp.mailer.send(smtp.config, password, settings.kindleEmail, attachment);
    assert.equal(smtp.messages.length, 1);
    const message = smtp.messages[0];
    assert.match(message, /To: reader@kindle\.com/);
    assert.match(message, /Content-Type: application\/pdf/);
    assert.match(message, /filename=Sample.pdf/);
    const encoded = message.match(/Content-Transfer-Encoding: base64\r\n[^]*?\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--/);
    assert.ok(encoded);
    assert.deepEqual(Buffer.from(encoded[1].replace(/\s/g, ''), 'base64'), attachment.content);
  } finally { await smtp.close(); }
});

test('implicit TLS authenticates and sends with certificate verification', async () => {
  const smtp = await smtpServer({ secure: true });
  try {
    await smtp.mailer.send(smtp.config, password, settings.kindleEmail, attachment);
    assert.equal(smtp.tlsUsed(), true);
    assert.equal(smtp.messages.length, 1);
  } finally { await smtp.close(); }
});

test('untrusted certificates and wrong passwords fail without sending', async () => {
  const smtp = await smtpServer();
  try {
    await assert.rejects(new MdToKindleMailer().verify(smtp.config, password), /secure SMTP/);
    await assert.rejects(smtp.mailer.send(smtp.config, 'wrong', settings.kindleEmail, attachment), /Authentication failed/);
    assert.equal(smtp.messages.length, 0);
  } finally { await smtp.close(); }
});

test('servers without STARTTLS cannot receive credentials or attachments', async () => {
  const smtp = await smtpServer({ disabledCommands: ['STARTTLS'], allowInsecureAuth: true });
  try {
    await assert.rejects(smtp.mailer.send(smtp.config, password, settings.kindleEmail, attachment), /secure SMTP/);
    assert.equal(smtp.authenticated(), 0);
    assert.equal(smtp.messages.length, 0);
  } finally { await smtp.close(); }
});

test('recipient and size rejection produce actionable errors', async () => {
  const smtp = await smtpServer({ onRcptTo(_address, _session, callback) { callback(Object.assign(new Error('Rejected'), { responseCode: 550 })); } });
  try {
    await assert.rejects(smtp.mailer.send(smtp.config, password, settings.kindleEmail, attachment), /rejected the sender or Kindle/);
    assert.equal(smtp.messages.length, 0);
  } finally { await smtp.close(); }
  const large = await smtpServer({ size: 1, onData(stream, _session, callback) {
    stream.resume();
    stream.on('end', () => callback(Object.assign(new Error('Message too large'), { responseCode: 552 })));
  } });
  try {
    await assert.rejects(large.mailer.send(large.config, password, settings.kindleEmail, attachment), /attachment or its size/);
  } finally { await large.close(); }
});

test('concurrent sends are blocked and failures never trigger an automatic retry', async () => {
  let sends = 0;
  let closed = 0;
  let rejectSend!: (reason: unknown) => void;
  const transport: MailTransport = {
    verify: async () => true,
    sendMail: async () => { sends++; return new Promise((_resolve, reject) => { rejectSend = reject; }); },
    close: () => { closed++; },
  };
  const mailer = new MdToKindleMailer(() => transport);
  const first = mailer.send(settings, password, settings.kindleEmail, attachment);
  await assert.rejects(mailer.send(settings, password, settings.kindleEmail, attachment), /already in progress/);
  rejectSend({ code: 'ETIMEDOUT', response: password });
  await assert.rejects(first, /delivery may be uncertain/);
  assert.equal(sends, 1);
  assert.equal(closed, 1);
  assert.equal(mailer.isBusy, false);
  assert.doesNotMatch(explainMailError({ response: password }), new RegExp(password));
});
