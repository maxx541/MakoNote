// 介面用的小圖示（標題列、歡迎畫面）：從 build/icon.png 縮出來
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
app.whenReady().then(() => {
  const src = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  fs.mkdirSync(path.join(__dirname, '..', 'src', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'assets', 'logo.png'), src.resize({ width: 128, height: 128, quality: 'best' }).toPNG());
  app.quit();
});
