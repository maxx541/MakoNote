// 內建的 OCR 排除表：遊戲介面上常見、不是台詞的字（存檔、讀檔、自動、快進、紀錄、回標題…）。
// 來源：隨機抽 26 款 galgame 的截圖各 5 張辨識，挑出跨遊戲重複出現的介面字，再補上各家常見的同義字。
// 規則：
//   WORDS（英文）  整個單字相符才拿掉，容忍 OCR 把字母拆開（S A V E）、O 看成 0、I 看成 l／1
//   LINES（中日文）一行只有這個字才整行拿掉；長度 4 以上的（不會是台詞的一部分）則出現在行內也拿掉
// 使用者自己加的字詞（辨識視窗裡的「忽略的字詞」）不受這些規則限制，出現就拿掉。

export const BUILTIN_WORDS = [
  'SAVE', 'LOAD', 'Q.SAVE', 'Q.LOAD', 'QSAVE', 'QLOAD', 'QUICKSAVE', 'QUICKLOAD',
  'AUTO', 'SKIP', 'LOG', 'BACKLOG', 'HISTORY', 'RECORD', 'BACK', 'RETURN', 'TITLE',
  'JUMP', 'SCENE JUMP', 'SCENEJUMP', 'SCENE BACK', 'SCENEBACK', 'REPEAT', 'VOICE',
  'EXIT', 'CONFIG', 'OPTION', 'MENU', 'HIDE', 'CLOSE',
  'RETIJRN', 'RETLJRN', // OCR 常把 RETURN 的 U 看成 IJ、LJ
];

export const BUILTIN_LINES = [
  // 繁中、簡中
  '返回', '返回前個畫面', '返回前一個畫面', '返回遊戲', '返回標題', '回標題', '標題', '标题', '退出', '退出遊戲', '退出游戏',
  '保存', '保存進度', '保存进度', '存檔', '存档', '讀檔', '读档', '讀取', '读取', '快存', '快取', '快速存檔', '快速讀檔',
  '設置', '设置', '設定', '控制', '日誌', '日志', '履歷', '歷史', '回想', '語音書籤', '语音书签', '快進', '快进', '快轉',
  '自動', '自动', '跳過', '跳过', '隱藏', '隐藏', '致謝名單', '致谢名单',
  // 日文
  'オート', 'スキップ', 'ログ', 'セーブ', 'ロード', 'クイックセーブ', 'クイックロード', 'コンフィグ', 'メニュー',
  'タイトル', 'ヒストリー', 'バックログ', 'シーンジャンプ', 'リピート', 'ボイス',
];

const stripSpace = (s) => s.replace(/[\s·.。,，、:：・\-ー]/g, '');

const ESC = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 一個英文詞 → 容忍 OCR 錯誤的規則運算式
function wordRegex(term) {
  const parts = [...term].map((c) => {
    if (c === ' ') return '\\s*';
    if (c === '.') return '\\s*[.·・]?\\s*';
    const u = c.toUpperCase();
    if (u === 'O') return '[O0]';
    if (u === 'I') return '[Il1|]';
    if (u === 'L') return '[Ll1|]';
    return ESC(c);
  });
  return parts.join('\\s*');
}

const WORD_RE = new RegExp(`(?<![A-Za-z0-9])(?:${BUILTIN_WORDS.map(wordRegex).join('|')})(?![A-Za-z0-9])`, 'gi');
const LONG_LINES = BUILTIN_LINES.filter((t) => [...t].length >= 4);
const LINE_SET = new Set(BUILTIN_LINES.map(stripSpace));

// 套用內建排除表；回傳處理後的一行（整行都是介面字就回傳空字串）
export function applyBuiltin(line) {
  let s = line.replace(WORD_RE, ' ');
  if (LINE_SET.has(stripSpace(s))) return '';
  for (const t of LONG_LINES) if (s.includes(t)) s = s.split(t).join(' ');
  s = s.replace(/\s+/g, ' ').trim();
  return LINE_SET.has(stripSpace(s)) ? '' : s;
}
