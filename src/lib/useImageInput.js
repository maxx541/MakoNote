import { useEffect, useRef, useState } from 'react';

// 讓某個區域接受圖片：從檔案總管拖進來，或滑鼠停在上面（或裡面有焦點）時按 Ctrl+V 貼上剪貼簿的圖片。
// watch：區域是晚一點才出現的（例如資料載入後），把決定它有沒有出現的值放這裡，出現時才綁上去
// onFiles 收到圖片檔（File[]）；回傳 over＝正拖著圖片經過，拿來標示放得下去
export function useImageInput(ref, onFiles, { paste = true, multiple = true, watch } = {}) {
  const [over, setOver] = useState(false);
  const cb = useRef(onFiles);
  cb.current = onFiles;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let hover = false;
    const imagesOf = (dt) => [...(dt ? dt.files : [])].filter((f) => f.type.startsWith('image/'));
    const give = (files) => cb.current(multiple ? files : files.slice(0, 1));

    const onOver = (e) => {
      if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) {
        e.preventDefault();
        setOver(true);
      }
    };
    const onLeave = (e) => {
      if (!el.contains(e.relatedTarget)) setOver(false);
    };
    const onDrop = (e) => {
      setOver(false);
      const files = imagesOf(e.dataTransfer);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      give(files);
    };
    const onEnter = () => {
      hover = true;
    };
    const onOut = () => {
      hover = false;
    };
    const onPaste = (e) => {
      if (!hover && !el.contains(document.activeElement)) return;
      const files = imagesOf(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      give(files);
    };

    el.addEventListener('dragover', onOver);
    el.addEventListener('dragleave', onLeave);
    el.addEventListener('drop', onDrop);
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onOut);
    if (paste) window.addEventListener('paste', onPaste, true);
    return () => {
      el.removeEventListener('dragover', onOver);
      el.removeEventListener('dragleave', onLeave);
      el.removeEventListener('drop', onDrop);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onOut);
      window.removeEventListener('paste', onPaste, true);
    };
  }, [ref, paste, multiple, watch]);

  return over;
}
