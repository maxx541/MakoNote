import { useEffect, useRef, useState } from 'react';

// 編輯頁的背景：跟著文章一起捲動，文章多長就鋪多長。
// 圖片依寬度縮放（太矮就放大到至少一個視窗高），不夠長的地方上下鏡射接下去，接縫看不出來
export default function ScrollBackdrop({ image }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setNatural(null);
    if (!image) return undefined;
    let dead = false;
    const img = new Image();
    img.onload = () => !dead && setNatural({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.src = image;
    return () => {
      dead = true;
    };
  }, [image]);

  const tiles = [];
  if (image && natural && size.w > 0) {
    const scale = Math.max(size.w / natural.w, window.innerHeight / natural.h);
    const tw = natural.w * scale;
    const th = natural.h * scale;
    const count = Math.min(60, Math.max(1, Math.ceil(size.h / th)));
    for (let i = 0; i < count; i += 1) {
      tiles.push(
        <img
          key={i}
          className="sbd-img"
          src={image}
          alt=""
          draggable={false}
          style={{ left: (size.w - tw) / 2, top: i * th, width: tw, height: th, transform: i % 2 ? 'scaleY(-1)' : undefined }}
        />,
      );
    }
  }

  return (
    <div ref={ref} className="sbd" aria-hidden="true">
      <div className="sbd-tiles">{tiles}</div>
      <div className="sbd-mask" />
    </div>
  );
}
