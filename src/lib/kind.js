// Galgame／動畫模式收哪些心得，只看兩件事：
//   1. 文章的「主題」欄位（巴哈的分類、Anytype 的物件類型、自己填的主題都在這裡）：
//      主題含 gal → Galgame；主題含「動畫」或 anime → 動畫。
//   2. 文章連結的作品（front matter 的 works）：連到遊戲的也算 Galgame、連到動畫的也算動畫，
//      例如主題是「旅遊」但連到遊戲的聖地巡禮文章。
// 不看標籤、標題等其他線索；判斷不準就直接改文章的主題或作品連結。部落格模式顯示全部。
export function modeOf(meta) {
  const topic = (meta && meta.topic) || '';
  if (/gal/i.test(topic)) return 'gal';
  if (/動畫|anime|アニメ/i.test(topic)) return 'anime';
  return '';
}

// 已連結作品是遊戲還是動畫（配對時用來檢查類型有沒有對上）
export function workMode(work) {
  if (!work) return '';
  if (work.source === 'vndb' || work.kind === '遊戲') return 'gal';
  if (work.kind === '動畫') return 'anime';
  return '';
}

// 這篇文章要不要出現在 mode 模式裡（games：作品資料 data.games）
export function inMode(meta, mode, games) {
  if (mode === 'blog') return true;
  if (modeOf(meta) === mode) return true;
  return ((meta && meta.works) || []).some((id) => workMode(games[id]) === mode);
}

export const MODE_LABEL = { gal: 'Galgame', anime: '動畫', blog: '部落格' };
