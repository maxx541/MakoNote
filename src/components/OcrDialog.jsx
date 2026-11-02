import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { api, errMsg } from '../lib/util.js';
import { useImageInput } from '../lib/useImageInput.js';
import { applyBuiltin, BUILTIN_WORDS, BUILTIN_LINES } from '../lib/ocrIgnore.js';

const LANGS = [
  { id: 'ja', label: '日文' },
  { id: 'zh-Hant-TW', label: '繁體中文' },
  { id: 'en-US', label: '英文' },
];

// 整張圖送去辨識；太小就放大一倍，辨識會準很多
async function toPng(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(bmp.height < 260 ? 2 : 1, 2560 / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
}

// 中文、日文的標點 OCR 常變半形，轉回全形
function fixPunct(s) {
  return s
    .replace(/…\s*…/g, '……')
    .replace(/\.{3,}/g, '……')
    .replace(/(?<=[　-鿿＀-￯]),|,(?=[　-鿿＀-￯])/g, '，')
    .replace(/(?<=[　-鿿＀-￯])\?|\?(?=[　-鿿])/g, '？')
    .replace(/(?<=[　-鿿＀-￯])!|!(?=[　-鿿])/g, '！')
    .replace(/(?<=[　-鿿＀-￯]):/g, '：');
}

const parseIgnore = (text) =>
  text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 把忽略字詞從辨識出來的行裡拿掉，拿掉後變空的行整行丟掉
export function cleanLines(rawLines, ignore, builtin = false) {
  const re = ignore.length ? new RegExp(ignore.map(escapeRe).join('|'), 'gi') : null;
  const out = [];
  for (const raw of rawLines) {
    let line = fixPunct(raw);
    if (builtin) line = applyBuiltin(line);
    if (re) line = line.replace(re, '');
    line = line.replace(/\s+/g, ' ').trim();
    if (line) out.push(line);
  }
  return out;
}

// 每張截圖依序接起來：join＝一張合成一行，否則照辨識出來的分行
export function mergeShots(shots, ignore, join, builtin = false) {
  return shots
    .map((lines) => cleanLines(lines, ignore, builtin))
    .map((lines) => (join ? lines.join('') : lines.join('\n')))
    .filter(Boolean)
    .join('\n');
}

// 插入遊戲台詞：選（或貼上）一到多張截圖 → 整張辨識 → 依順序合併 → 以引用插入
export default function OcrDialog({ settings, onSettings, onInsert, onClose }) {
  const [images, setImages] = useState([]); // { id, name, blob, url }
  const [lang, setLang] = useState(settings.lang);
  const [join, setJoin] = useState(settings.join !== false);
  const [builtin, setBuiltin] = useState(settings.builtin !== false);
  const [ignoreText, setIgnoreText] = useState((settings.ignore || []).join('\n'));
  const [results, setResults] = useState({}); // 圖片 id → 辨識出的行（辨識過就不再重跑）
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const urls = useRef([]);
  const boxRef = useRef(null);
  const nextId = useRef(1);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const ignore = useMemo(() => parseIgnore(ignoreText), [ignoreText]);
  const done = images.length > 0 && images.every((img) => results[img.id]);

  // 每張都辨識過了：換順序、改忽略字詞、改合併方式都立刻重排結果
  useEffect(() => {
    if (done) setText(mergeShots(images.map((img) => results[img.id]), ignore, join, builtin));
  }, [images, results, ignore, join, builtin, done]);

  function addBlobs(list) {
    const next = list.map(({ name, blob }) => {
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      return { id: nextId.current++, name, blob, url };
    });
    setImages((prev) => [...prev, ...next]);
    setError('');
  }

  async function pick() {
    const files = await api.dialog.pickImages();
    addBlobs(files.map((f) => ({ name: f.name, blob: new Blob([f.data]) })));
  }

  // 對話框裡也能直接貼上剪貼簿的截圖
  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData ? e.clipboardData.files : [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      addBlobs(files.map((f, i) => ({ name: f.name || `貼上 ${i + 1}`, blob: f })));
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, []);

  // 圖片檔可以直接拖進對話框（貼上已經由下面的全域貼上處理）
  const dropping = useImageInput(boxRef, (files) => addBlobs(files.map((f, i) => ({ name: f.name || `拖入 ${i + 1}`, blob: f }))), { paste: false });

  const saveSettings = () => onSettings({ lang, join, ignore, builtin });

  async function recognize(force) {
    if (!images.length) {
      setError('先選擇或貼上至少一張截圖');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const todo = images.filter((img) => force || !results[img.id]);
      if (todo.length) {
        const data = [];
        for (const img of todo) data.push({ data: await toPng(img.blob) });
        const lines = await api.ocr.run(data, lang);
        setResults((r) => {
          const n = force ? {} : { ...r };
          todo.forEach((img, i) => {
            n[img.id] = lines[i] || [];
          });
          return n;
        });
      }
      saveSettings();
    } catch (e) {
      setError(errMsg(e));
    }
    setBusy(false);
  }

  const move = (i, d) =>
    setImages((list) => {
      const next = [...list];
      const [x] = next.splice(i, 1);
      next.splice(i + d, 0, x);
      return next;
    });

  function changeLang(v) {
    setLang(v);
    setResults({}); // 語言換了要重辨識
    setText('');
  }

  return (
    <div className="modal-wrap" onMouseDown={onClose}>
      <div ref={boxRef} className={'modal ocr' + (dropping ? ' drop-over' : '')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>插入遊戲台詞</h2>
          <button className="icon-btn ghost" onClick={onClose} title="關閉">
            <Icon name="x" />
          </button>
        </div>

        <div className="row">
          <button className="btn" onClick={pick}>
            <Icon name="image" size={16} />
            選擇截圖
          </button>
        </div>

        {images.length > 0 ? (
          <div className="ocr-thumbs">
            {images.map((img, i) => (
              <div key={img.id} className="ocr-thumb" title={img.name}>
                <img src={img.url} alt="" />
                <span>{i + 1}</span>
                <button className="chip-x" onClick={() => setImages((list) => list.filter((x) => x !== img))} title="移除">
                  <Icon name="x" size={12} />
                </button>
                <div className="ocr-thumb-move">
                  <button disabled={i === 0} onClick={() => move(i, -1)} title="往前">
                    <Icon name="chevron" size={12} className="rot-left" />
                  </button>
                  <button disabled={i === images.length - 1} onClick={() => move(i, 1)} title="往後">
                    <Icon name="chevron" size={12} className="rot-right" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ocr-empty muted">還沒有截圖</div>
        )}

        <div className="field two">
          <div>
            <label>辨識語言</label>
            <select value={lang} onChange={(e) => changeLang(e.target.value)}>
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>合併方式</label>
            <select value={join ? 'join' : 'lines'} onChange={(e) => setJoin(e.target.value === 'join')}>
              <option value="join">每張截圖合成一行</option>
              <option value="lines">照辨識出來的分行</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={builtin}
              onChange={(e) => {
                setBuiltin(e.target.checked);
                onSettings({ lang, join, ignore, builtin: e.target.checked });
              }}
            />
            套用內建排除表（遊戲介面常見字：SAVE、LOAD、AUTO、SKIP、LOG、返回、存檔、セーブ…）
          </label>
          <details className="menu-more">
            <summary>看內建排除表（{BUILTIN_WORDS.length + BUILTIN_LINES.length} 個）</summary>
            <p className="muted small">
              英文（整個單字才算，容忍 OCR 拆開或看錯字母）：{BUILTIN_WORDS.join('、')}
              <br />
              中日文（整行只有這個字才拿掉；4 個字以上的行內出現也拿掉）：{BUILTIN_LINES.join('、')}
            </p>
          </details>
        </div>

        <div className="field">
          <label>自己加的忽略字詞（一行一個，辨識結果裡出現就拿掉）</label>
          <textarea
            className="ocr-ignore"
            value={ignoreText}
            rows={3}
            placeholder={'例如遊戲介面的字：\nAUTO\nSKIP\nLOG'}
            onChange={(e) => setIgnoreText(e.target.value)}
            onBlur={saveSettings}
          />
        </div>

        <div className="field">
          <label>辨識結果（可以直接修改）</label>
          <textarea className="ocr-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="按「辨識」後會出現在這裡" />
        </div>
        {error && <div className="error">{error}</div>}

        <div className="modal-foot">
          <div className="row">
            <button className="btn" onClick={() => recognize(done)} disabled={busy || !images.length}>
              <Icon name="search" size={16} />
              {busy ? '辨識中…' : done ? '重新辨識' : '辨識'}
            </button>
            <button
              className="btn primary"
              onClick={() => {
                if (!text.trim()) {
                  setError('還沒有文字可以插入');
                  return;
                }
                saveSettings();
                onInsert(text.trim());
              }}
            >
              <Icon name="check" size={16} />
              以引用插入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
