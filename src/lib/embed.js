// YouTube／bilibili 網址 → 內嵌播放器資訊。
// 只認這兩家；其他網址回傳 null（影片方塊會改成一般的影片檔或連結）。

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function ytTime(u) {
  const t = u.searchParams.get('t') || u.searchParams.get('start') || '';
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t);
  if (!t || !m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

export function parseVideoUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m|music)\./, '');

  // YouTube：watch?v=、youtu.be/、shorts/、embed/、live/
  if (/^(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(host)) {
    let id = '';
    let shorts = false;
    const parts = u.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') id = parts[0] || '';
    else if (parts[0] === 'watch') id = u.searchParams.get('v') || '';
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
      id = parts[1] || '';
      shorts = parts[0] === 'shorts';
    }
    if (!YT_ID.test(id)) return null;
    const start = ytTime(u);
    return {
      provider: 'youtube',
      id,
      aspect: shorts ? '9:16' : '16:9',
      watchUrl: shorts ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0${start ? `&start=${start}` : ''}`,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      label: shorts ? 'YouTube Shorts' : 'YouTube',
    };
  }

  // bilibili：bilibili.com/video/BVxxxx?p=2、b23.tv 短網址無法離線解析，不支援
  if (host === 'bilibili.com' || host === 'player.bilibili.com') {
    let bvid = '';
    let page = Number(u.searchParams.get('p') || u.searchParams.get('page')) || 1;
    const m = /\/video\/(BV[0-9A-Za-z]{10})/.exec(u.pathname);
    if (m) bvid = m[1];
    else if (host === 'player.bilibili.com') bvid = u.searchParams.get('bvid') || '';
    if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) return null;
    if (page < 1) page = 1;
    return {
      provider: 'bilibili',
      id: bvid,
      page,
      aspect: '16:9',
      watchUrl: `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ''}`,
      embedUrl: `https://player.bilibili.com/player.html?bvid=${bvid}&page=${page}&autoplay=0&high_quality=1`,
      thumb: '',
      label: 'bilibili',
    };
  }
  return null;
}

// '16:9' → 1.777…
export function aspectRatio(aspect) {
  const m = /^(\d+(?:\.\d+)?)[:/](\d+(?:\.\d+)?)$/.exec(String(aspect || ''));
  return m && Number(m[2]) ? Number(m[1]) / Number(m[2]) : 16 / 9;
}

// 一段文字是不是「只有一個影片網址」（貼上時用來判斷要不要變成播放器）
export function soleVideoUrl(text) {
  const t = String(text || '').trim();
  if (!t || /\s/.test(t)) return null;
  return parseVideoUrl(t);
}
