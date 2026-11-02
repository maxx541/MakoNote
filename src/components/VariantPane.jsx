import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import Icon from './Icon.jsx';
import { api, assetUrl, toRelative, debounce, errMsg, nowStamp, cloudImageUrl, decodeRel } from '../lib/util.js';
import { blocksToMarkdown } from '../lib/markdown.js';
import {
  flatten,
  toBahamut,
  bahamutToHtml,
  setImageWidth,
  mergeWithNext,
  splitImageLine,
  imageInfo,
  toFacebook,
  toGdocHtml,
  BAHAMUT_SIZES,
} from '../lib/formats.js';

export const FORMATS = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'bahamut', label: '巴哈' },
  { id: 'facebook', label: 'FB' },
  { id: 'thread', label: '串文' },
  { id: 'gdoc', label: 'Google 文件' },
];

// 巴哈文章內文區的寬度（px）
const BAHAMUT_PAGE_WIDTH = 760;

const SIZE_LABEL = [
  ['original', '原尺寸'],
  ['large', '大'],
  ['medium', '中'],
  ['small', '小'],
];

// 圖片轉成 data URL（貼到 Google 文件時圖片要跟著文字一起過去）
async function toDataUrl(url, maxEdge = 1600) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(out);
  });
}

// 某個格式的版本：沒建立時是「從主稿即時產生的預覽」，第一次修改才存成檔案；
// 建立後各自獨立，主稿之後有改會提示要不要重新產生
export default function VariantPane({ kind, rel, dir, title, getBlocks, editor, masterUpdated, cloudFiles, cloudAsJpg, bahamutSizes, notify, onCreated }) {
  const [variant, setVariant] = useState(undefined); // undefined：讀取中；null：還沒建立
  const [text, setText] = useState('');
  const [saveState, setSaveState] = useState('');
  const [selImg, setSelImg] = useState(null);
  const [busy, setBusy] = useState('');
  const textRef = useRef('');
  const previewRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const sizes = { ...BAHAMUT_SIZES, ...(bahamutSizes || {}) };

  // 圖片：方塊裡是顯示用網址，輸出時換回文章資料夾內的相對路徑；已經上傳到 Cloudinary 的（巴哈、Markdown 版本）改輸出雲端網址
  const toOut = (url) => {
    const r = toRelative(dir, url);
    const entry = kind !== 'facebook' && r !== url && cloudFiles ? cloudFiles[decodeRel(r)] : null;
    return entry ? cloudImageUrl(entry, cloudAsJpg && kind === 'bahamut') : r;
  };
  // 預覽一律讀本機的檔案（快、不用網路）：雲端網址對回它的本機路徑
  const back = useMemo(() => {
    const m = new Map();
    for (const [p, e] of Object.entries(cloudFiles || {})) {
      if (e.resource_type !== 'image') continue;
      m.set(cloudImageUrl(e, false), p);
      m.set(cloudImageUrl(e, true), p);
    }
    return m;
  }, [cloudFiles]);
  const resolve = (url) => assetUrl(dir, back.get(url) || url);

  const generate = () => {
    const blocks = getBlocks();
    if (kind === 'markdown') return `# ${title}\n\n${blocksToMarkdown(editor, blocks, toOut)}`;
    if (kind === 'bahamut') return toBahamut(blocks, toOut);
    if (kind === 'facebook') return toFacebook(blocks, title, toOut).text;
    return '';
  };

  useEffect(() => {
    setVariant(undefined);
    setSelImg(null);
    if (kind === 'gdoc') {
      setVariant(null);
      return;
    }
    api.lib
      .readVariant(rel, kind)
      .then((v) => {
        setVariant(v);
        const t = v ? v.text : generate();
        textRef.current = t;
        setText(t);
      })
      .catch((e) => notify(errMsg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, rel]);

  const saveSoon = useMemo(
    () =>
      debounce(async (k, t) => {
        try {
          await api.lib.writeVariant(rel, k, t, { updated: nowStamp() });
          setSaveState('已儲存');
        } catch (e) {
          setSaveState('儲存失敗');
          notify(errMsg(e));
        }
      }, 700),
    [rel, notify],
  );

  // 第一次修改：把目前內容存成這個格式的獨立版本
  async function change(next) {
    textRef.current = next;
    setText(next);
    if (!variant) {
      const info = { generatedFrom: masterUpdated, created: nowStamp(), updated: nowStamp() };
      await api.lib.writeVariant(rel, kind, next, info);
      setVariant({ text: next, info });
      setSaveState('已建立獨立版本');
      onCreated();
      return;
    }
    setSaveState('編輯中');
    saveSoon(kind, next);
  }

  // 版本文字裡還是本機路徑的圖片（巴哈、Markdown）：已經上傳過的可以一鍵換成雲端網址
  const localImages = useMemo(() => {
    if (kind !== 'bahamut' && kind !== 'markdown') return [];
    const refs = kind === 'bahamut' ? [...text.matchAll(/\[img=([^\]\s]+)/g)] : [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)];
    return refs.map((m) => m[1]).filter((r) => !/^(https?:|data:)/i.test(r));
  }, [kind, text]);
  const swappable = cloudFiles ? localImages.filter((r) => cloudFiles[decodeRel(r)]) : [];

  function swapToCloud() {
    let next = text;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const r of new Set(swappable)) {
      const url = cloudImageUrl(cloudFiles[decodeRel(r)], cloudAsJpg && kind === 'bahamut');
      next =
        kind === 'bahamut'
          ? next.replace(new RegExp('(\\[img=)' + esc(r) + '(?=[\\s\\]])', 'g'), (_, a) => a + url)
          : next.replace(new RegExp('(!\\[[^\\]]*\\]\\()' + esc(r) + '(\\))', 'g'), (_, a, b) => a + url + b);
    }
    change(next);
    notify(`已把 ${new Set(swappable).size} 張圖片換成 Cloudinary 網址`);
  }

  async function regenerate() {
    const t = generate();
    textRef.current = t;
    setText(t);
    const info = { generatedFrom: masterUpdated, ack: '', updated: nowStamp() };
    await api.lib.writeVariant(rel, kind, t, info);
    setVariant({ text: t, info: { ...(variant ? variant.info : {}), ...info } });
    notify('已依主稿重新產生');
  }

  async function keepCurrent() {
    await api.lib.writeVariant(rel, kind, textRef.current, { ack: masterUpdated });
    setVariant((v) => ({ ...v, info: { ...v.info, ack: masterUpdated } }));
  }

  async function removeVariant() {
    if (!window.confirm('刪除這個格式的獨立版本？之後會回到從主稿即時產生的預覽。')) return;
    await api.lib.deleteVariant(rel, kind);
    const t = generate();
    textRef.current = t;
    setText(t);
    setVariant(null);
    onCreated();
  }

  async function copy() {
    try {
      if (kind === 'gdoc') {
        setBusy('正在把圖片一起打包…');
        const blocks = getBlocks();
        const map = new Map();
        // flatten 會把併排圖片拆成一張張，才不會漏打包
        for (const b of flatten(blocks)) {
          if (b.type === 'image' && b.props.url && !map.has(b.props.url)) map.set(b.props.url, await toDataUrl(b.props.url));
        }
        const html = toGdocHtml(blocks, title, (u) => map.get(u) || u);
        const plain = toFacebook(blocks, title, toOut).text;
        await api.clip.write({ html, text: plain });
        notify('已複製。到 Google 文件按 Ctrl+V 貼上，標題、粗體、顏色、置中、圖片都會保留');
      } else {
        await api.clip.write({ text: textRef.current });
        notify('已複製到剪貼簿');
      }
    } catch (e) {
      notify('複製失敗：' + errMsg(e));
    }
    setBusy('');
  }

  // ---------- 預覽 ----------

  const previewHtml = useMemo(() => {
    if (kind === 'gdoc') return toGdocHtml(getBlocks(), title, (u) => u);
    if (kind === 'bahamut') return bahamutToHtml(text, resolve);
    if (kind === 'markdown') {
      const doc = new DOMParser().parseFromString(marked.parse(text), 'text/html');
      doc.querySelectorAll('img').forEach((im) => im.setAttribute('src', resolve(im.getAttribute('src') || '')));
      return doc.body.innerHTML;
    }
    return '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, text, title]);

  const fbImages = useMemo(() => (kind === 'facebook' ? toFacebook(getBlocks(), title, toOut).images : []), [kind, title]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = selImg !== null && kind === 'bahamut' ? imageInfo(text, selImg) : null;
  // 匯入後沒改過的文章沒有更新時間，產生時間記成空字串；之後主稿一改就會比它新
  const masterChanged = variant && variant.info && masterUpdated && masterUpdated > (variant.info.generatedFrom || '') && variant.info.ack !== masterUpdated;

  // 巴哈預覽固定用巴哈內文寬度排版，視窗窄時等比例縮小，併排會不會換行才看得準
  useEffect(() => {
    const el = previewRef.current;
    if (!el || kind !== 'bahamut') return undefined;
    const ro = new ResizeObserver(() => setZoom(Math.min(1, (el.clientWidth - 56) / BAHAMUT_PAGE_WIDTH)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [kind, variant]);

  if (variant === undefined) return <div className="variant-pane" />;

  return (
    <div className="variant-pane">
      <div className="variant-head">
        <div className="variant-status">
          {kind === 'gdoc' ? null : variant ? (
            <span className="muted small">
              獨立版本 · 建立於 {variant.info.created || '—'} · {saveState || '已儲存'}
            </span>
          ) : (
            <span className="pill wip">預覽</span>
          )}
        </div>
        <div className="row">
          {busy && <span className="muted small">{busy}</span>}
          {swappable.length > 0 && (
            <button className="btn small primary" onClick={swapToCloud} title="把版本文字裡的本機圖片路徑換成已上傳的 Cloudinary 網址">
              圖片換成雲端網址（{new Set(swappable).size} 張）
            </button>
          )}
          {kind === 'bahamut' && swappable.length === 0 && localImages.length > 0 && (
            <span className="muted small" title="貼到巴哈後本機路徑的圖片不會顯示">
              圖片還是本機路徑，需先上傳到 Cloudinary
            </span>
          )}
          {variant && (
            <button className="btn small ghost" onClick={removeVariant}>
              <Icon name="trash" size={14} />
              刪除這個版本
            </button>
          )}
          <button className="btn small" onClick={copy}>
            <Icon name="layers" size={14} />
            {kind === 'gdoc' ? '複製（含格式與圖片）' : '複製全部'}
          </button>
        </div>
      </div>

      {masterChanged && (
        <div className="variant-banner">
          主稿在 {masterUpdated} 有更新，這個版本是 {variant.info.generatedFrom} 產生的。
          <button className="btn small primary" onClick={regenerate}>
            重新產生（會覆蓋這個版本的修改）
          </button>
          <button className="btn small ghost" onClick={keepCurrent}>
            保留目前版本
          </button>
        </div>
      )}

      <div className={'variant-body' + (kind === 'gdoc' ? ' single' : '')}>
        {kind !== 'gdoc' && (
          <textarea className="variant-text" value={text} spellCheck={false} onChange={(e) => change(e.target.value)} />
        )}

        <div className="variant-preview-wrap">
          {kind === 'bahamut' && (
            <div className="img-tools">
              {info ? (
                <>
                  <span className="muted small">第 {selImg + 1} 張圖</span>
                  {SIZE_LABEL.map(([k, label]) => (
                    <button
                      key={k}
                      className={'chip' + (info.width === sizes[k] ? ' on' : '')}
                      onClick={() => change(setImageWidth(text, selImg, sizes[k]))}
                      title={sizes[k] ? `width=${sizes[k]}` : '不加寬度'}
                    >
                      {label}
                    </button>
                  ))}
                  {info.inRow ? (
                    <button className="chip" onClick={() => change(splitImageLine(text, selImg))}>
                      取消併排
                    </button>
                  ) : null}
                  {info.canMerge && (
                    <button className="chip" onClick={() => change(mergeWithNext(text, selImg))}>
                      與下一張併排
                    </button>
                  )}
                </>
              ) : null}
            </div>
          )}

          {kind === 'facebook' ? (
            <div className="fb-preview">
              <div className="fb-head">
                <div className="fb-avatar" />
                <div>
                  <div className="fb-name">你</div>
                  <div className="fb-time">剛剛</div>
                </div>
              </div>
              <div className="fb-text">{text}</div>
              {fbImages.length > 0 && (
                <div className={'fb-grid n' + Math.min(fbImages.length, 4)}>
                  {fbImages.slice(0, 4).map((u, i) => (
                    <div key={u + i} className="fb-cell">
                      <img src={resolve(u)} alt="" />
                      <span>圖{i + 1}</span>
                      {i === 3 && fbImages.length > 4 && <div className="fb-more">+{fbImages.length - 4}</div>}
                    </div>
                  ))}
                </div>
              )}
              <div className="muted small fb-note">FB 不支援內文插圖：發文時依〔圖1〕〔圖2〕的順序上傳 {fbImages.length} 張圖片</div>
            </div>
          ) : (
            <div ref={previewRef} className={'variant-preview ' + kind}>
            <div
              className="variant-page"
              style={kind === 'bahamut' ? { width: BAHAMUT_PAGE_WIDTH, zoom } : undefined}
              onClick={(e) => {
                const holder = e.target.closest && e.target.closest('.bh-img');
                if (holder) setSelImg(Number(holder.dataset.idx));
                if (e.target.closest && e.target.closest('a')) e.preventDefault();
              }}
              dangerouslySetInnerHTML={{
                __html:
                  kind === 'bahamut' && selImg !== null
                    ? previewHtml.replace(`data-idx="${selImg}"`, `data-idx="${selImg}" data-sel="1"`)
                    : previewHtml,
              }}
            />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
