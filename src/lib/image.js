// 貼上或插入的圖片：依設定縮小、轉檔，再交給主程式存到文章的 assets/

const FORMATS = {
  webp: { type: 'image/webp', ext: 'webp' },
  jpeg: { type: 'image/jpeg', ext: 'jpg' },
  png: { type: 'image/png', ext: 'png' },
};

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

function extOf(blob, name = '') {
  return EXT_BY_TYPE[blob.type] || (name.split('.').pop() || 'png').toLowerCase();
}

// 回傳 { data: ArrayBuffer, ext }
export async function processImage(blob, settings, name = '') {
  const ext = extOf(blob, name);
  // 動圖與向量圖轉檔會壞掉，原樣保存
  if (ext === 'gif' || ext === 'svg') return { data: await blob.arrayBuffer(), ext };

  const target = settings.format === 'original' ? null : FORMATS[settings.format] || FORMATS.webp;
  const bitmap = await createImageBitmap(blob);
  const maxEdge = Number(settings.maxEdge) || 0;
  const scale = maxEdge && Math.max(bitmap.width, bitmap.height) > maxEdge ? maxEdge / Math.max(bitmap.width, bitmap.height) : 1;

  if (!target && scale === 1) {
    bitmap.close();
    return { data: await blob.arrayBuffer(), ext };
  }

  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const outType = target ? target.type : blob.type || 'image/png';
  const out = await canvas.convertToBlob({ type: outType, quality: Number(settings.quality) || 0.85 });

  // 沒有縮小、轉完反而更大，就留原檔
  if (scale === 1 && out.size >= blob.size) return { data: await blob.arrayBuffer(), ext };
  return { data: await out.arrayBuffer(), ext: target ? target.ext : ext };
}
