// 文章庫設定的預設值；實際值存在 <文章庫>/.app/settings.json

import { DEFAULT_SMART, mergeSmart } from './smartParagraph.js';

export const DEFAULT_THEME = {
  background: '', // 相對於文章庫的圖片路徑，例如 .app/backgrounds/bg-1.webp
  overlayColor: '#0b0e14',
  overlayOpacity: 0.78,
  blur: 0,
  panelOpacity: 0.86,
  accent: '#7aa7ff',
  radius: 10,
  font: 'system',
  fontSize: 16,
  lineHeight: 1.85,
  editorWidth: 760, // 編輯區最大寬度（px）；0＝滿版（左右只留小邊距）
  editorBackground: 'cover', // cover：文章的遊戲封面或封面圖／global：全域背景／none
};

export const DEFAULT_SETTINGS = {
  theme: DEFAULT_THEME,
  image: { maxEdge: 1920, format: 'webp', quality: 0.85, fetchRemote: true },
  // menu：編輯器右鍵選單裡放哪些常用動作、順序（見 lib/editorActions.js）
  writing: { idleSeconds: 120, menu: null, smart: DEFAULT_SMART },
  view: { mode: 'gal', sort: 'recent' },
  // 小貼圖：folders 是直接參考的外部資料夾 [{ path, enabled }]，不複製檔案；corner：random / left / right
  // hideWhenCovered：貼圖位置底下有內容（卡片、文字）就不顯示；maxArticles：目前列出的文章超過幾篇就不顯示（0＝不限）
  stickers: { enabled: false, folders: [], corner: 'random', size: 140, opacity: 0.95, hideWhenCovered: true, maxArticles: 0 },
  // 插入遊戲台詞：上次用的語言、是否一張合成一行、要忽略的字詞（辨識結果裡出現就拿掉）
  ocr: { lang: 'ja', join: true, ignore: [], builtin: true },
  // 巴哈版本的圖片寬度（大中小，單位 px；原尺寸＝不加 width）
  bahamut: { sizes: { large: 500, medium: 370, small: 250 } },
  // Cloudinary 圖床：auto＝按完工時詢問是否上傳；bahamutFormat＝巴哈版本用的圖片網址格式（original｜jpg）
  cloud: { auto: false, bahamutFormat: 'original' },
  // 側欄收合狀態：{ 'sec:folders': true, 'dir:巴哈小屋': true }（有的鍵就是收起來的）
  sidebar: { collapsed: {}, hidden: false }, // hidden＝整個側邊欄收進左邊
  collections: [],
};

export const VIEW_MODE_IDS = ['gal', 'anime', 'blog'];

export const FONTS = {
  system: { label: '系統預設', css: '"Segoe UI", "Microsoft JhengHei UI", "Microsoft JhengHei", sans-serif' },
  jhenghei: { label: '微軟正黑體', css: '"Microsoft JhengHei", sans-serif' },
  noto: { label: '思源黑體（需已安裝）', css: '"Noto Sans TC", "Source Han Sans TC", "Microsoft JhengHei", sans-serif' },
  serif: { label: '明體', css: '"Noto Serif TC", "Source Han Serif TC", "PMingLiU", serif' },
};

export function mergeSettings(saved) {
  const s = saved || {};
  const view = { ...DEFAULT_SETTINGS.view, ...(s.view || {}) };
  if (!VIEW_MODE_IDS.includes(view.mode)) view.mode = 'gal';
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    theme: { ...DEFAULT_THEME, ...(s.theme || {}) },
    image: { ...DEFAULT_SETTINGS.image, ...(s.image || {}) },
    writing: { ...DEFAULT_SETTINGS.writing, ...(s.writing || {}), smart: mergeSmart(s.writing && s.writing.smart) },
    stickers: { ...DEFAULT_SETTINGS.stickers, ...(s.stickers || {}) },
    ocr: { ...DEFAULT_SETTINGS.ocr, ...Object.fromEntries(Object.entries(s.ocr || {}).filter(([k]) => k in DEFAULT_SETTINGS.ocr)) },
    bahamut: { sizes: { ...DEFAULT_SETTINGS.bahamut.sizes, ...((s.bahamut && s.bahamut.sizes) || {}) } },
    cloud: { ...DEFAULT_SETTINGS.cloud, ...(s.cloud || {}) },
    sidebar: { collapsed: { ...((s.sidebar && s.sidebar.collapsed) || {}) }, hidden: !!(s.sidebar && s.sidebar.hidden) },
    view,
    collections: Array.isArray(s.collections) ? s.collections : [],
  };
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0;
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// 主題 → CSS 變數，整個介面都讀這些變數
export function themeVars(t) {
  return {
    '--accent': t.accent,
    '--accent-rgb': hexToRgb(t.accent),
    '--radius': `${t.radius}px`,
    '--font': (FONTS[t.font] || FONTS.system).css,
    '--editor-font-size': `${t.fontSize}px`,
    '--editor-line-height': t.lineHeight,
    '--editor-width': t.editorWidth ? `${t.editorWidth}px` : '100%',
    '--overlay-rgb': hexToRgb(t.overlayColor),
    '--overlay-opacity': t.overlayOpacity,
    '--panel-opacity': t.panelOpacity,
    '--bg-blur': `${t.blur}px`,
  };
}
