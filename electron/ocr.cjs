// 遊戲台詞 OCR：把介面裁好的截圖交給 Windows 內建 OCR（ocr.ps1）辨識
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

// 打包後 .ps1 會在 asar 外面（app.asar.unpacked），開發時就在同一個資料夾
const SCRIPT = path.join(__dirname, 'ocr.ps1').replace('app.asar', 'app.asar.unpacked');

// 中日文的字之間 OCR 會插空白，拿掉；英文單字之間的空白保留
const CJK = '\\u3000-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef';
const CJK_GAP = new RegExp(`(?<=[${CJK}])\\s+|\\s+(?=[${CJK}])`, 'g');

function tidy(line) {
  return line.replace(CJK_GAP, '').trim();
}

// images：[{ data: PNG 位元組 }]；回傳每張圖辨識出的文字（同一張圖的多行接成一段）
function run(images, lang = 'ja') {
  const dir = path.join(os.tmpdir(), 'makonote-ocr-' + crypto.randomBytes(4).toString('hex'));
  fs.mkdirSync(dir, { recursive: true });
  const files = images.map((img, i) => {
    const f = path.join(dir, `${String(i).padStart(3, '0')}.png`);
    fs.writeFileSync(f, Buffer.from(img.data));
    return f;
  });
  const list = path.join(dir, 'list.json');
  fs.writeFileSync(list, JSON.stringify(files), 'utf8');

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-ListFile', list, '-Lang', lang],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        fs.rmSync(dir, { recursive: true, force: true });
        if (err) {
          reject(new Error('OCR 失敗：' + (stderr || err.message).trim().split('\n')[0]));
          return;
        }
        try {
          const raw = JSON.parse(stdout.trim() || '[]');
          resolve(raw.map((lines) => (Array.isArray(lines) ? lines : [lines]).map(tidy).filter(Boolean)));
        } catch {
          reject(new Error('OCR 結果無法解析'));
        }
      },
    );
  });
}

module.exports = { run };
