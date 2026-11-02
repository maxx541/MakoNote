// 文章 → 作品 的比對邏輯（批次配對對話框與重配程式共用）。
// 傳進來的 toCn 是「繁體轉簡體」函式：Bangumi 的中文名多半是簡體，比對前兩邊都先統一成簡體。

// 標題裡的作品名：《…》優先，其次『…』「…」；都沒有就拿掉【分類】、取破折號前面
export function extractKeyword(title) {
  const m = /《([^》]+)》/.exec(title) || /『([^』]+)』/.exec(title) || /「([^」]+)」/.exec(title);
  if (m) return m[1].trim();
  let t = title
    .replace(/【[^】]*】/g, '')
    .split(/\s*(?:——|—|－|–|\s-\s|：|:|~|～)\s*/)[0]
    .trim();
  // 沒有書名號時，標題常是「作品名 簡評…」：取第一個空白前的部分；再去掉「簡評、心得…」這類字
  const first = t.split(/\s+/)[0];
  if (t.includes(' ') && first.length >= 2) t = first;
  return t.replace(/(簡評|短評|心得|隨筆|觀後感|感想|推薦|有雷|無雷).*$/, '').trim() || t;
}

export function createMatcher(toCn) {
  const norm = (s) =>
    toCn(String(s || ''))
      .toLowerCase()
      .replace(/[\s!！?？.。:：・·~～\-—_'"「」『』《》()（）/]/g, '');

  // 中英混寫（夏日口袋Summer Pockets）搜不到時，拆成中日文、英文各試一次
  function searchTerms(keyword) {
    const list = [keyword];
    const cjk = keyword.replace(/[A-Za-z0-9!?.:'&\s-]+/g, ' ').trim();
    const latin = (keyword.match(/[A-Za-z0-9][A-Za-z0-9!?.:'&\s-]*[A-Za-z0-9!?]/g) || []).join(' ').trim();
    // 去掉副標（〈…〉《…》（…）以後的部分）
    const base = keyword.replace(/[〈《「『（(].*$/, '').trim();
    for (const k of [cjk, latin, toCn(keyword), base]) if (k && k.length >= 2 && !list.includes(k)) list.push(k);
    return list;
  }

  // 名稱相似度：完全相同 100；候選以關鍵字開頭 80；候選包含關鍵字 60（多出來的字越少越好，避免選到「HD 版」這類衍生版）；
  // 關鍵字包含候選名時，候選名要夠長才算（避免「初雪」誤配「初雪櫻」）
  function nameScore(keyword, w) {
    const k = norm(keyword);
    if (k.length < 2) return 0;
    let best = 0;
    for (const n of [w.title, w.titleCn, w.romaji, ...(w.aliases || [])]) {
      const x = norm(n);
      if (!x) continue;
      if (x === k) best = Math.max(best, 100);
      else if (x.startsWith(k)) best = Math.max(best, 80 - Math.min(x.length - k.length, 20));
      else if (x.includes(k)) best = Math.max(best, 60 - Math.min(x.length - k.length, 20) / 2);
      else if (k.includes(x) && x.length >= k.length * 0.75) best = Math.max(best, 50);
    }
    return best;
  }

  // 同一個標題拆出的幾個關鍵字（原樣、只留中日文、只留英文、去副標…）取最高分；太短的片段不拿來比，免得誤配
  // 片段至少要有兩個字母或中日文（純數字、符號的片段如「1999」會誤配到不相干的作品）
  const MEANINGFUL = /[A-Za-z぀-ヿ㐀-鿿]{2,}/;
  // 樣片、預告、特典這類不是作品本體的條目，分數扣掉
  const NOT_MAIN = /样片|预告|PV|CM|特典|试映|番外|剧场版总集/i;

  function bestScore(keyword, w) {
    const ks = [keyword, ...searchTerms(keyword).filter((t) => norm(t).length >= 3 && MEANINGFUL.test(t))];
    let s = Math.max(...ks.map((k) => nameScore(k, w)));
    if (s && [w.title, w.titleCn].some((n) => NOT_MAIN.test(toCn(String(n || ''))))) s -= 30;
    return s;
  }

  // wantKind：'遊戲'｜'動畫'。類型對的加分；類型不對的標成 kindOk=false（不自動打勾）
  function rank(keyword, results, wantKind) {
    return results
      .map((w, i) => ({ w, i, s: bestScore(keyword, w) + (wantKind && w.kind === wantKind ? 15 : 0), kindOk: !wantKind || w.kind === wantKind }))
      .sort((a, b) => b.s - a.s || a.i - b.i);
  }

  return { norm, searchTerms, nameScore, bestScore, rank };
}

export const CONFIDENT = 50;
