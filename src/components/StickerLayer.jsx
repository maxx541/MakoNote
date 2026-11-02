import { useEffect, useRef, useState } from 'react';
import { extUrl } from '../lib/util.js';

// 這些是版面的空白底（容器本身），貼圖蓋在上面沒關係；其他元素（卡片、文字、按鈕、圖片）都算內容
const BLANK = ['app', 'body', 'main', 'backdrop', 'backdrop-img', 'backdrop-mask', 'gal-layout', 'gal', 'gal-grid', 'blog', 'shelf', 'shelf-row', 'game-page', 'game-articles', 'editor-page', 'editor-scroll', 'editor-flow', 'editor-cols', 'editor-col', 'welcome'];

function isBlank(el) {
  if (!el || el === document.documentElement || el === document.body || el.id === 'root') return true;
  return BLANK.some((c) => el.classList.contains(c));
}

// 貼圖範圍內取幾個點，看最上層是不是內容（貼圖本身 pointer-events: none，不會被量到）
function covered(rect) {
  const xs = [0.15, 0.5, 0.85].map((f) => rect.left + rect.width * f);
  const ys = [0.2, 0.5, 0.85].map((f) => rect.top + rect.height * f);
  for (const x of xs) for (const y of ys) if (!isBlank(document.elementFromPoint(x, y))) return true;
  return false;
}

// 小貼圖：一次只放一張，固定在視窗左下或右下角；每次換頁隨機換圖（位置設成「隨機」時角落也會換）。
// 只出現在空白處：貼圖位置底下有卡片或文字（文章多、畫面被填滿）就先藏起來，捲到空白處或換頁再出現
export default function StickerLayer({ files, corner, size, opacity, trigger, withSidebar, hideWhenCovered, tooMany }) {
  const [pick, setPick] = useState(null);
  const [hidden, setHidden] = useState(false);
  const imgRef = useRef(null);
  // files 每次重繪都是新陣列；用內容當依據，拉設定拉桿（大小、透明度）時才不會一直重新抽圖
  const filesKey = files.join('|');
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    const files = filesRef.current;
    if (!files.length) {
      setPick(null);
      return;
    }
    setPick((prev) => {
      let file = files[Math.floor(Math.random() * files.length)];
      // 盡量不要連續兩頁同一張
      if (prev && files.length > 1 && file === prev.file) file = files[(files.indexOf(file) + 1) % files.length];
      const side = corner === 'left' || corner === 'right' ? corner : Math.random() < 0.5 ? 'left' : 'right';
      return { file, side };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, corner, trigger]);

  // 版面變動（換頁、捲動、縮放視窗、內容載入）時重新檢查有沒有蓋到內容
  useEffect(() => {
    if (!pick || !hideWhenCovered) {
      setHidden(false);
      return undefined;
    }
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = imgRef.current;
        if (el) setHidden(covered(el.getBoundingClientRect()));
      });
    };
    check();
    const timer = setInterval(check, 1500); // 圖片延遲載入、面板展開等不會觸發事件的變化
    window.addEventListener('resize', check);
    document.addEventListener('scroll', check, true);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      window.removeEventListener('resize', check);
      document.removeEventListener('scroll', check, true);
    };
  }, [pick, hideWhenCovered, size, trigger]);

  if (!pick) return null;
  return (
    <img
      ref={imgRef}
      className={'sticker ' + pick.side + (withSidebar ? ' with-sidebar' : '') + (hidden || tooMany ? ' covered' : '')}
      src={extUrl(pick.file)}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ width: size, height: size, opacity: hidden || tooMany ? 0 : opacity }}
    />
  );
}
