// 本程式自訂的方塊：併排圖片、內嵌影片（YouTube／bilibili）、提示框（Callout）、書籤連結。
// 存成 Markdown 的寫法在 lib/markdown.js，轉巴哈／FB 等格式時在 lib/formats.js 的 flatten 退化成圖片或連結。
import { useEffect, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import Icon from './Icon.jsx';
import { parseVideoUrl, aspectRatio } from '../lib/embed.js';
import { rowImages, imagesProp, rememberRatio } from '../lib/imageRow.js';
import { api } from '../lib/util.js';

const openExternal = (url) => url && window.open(url);

// ---------- 併排圖片 ----------

function ImageRow({ block, editor }) {
  const list = rowImages(block);
  const rowRef = useRef(null);
  const [sizes, setSizes] = useState({});
  const [live, setLive] = useState(null); // 拖分隔線時暫時的比重 { weights, snap }
  const set = (next) => {
    if (next.length === 0) editor.removeBlocks([block]);
    else if (next.length === 1) editor.replaceBlocks([block], [{ type: 'image', props: { url: next[0].url, name: next[0].name || '' } }]);
    else editor.updateBlock(block, { props: { images: imagesProp(next) } });
  };
  const move = (i, d) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    set(next);
  };
  // 拿出這一排：放成這排下面的單張圖片
  const takeOut = (i) => {
    const next = list.filter((_, k) => k !== i);
    editor.insertBlocks([{ type: 'image', props: { url: list[i].url, name: list[i].name || '' } }], block, 'after');
    set(next);
  };
  const ratioAt = (i) => sizes[list[i].url] || 4 / 3;
  // 每張的寬度比重：調過的用存起來的，沒調過就是圖片比例（＝等高）
  const weightAt = (i) => (list[i].w > 0 ? list[i].w : ratioAt(i));
  const shown = (i) => (live ? live.weights[i] : weightAt(i));

  // 拖兩張之間的分隔線：只改這兩張的比例（整排總寬不變）。兩張接近等高或等寬時吸附一下，再拉才會脫離
  function startSplit(e, i) {
    e.preventDefault();
    e.stopPropagation();
    const row = rowRef.current;
    const items = [...row.querySelectorAll('.img-row-item')];
    const pxA = items[i].getBoundingClientRect().width;
    const pxB = items[i + 1].getBoundingClientRect().width;
    const both = pxA + pxB;
    const W = list.map((_, k) => weightAt(k));
    const pair = W[i] + W[i + 1];
    const rA = ratioAt(i);
    const rB = ratioAt(i + 1);
    const targets = [(both * rA) / (rA + rB), both / 2]; // 等高、等寬
    const SNAP = 10;
    const startX = e.clientX;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let result = W;
    const moveFn = (ev) => {
      let a = Math.max(60, Math.min(both - 60, pxA + ev.clientX - startX));
      let snap = false;
      for (const t of targets) {
        if (Math.abs(a - t) <= SNAP) {
          a = t;
          snap = true;
          break;
        }
      }
      result = W.map((w, k) => (k === i ? (pair * a) / both : k === i + 1 ? (pair * (both - a)) / both : w));
      setLive({ weights: result, snap, at: i });
    };
    const up = () => {
      handle.removeEventListener('pointermove', moveFn);
      handle.removeEventListener('pointerup', up);
      setLive(null);
      // 回到預設的等高就不用另外存比重
      const base = list.map((_, k) => ratioAt(k));
      const isDefault = result.every((w, k) => Math.abs(w / base[k] - result[0] / base[0]) < 0.004);
      const scale = result.reduce((a, b) => a + b, 0) / list.length;
      set(list.map((x, k) => ({ ...x, w: isDefault ? undefined : Math.round((result[k] / scale) * 1000) / 1000 })));
    };
    handle.addEventListener('pointermove', moveFn);
    handle.addEventListener('pointerup', up);
  }

  return (
    <div ref={rowRef} className="img-row" contentEditable={false} data-count={list.length}>
      {list.map((img, i) => (
        <figure
          key={img.url + i}
          className="img-row-item"
          style={{ flex: `${shown(i)} 1 0` }}
          draggable
          data-row-index={i}
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData('application/x-galnote-rowimg', JSON.stringify({ block: block.id, index: i }));
            e.dataTransfer.effectAllowed = 'move';
          }}
        >
          <img
            src={img.url}
            alt={img.name || ''}
            draggable={false}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              rememberRatio(img.url, w, h);
              if (w && h) setSizes((s) => (s[img.url] === w / h ? s : { ...s, [img.url]: w / h }));
            }}
          />
          {editor.isEditable && (
            <div className="img-row-tools">
              {i > 0 && (
                <button title="往左移" onClick={() => move(i, -1)}>
                  <Icon name="back" size={14} />
                </button>
              )}
              {i < list.length - 1 && (
                <button title="往右移" onClick={() => move(i, 1)}>
                  <Icon name="chevron" size={14} />
                </button>
              )}
              <button title="移出併排（放到這排下面）" onClick={() => takeOut(i)}>
                <Icon name="external" size={14} />
              </button>
              <button title="刪除這張" onClick={() => set(list.filter((_, k) => k !== i))}>
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
          {editor.isEditable && i < list.length - 1 && (
            <span
              className={'img-row-split' + (live && live.at === i && live.snap ? ' snap' : '')}
              title="左右拖曳調整兩張的大小；接近同大小會吸附，再拉才脫離"
              onPointerDown={(e) => startSplit(e, i)}
            />
          )}
        </figure>
      ))}
    </div>
  );
}

export const ImageRowBlock = createReactBlockSpec(
  { type: 'imageRow', propSchema: { images: { default: '[]' } }, content: 'none' },
  { render: ImageRow },
);

// ---------- 內嵌影片 ----------

function VideoEmbed({ block, editor }) {
  const info = parseVideoUrl(block.props.url);
  const boxRef = useRef(null);
  const [dragW, setDragW] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  const aspect = block.props.aspect || (info && info.aspect) || '16:9';
  const ratio = aspectRatio(aspect);
  const saved = Number(block.props.width) || 0;
  // 直式影片（Shorts 等）沒調過大小時預設 360px 寬，不然滿版會高到超出畫面
  const width = dragW !== null ? dragW : saved || (ratio < 1 ? 360 : 0);

  // 拖右下角：寬度改變、高度依比例跟著變（整體等比例縮放），最寬不超過編輯欄
  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const box = boxRef.current;
    const max = box.parentElement.getBoundingClientRect().width;
    const startW = box.getBoundingClientRect().width;
    const startX = e.clientX;
    const startY = e.clientY;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let w = startW;
    const moveFn = (ev) => {
      // 往右或往下拉都算放大：取兩個方向換算成寬度後較大的變化
      const dx = ev.clientX - startX;
      const dy = (ev.clientY - startY) * ratio;
      const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      w = Math.max(200, Math.min(max, startW + d));
      setDragW(w);
    };
    const up = () => {
      handle.removeEventListener('pointermove', moveFn);
      handle.removeEventListener('pointerup', up);
      setDragW(null);
      const next = w >= max - 2 ? 0 : Math.round(w);
      if (next !== saved) editor.updateBlock(block, { props: { width: next } });
    };
    handle.addEventListener('pointermove', moveFn);
    handle.addEventListener('pointerup', up);
  }

  if (!info) {
    return (
      <div className="embed-card" contentEditable={false}>
        <Icon name="video" size={20} />
        <span className="ellipsis">{block.props.url || '沒有網址'}</span>
        <span className="muted small">（不是 YouTube 或 bilibili 的網址，存檔時保留成連結）</span>
      </div>
    );
  }

  return (
    <div className="embed-wrap" contentEditable={false}>
      <div ref={boxRef} className="embed-box" style={{ width: width ? `${width}px` : '100%', aspectRatio: String(ratio) }}>
        {online ? (
          <iframe
            src={info.embedUrl}
            title={info.label}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        ) : (
          // 離線時只顯示連結卡片，按下方連結用瀏覽器開啟
          <button className="embed-poster" onClick={() => openExternal(info.watchUrl)} title="目前離線，用瀏覽器開啟">
            <span className="embed-play">
              <Icon name="external" size={28} />
              離線中
            </span>
          </button>
        )}
        {dragW !== null && <div className="embed-dragging" />}
        {editor.isEditable && <span className="embed-resize" onPointerDown={startResize} title="拖曳等比例縮放" />}
      </div>
      <div className="embed-foot">
        <span className="muted small">{info.label}</span>
        <button className="link-btn small" onClick={() => openExternal(info.watchUrl)}>
          {info.watchUrl}
        </button>
        {editor.isEditable && (
          <select
            className="embed-aspect"
            value={aspect}
            title="影片比例"
            onChange={(e) => editor.updateBlock(block, { props: { aspect: e.target.value } })}
          >
            {['16:9', '4:3', '1:1', '9:16'].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export const VideoEmbedBlock = createReactBlockSpec(
  { type: 'videoEmbed', propSchema: { url: { default: '' }, aspect: { default: '' }, width: { default: 0 } }, content: 'none' },
  { render: VideoEmbed },
);

// ---------- 提示框 ----------

export const CALLOUT_KINDS = [
  { id: 'note', label: '備註' },
  { id: 'tip', label: '提示' },
  { id: 'important', label: '重要' },
  { id: 'warning', label: '注意' },
  { id: 'caution', label: '警告' },
];

function Callout({ block, editor, contentRef }) {
  const idx = Math.max(0, CALLOUT_KINDS.findIndex((k) => k.id === block.props.kind));
  const kind = CALLOUT_KINDS[idx];
  return (
    <div className={'callout callout-' + kind.id}>
      <button
        className="callout-kind"
        contentEditable={false}
        title="點一下換類型"
        onClick={() => editor.isEditable && editor.updateBlock(block, { props: { kind: CALLOUT_KINDS[(idx + 1) % CALLOUT_KINDS.length].id } })}
      >
        <Icon name="callout" size={16} />
        {kind.label}
      </button>
      <div className="callout-text" ref={contentRef} />
    </div>
  );
}

export const CalloutBlock = createReactBlockSpec(
  { type: 'callout', propSchema: { kind: { default: 'note' } }, content: 'inline' },
  { render: Callout },
);

// ---------- 書籤連結 ----------

function Bookmark({ block, editor }) {
  const { url, title, desc, image } = block.props;
  const asked = useRef(false);
  // 新插入、還沒有標題的書籤：請主程式抓網頁標題（失敗就只顯示網址）
  useEffect(() => {
    if (!url || title || asked.current || !editor.isEditable) return;
    asked.current = true;
    api.net
      .fetchMeta(url)
      .then((m) => {
        if (m && (m.title || m.desc) && editor.getBlock(block.id)) editor.updateBlock(block.id, { props: { title: m.title || '', desc: m.desc || '', image: m.image || '' } });
      })
      .catch(() => {});
  }, [url, title, editor, block.id]);
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = url;
  }
  return (
    <div className="bookmark" contentEditable={false} onClick={() => openExternal(url)} title={url}>
      <div className="bookmark-text">
        <div className="bookmark-title ellipsis">{title || url || '沒有網址'}</div>
        {desc && <div className="bookmark-desc clamp2">{desc}</div>}
        <div className="bookmark-host muted small ellipsis">
          <Icon name="link" size={12} /> {host}
        </div>
      </div>
      {image && <img className="bookmark-img" src={image} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
    </div>
  );
}

export const BookmarkBlock = createReactBlockSpec(
  { type: 'bookmark', propSchema: { url: { default: '' }, title: { default: '' }, desc: { default: '' }, image: { default: '' } }, content: 'none' },
  { render: Bookmark },
);

// ---------- 文字和圖片併排 ----------
// 一個文字塊配一張圖，圖在左邊或右邊；中間的分隔線可以左右拖曳調整圖片佔多寬

const SIDE_MIN = 0.15;
const SIDE_MAX = 0.7;

function SideImage({ block, editor, contentRef }) {
  const rowRef = useRef(null);
  const [live, setLive] = useState(null); // 拖分隔線時的暫時比例 { w, snap }
  const side = block.props.side === 'left' ? 'left' : 'right';
  const saved = Number(block.props.w) || 0.4;
  const w = live ? live.w : saved;

  function startSplit(e) {
    e.preventDefault();
    e.stopPropagation();
    const total = rowRef.current.getBoundingClientRect().width;
    const startX = e.clientX;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let cur = saved;
    const moveFn = (ev) => {
      // 圖在右邊：往左拉圖變大；圖在左邊：往右拉圖變大
      const dx = (ev.clientX - startX) / total;
      let next = Math.min(SIDE_MAX, Math.max(SIDE_MIN, saved + (side === 'right' ? -dx : dx)));
      // 接近對半或三分之一時吸附，再拉才會脫離
      let snap = false;
      for (const t of [0.5, 1 / 3, 0.4]) {
        if (Math.abs(next - t) * total <= 10) {
          next = t;
          snap = true;
          break;
        }
      }
      cur = next;
      setLive({ w: next, snap });
    };
    const up = () => {
      handle.removeEventListener('pointermove', moveFn);
      handle.removeEventListener('pointerup', up);
      setLive(null);
      const rounded = Math.round(cur * 1000) / 1000;
      if (rounded !== saved) editor.updateBlock(block, { props: { w: rounded } });
    };
    handle.addEventListener('pointermove', moveFn);
    handle.addEventListener('pointerup', up);
  }

  // 拆開：圖片變成文字塊下面的單張圖片
  const detach = () => {
    editor.insertBlocks([{ type: 'image', props: { url: block.props.url, name: block.props.name || '' } }], block, 'after');
    editor.replaceBlocks([block], [{ type: 'paragraph', content: block.content }]);
  };
  const imageCol = (
    <div className="side-img" style={{ flex: `0 0 ${w * 100}%` }} contentEditable={false}>
      <img src={block.props.url} alt={block.props.name || ''} draggable={false} />
      {editor.isEditable && (
        <div className="img-row-tools">
          <button title={side === 'right' ? '圖片換到左邊' : '圖片換到右邊'} onClick={() => editor.updateBlock(block, { props: { side: side === 'right' ? 'left' : 'right' } })}>
            <Icon name="row" size={14} />
          </button>
          <button title="拆開（圖片放到文字下面）" onClick={detach}>
            <Icon name="external" size={14} />
          </button>
          <button title="刪除圖片（保留文字）" onClick={() => editor.replaceBlocks([block], [{ type: 'paragraph', content: block.content }])}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </div>
  );
  const split = editor.isEditable ? (
    <span
      className={'side-split' + (live && live.snap ? ' snap' : '')}
      contentEditable={false}
      title="左右拖曳調整圖片大小；接近對半會吸附，再拉才脫離"
      onPointerDown={startSplit}
    />
  ) : null;
  const text = <div className="side-text" ref={contentRef} />;
  return (
    <div ref={rowRef} className={'side-row side-' + side}>
      {side === 'left' ? (
        <>
          {imageCol}
          {split}
          {text}
        </>
      ) : (
        <>
          {text}
          {split}
          {imageCol}
        </>
      )}
    </div>
  );
}

export const SideImageBlock = createReactBlockSpec(
  { type: 'sideImage', propSchema: { url: { default: '' }, name: { default: '' }, side: { default: 'right' }, w: { default: 0.4 } }, content: 'inline' },
  { render: SideImage },
);

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    imageRow: ImageRowBlock(),
    sideImage: SideImageBlock(),
    videoEmbed: VideoEmbedBlock(),
    callout: CalloutBlock(),
    bookmark: BookmarkBlock(),
  },
});
