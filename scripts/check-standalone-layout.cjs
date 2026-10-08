const { app, BrowserWindow } = require('electron');
const { join, resolve } = require('node:path');
const { mkdir, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
app.setPath('userData', join(tmpdir(), 'md-to-kindle-layout-check'));
const output = resolve(__dirname, '../artifacts/layout-check');
const cases = [[1160, 850, 1], [850, 650, 1], [1600, 1000, 1], [1160, 850, 1.25], [850, 650, 1.25], [850, 650, 1.5]];
const deadline = setTimeout(() => { console.error('Layout check timed out.'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1160, height: 850, show: false, autoHideMenuBar: true, webPreferences: { preload: resolve(__dirname, '../tests/layout-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const run = source => window.webContents.executeJavaScript(source);
  const pause = () => new Promise(resolvePause => setTimeout(resolvePause, 120));
  const wait = async expression => {
    for (let count = 0; count < 100; count++) { if (await run(expression)) return; await new Promise(resolveWait => setTimeout(resolveWait, 40)); }
    throw new Error(`UI did not settle: ${expression}`);
  };
  try {
    await window.loadFile(resolve(__dirname, '../standalone-dist/index.html'));
    await wait(`document.querySelectorAll('#files input').length === 60`);
    await run(`document.getElementById('select-all').click()`);
    await wait(`!document.getElementById('refresh').disabled`);
    await run(`document.getElementById('refresh').click()`);
    await wait(`!document.getElementById('send').disabled`);
    const results = [];
    for (const [width, height, zoom] of cases) {
      window.setSize(width, height); window.webContents.setZoomFactor(zoom); await pause();
      const metrics = await run(`(() => {
        const review=document.getElementById('refresh'), button=review.getBoundingClientRect(), library=document.querySelector('.library').getBoundingClientRect();
        const hit=document.elementFromPoint(button.x+button.width/2,button.y+button.height/2);
        const reader=document.getElementById('preview-details'); reader.scrollTop=reader.scrollHeight;
        const end=document.getElementById('document-end').getBoundingClientRect(), pane=reader.getBoundingClientRect();
        return { viewport:[innerWidth,innerHeight], reviewVisible:button.width>0 && button.height>0 && button.top>=0 && button.bottom<=innerHeight && button.top>=library.top && button.bottom<=library.bottom && (hit===review || review.contains(hit)),
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1, verticalOverflow:document.documentElement.scrollHeight>innerHeight+1,
          previewHeight:reader.clientHeight, previewScrollable:reader.scrollHeight>reader.clientHeight && reader.scrollTop>0,
          lastParagraphReachable:end.bottom<=pane.bottom+1 && end.bottom>pane.top, previewTabIndex:reader.tabIndex };
      })()`);
      if (!metrics.reviewVisible || metrics.horizontalOverflow || metrics.verticalOverflow || !metrics.previewScrollable || !metrics.lastParagraphReachable || metrics.previewHeight <= 0 || metrics.previewTabIndex !== 0) {
        throw new Error(`Layout failed at ${width}x${height}, zoom ${zoom}: ${JSON.stringify(metrics)}`);
      }
      results.push({ size: [width, height], zoom, ...metrics });
      if (process.argv.includes('--screenshots') && [1, 1.5].includes(zoom)) {
        await mkdir(output, { recursive: true }); await pause();
        await writeFile(join(output, `${width}-${height}-${zoom}.png`), (await window.webContents.capturePage()).toPNG());
      }
    }
    // Test the actual Chromium click target in a row's padding and badge area.
    window.setSize(1160, 850); window.webContents.setZoomFactor(1); await pause();
    await run(`(() => { const row=document.querySelectorAll('#files .file-item')[1]; row.scrollIntoView({block:'nearest'}); const rect=row.getBoundingClientRect(); const hit=document.elementFromPoint(rect.left+2,rect.top+rect.height/2); if (!hit || !row.contains(hit)) throw new Error('Row padding is not a reachable click target.'); hit.click(); })()`);
    await wait(`document.getElementById('filename').textContent.startsWith('1 ') && !document.getElementById('send').disabled`);
    const interaction = await run(`({selected:document.querySelectorAll('#files input:checked').length, previewReset:document.getElementById('preview-details').scrollTop===0})`);
    if (interaction.selected !== 60 || !interaction.previewReset) throw new Error('Row preview changed checkboxes or retained the previous scroll offset.');
    await mkdir(output, { recursive: true }); await writeFile(join(output, 'results.json'), JSON.stringify({ cases: results, interaction, sentEmails: 0 }, null, 2));
    console.log(`Passed ${results.length} default/minimum/large/zoom layout cases, full-document scrolling and row preview. No email sent.`);
    clearTimeout(deadline); app.quit();
  } catch (error) { console.error(error.message); clearTimeout(deadline); app.exit(1); }
}).catch(error => { console.error(error.message); clearTimeout(deadline); app.exit(1); });
