import { SharedProfileStore } from '../src/shared-profile';
import { MdToKindleMailer } from '../src/mail';

// Deliberately print no account identifiers, password, ciphertext or SMTP trace.
// The password is unlocked only in memory for this explicit connection test.
try {
  const profile = new SharedProfileStore();
  const settings = await profile.settings();
  await new MdToKindleMailer().verify(settings, await profile.secret());
  console.log('The global email profile authenticated successfully. No email was sent.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The global connection test failed.');
  process.exitCode = 1;
}
