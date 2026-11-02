// 把 build/icon.png 縮成多個尺寸，包成 Windows 的 .ico（內嵌 PNG）。用 Electron 內建的 nativeImage 縮圖，不用另外裝套件
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
  const src = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  const sizes = [256, 128, 64, 48, 32, 24, 16];
  const pngs = sizes.map((s) => src.resize({ width: s, height: s, quality: 'best' }).toPNG());
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const dirs = sizes.map((s, i) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(s === 256 ? 0 : s, 0);
    d.writeUInt8(s === 256 ? 0 : s, 1);
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(pngs[i].length, 8);
    d.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return d;
  });
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([head, ...dirs, ...pngs]));
  console.log('icon.ico', offset, 'bytes');
  app.quit();
});
