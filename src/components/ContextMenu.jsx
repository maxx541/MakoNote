import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

// 右鍵選單：直接掛在整個畫面的最上層，不會被背景、遮罩、小貼圖或對話框蓋住。
// 在選單外面按滑鼠任一鍵、按 Esc、捲動、縮放視窗或切到別的視窗都會關閉；點了項目也會關閉。
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const close = () => closeRef.current();
    const outside = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      close();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    // 捕獲階段監聽：就算底下的元件（例如編輯器）把事件攔掉，選單也收得到
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('contextmenu', outside, true);
    window.addEventListener('wheel', outside, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('contextmenu', outside, true);
      window.removeEventListener('wheel', outside, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, []);

  // 靠近視窗邊緣時往內收，避免選單被切掉（用實際量到的大小）
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) });
  }, [x, y, items]);

  return createPortal(
    <div ref={ref} className="menu" role="menu" style={pos} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}>
      {items.map((it) => (
        <button
          key={it.label}
          role="menuitem"
          className={'menu-item' + (it.danger ? ' danger' : '')}
          onClick={() => {
            onClose();
            it.run();
          }}
        >
          {it.icon && <Icon name={it.icon} size={16} />}
          {it.label}
        </button>
      ))}
    </div>,
    // 掛在 .app 底下才吃得到主題的字型與顏色變數
    document.querySelector('.app') || document.body,
  );
}
