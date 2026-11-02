// Renders build/icon.svg to a 1024 px PNG with a transparent background (used by make-icon.sh).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const [svgPath, outPath] = process.argv.slice(-2);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });
  const svg = fs.readFileSync(svgPath, 'utf8');
  await win.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
      ),
  );
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(outPath, img.resize({ width: 1024, height: 1024 }).toPNG());
  app.quit();
});
