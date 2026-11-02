import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useCreateBlockNote,
  useComponentsContext,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  FormattingToolbarController,
  FormattingToolbar,
  getFormattingToolbarItems,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { filterSuggestionItems } from '@blocknote/core';
import { zhTW } from '@blocknote/core/locales';
import '@blocknote/mantine/style.css';
import Icon from './Icon.jsx';
import ContextMenu from './ContextMenu.jsx';
import OcrDialog from './OcrDialog.jsx';
import BlockLinkPicker from './BlockLinkPicker.jsx';
import { schema } from './customBlocks.jsx';
import { api, assetUrl, libUrl, toRelative, errMsg } from '../lib/util.js';
import { processImage } from '../lib/image.js';
import { markdownToBlocks, blocksToMarkdown, BLOCK_LINK_PREFIX } from '../lib/markdown.js';
import { bahamutHtmlToBlocks } from '../lib/richtext.js';
import { EDITOR_ACTIONS, SLASH_GROUPS, actionById, menuIds } from '../lib/editorActions.js';
import { parseVideoUrl, soleVideoUrl } from '../lib/embed.js';
import { MAX_PER_ROW, rowImages, imagesProp } from '../lib/imageRow.js';
import { endsSentence, reflowText, mergeSmart } from '../lib/smartParagraph.js';

function eachBlock(blocks, fn) {
  for (const b of blocks) {
    fn(b);
    if (b.children) eachBlock(b.children, fn);
  }
}

// ---------- 時數統計表 ----------

const HOURS = /(\d+(?:\.\d+)?)\s*(?:小時|hr|h)(?![a-z])/gi;
const TOTAL_LINE = /^\s*(總共|共計|共)[\s：:]/;

function inlineText(content) {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map((c) => (c.type === 'text' ? c.text : inlineText(c.content))).join('') : '';
}

function sumHours(table) {
  let total = 0;
  for (const row of table.content.rows) {
    for (const cell of row.cells) {
      const text = inlineText(cell && cell.type === 'tableCell' ? cell.content : cell);
      for (const m of text.matchAll(HOURS)) total += Number(m[1]);
    }
  }
  return Math.round(total * 10) / 10;
}

const bold = (text) => [{ type: 'text', text, styles: { bold: true } }];

function timeStatsBlocks() {
  return [
    { type: 'paragraph', content: bold('時數統計') },
    {
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [{ cells: ['共通 0 小時', '路線 0 小時'] }, { cells: ['路線 0 小時', '路線 0 小時'] }],
      },
    },
    { type: 'paragraph', content: bold('總共：0 小時') },
  ];
}

// 一串圖片 → 方塊：併排時每 4 張一排，只剩一張的那排放成單張圖片
function imageBlocks(list, asRow) {
  if (!asRow || list.length < 2) return list.map((x) => ({ type: 'image', props: { url: x.url, name: x.name || '' } }));
  const out = [];
  for (let i = 0; i < list.length; i += MAX_PER_ROW) {
    const chunk = list.slice(i, i + MAX_PER_ROW);
    out.push(chunk.length === 1 ? { type: 'image', props: { url: chunk[0].url, name: chunk[0].name || '' } } : { type: 'imageRow', props: { images: imagesProp(chunk) } });
  }
  return out;
}

// 一張圖加一個文字塊 → 圖文併排方塊（圖在 side 那一邊）
function sideImageBlock(img, para, side) {
  return { type: 'sideImage', props: { url: img.url, name: img.name || '', side, w: 0.4 }, content: para.content };
}

// 方塊裡的圖片（單張或一整排）
function imagesOf(b) {
  if (!b) return [];
  if (b.type === 'image' && b.props.url) return [{ url: b.props.url, name: b.props.name || '' }];
  if (b.type === 'imageRow') return rowImages(b);
  return [];
}

function BlockLinkButton({ onClick }) {
  const Components = useComponentsContext();
  return (
    <Components.FormattingToolbar.Button
      mainTooltip="連結到文中的段落"
      label="連結到段落"
      icon={<Icon name="link" size={16} />}
      onClick={onClick}
    />
  );
}

// 插入影片／書籤時輸入網址
function InsertDialog({ dialog, onClose }) {
  const [url, setUrl] = useState('');
  const info = dialog.kind === 'video' ? parseVideoUrl(url) : null;
  const ok = dialog.kind === 'video' ? !!url.trim() : /^https?:\/\/\S+$/.test(url.trim());
  const submit = () => ok && dialog.onSubmit(url.trim());
  return (
    <div className="modal-wrap" onMouseDown={onClose}>
      <div className="modal insert-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{dialog.title}</h2>
          <button className="icon-btn ghost" onClick={onClose} title="關閉">
            <Icon name="x" />
          </button>
        </div>
        {(
          <>
            <input
              autoFocus
              value={url}
              placeholder={dialog.kind === 'video' ? 'https://www.youtube.com/watch?v=…　或　https://www.bilibili.com/video/BV…' : 'https://…'}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              style={{ width: '100%' }}
            />
            {dialog.kind === 'video' && url.trim() && (
              <p className="muted small">{info ? `會內嵌 ${info.label} 播放器（${info.aspect}）` : '不是 YouTube 或 bilibili 的網址，會當成影片檔網址插入'}</p>
            )}
            <div className="modal-foot">
              <span>
                {dialog.onLocal && (
                  <button className="btn ghost" onClick={dialog.onLocal}>
                    改選本機影片檔…
                  </button>
                )}
              </span>
              <button className="btn primary" disabled={!ok} onClick={submit}>
                插入
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 方塊編輯器本體：讀進 Markdown、改動時吐出 Markdown。
// articleRel 是文章 .md 的路徑；baseDir 是它所在的資料夾，圖片路徑都相對於這裡
export default function BlockEditor({ articleRel, baseDir, body, sourceHtml, onEditor, imageSettings, ocrSettings, onOcrSettings, menuSettings, onCustomizeMenu, smartSettings, onMarkdown, onReady, notify }) {
  const settingsRef = useRef(imageSettings);
  settingsRef.current = imageSettings;
  const readyRef = useRef(false);
  const fetching = useRef(new Set());
  const wrapRef = useRef(null);
  const dropRef = useRef(null);
  const smartRef = useRef(mergeSmart(smartSettings));
  smartRef.current = mergeSmart(smartSettings);
  const forceSplitRef = useRef(false); // Ctrl+Enter：這一下一定開新文字塊
  const dragSrcRef = useRef(null); // 正在拖的圖片方塊（算好存起來，放開時選取已被清掉）
  const [menu, setMenu] = useState(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [linkPicker, setLinkPicker] = useState(false);
  const [dialog, setDialog] = useState(null);

  // 浮動工具列要傳「元件」，函式的身分一變，React 就會整個重建工具列、收掉打開的下拉選單
  // （撰寫計時每秒都讓外層重繪），所以一定要用固定不變的函式
  const textToolbar = useCallback(
    () => (
      <FormattingToolbar>
        {...getFormattingToolbarItems()}
        <BlockLinkButton key="blockLink" onClick={() => setLinkPicker(true)} />
      </FormattingToolbar>
    ),
    [],
  );

  async function storeBlob(blob, name) {
    const { data, ext } = await processImage(blob, settingsRef.current, name);
    const saved = await api.lib.saveAsset(articleRel, data, ext);
    return libUrl(baseDir ? `${baseDir}/${saved}` : saved);
  }

  const editor = useCreateBlockNote({
    schema,
    dictionary: { ...zhTW, placeholders: { ...zhTW.placeholders, default: '輸入文字，或按 / 插入標題、摺疊清單、遊戲台詞…' } },
    // 貼上、拖入、從選單上傳的檔案都走這裡：壓縮轉檔後存進 assets/
    uploadFile: async (file) => {
      try {
        if (file.type.startsWith('image/')) return await storeBlob(file, file.name);
        const saved = await api.lib.saveAsset(articleRel, await file.arrayBuffer(), (file.name.split('.').pop() || 'bin').toLowerCase());
        return libUrl(baseDir ? `${baseDir}/${saved}` : saved);
      } catch (e) {
        notify('檔案儲存失敗：' + errMsg(e));
        throw e;
      }
    },
  });

  const serialize = () => blocksToMarkdown(editor, editor.document, (u) => toRelative(baseDir, u));

  useEffect(() => {
    const mapUrl = (u) => assetUrl(baseDir, u);
    // 還沒改過的巴哈文章用原始 HTML 還原排版；其餘讀 Markdown
    // 讀檔不算一步編輯：不放進復原紀錄，否則一開檔按 Ctrl+Z 會把整篇清空
    const load = (blocks) => {
      if (blocks.length)
        editor.transact((tr) => {
          tr.setMeta('addToHistory', false);
          editor.replaceBlocks(editor.document, blocks);
        });
    };
    try {
      load(sourceHtml ? bahamutHtmlToBlocks(sourceHtml, mapUrl) : markdownToBlocks(editor, body || '', mapUrl));
    } catch (e) {
      // 原始排版有 BlockNote 不收的結構時，退回讀 Markdown，不讓整個畫面壞掉
      if (!sourceHtml) throw e;
      notify('原始排版有無法還原的部分，改用 Markdown 顯示：' + errMsg(e));
      load(markdownToBlocks(editor, body || '', mapUrl));
    }
    readyRef.current = true;
    // 交給編輯頁：轉成其他格式、復原時要用到
    if (onEditor) onEditor(editor);
    // 以「讀進來再轉回去」的結果當基準，避免一打開就被當成有修改
    onReady(serialize());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 左邊的拖曳把手像 Anytype：滑到哪一段，把手就長成那一整段（多行的段落也一樣高）的長條
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    let timers = [];
    const fit = () => {
      const sm = document.querySelector('.bn-side-menu');
      const handle = sm && sm.querySelector('button[draggable="true"]');
      if (!handle) return;
      const top = sm.getBoundingClientRect().top;
      let best = null;
      let bestD = 14;
      for (const c of wrap.querySelectorAll('.bn-block-content')) {
        const r = c.getBoundingClientRect();
        const d = Math.abs(r.top - top);
        if (d < bestD) {
          bestD = d;
          best = r;
        }
      }
      handle.style.height = `${Math.max(30, best ? Math.round(best.height) : 30)}px`;
    };
    const onMove = () => {
      timers.forEach(clearTimeout);
      timers = [setTimeout(fit, 40), setTimeout(fit, 160), setTimeout(fit, 400)];
    };
    wrap.addEventListener('pointermove', onMove);
    return () => {
      wrap.removeEventListener('pointermove', onMove);
      timers.forEach(clearTimeout);
    };
  }, []);

  // 從網頁複製來的圖片還是外部網址，背景下載回本地資料夾
  function localizeRemoteImages() {
    if (!settingsRef.current.fetchRemote) return;
    eachBlock(editor.document, (b) => {
      const url = b.type === 'image' && b.props.url;
      if (!url || !/^(https?:|data:)/.test(url) || fetching.current.has(b.id)) return;
      fetching.current.add(b.id);
      (async () => {
        try {
          let blob;
          if (url.startsWith('data:')) blob = await (await fetch(url)).blob();
          else {
            const r = await api.net.fetchImage(url);
            blob = new Blob([r.data], { type: r.type });
          }
          const local = await storeBlob(blob, url.split('?')[0].split('/').pop());
          if (editor.getBlock(b.id)) editor.updateBlock(b.id, { props: { url: local } });
        } catch (e) {
          notify('網路圖片下載失敗，先保留原網址：' + errMsg(e));
        }
      })();
    });
  }

  // 內建影片方塊的「嵌入」分頁貼了 YouTube／B 站網址：換成內嵌播放器（內建的 <video> 播不了這兩家）
  function upgradeVideoBlocks() {
    eachBlock(editor.document, (b) => {
      if (b.type !== 'video' || !b.props.url) return;
      const info = parseVideoUrl(b.props.url);
      if (info) editor.replaceBlocks([b.id], [{ type: 'videoEmbed', props: { url: info.watchUrl, aspect: '', width: 0 } }]);
    });
  }

  // ---------- 插入 ----------

  // 游標所在的空白段落直接換掉，否則插在後面；插完把游標放進新的方塊（沒有文字的方塊就放到下一段）
  function insertBlocks(blocks) {
    const cur = editor.getTextCursorPosition().block;
    const empty = cur.type === 'paragraph' && Array.isArray(cur.content) && cur.content.length === 0;
    let inserted;
    if (empty) {
      const r = editor.replaceBlocks([cur], blocks);
      inserted = Array.isArray(r) ? r : r.insertedBlocks;
    } else inserted = editor.insertBlocks(blocks, cur, 'after');
    const last = inserted && inserted[inserted.length - 1];
    if (!last) return inserted;
    try {
      const textual = [...inserted].reverse().find((b) => Array.isArray(b.content) && b.type !== 'table');
      if (textual && textual === last) editor.setTextCursorPosition(textual, 'end');
      else {
        let next = editor.getNextBlock(last);
        if (!next) [next] = editor.insertBlocks([{ type: 'paragraph' }], last, 'after');
        editor.setTextCursorPosition(next, 'start');
      }
    } catch {
      // 游標放不進去就算了，內容已經插好
    }
    return inserted;
  }

  // 多張圖片一次放進來：自動併排（每排最多 4 張，等高縮放填滿寬度）；要分開再用右鍵「拆開併排」
  function placeImages(list) {
    if (!list.length) return;
    insertBlocks(imageBlocks(list, true));
    if (list.length > 1) notify('多張圖片已自動併排；要分開放，在圖上按右鍵選「拆開併排」');
  }

  async function storeFiles(files) {
    const out = [];
    for (const f of files) {
      try {
        out.push({ url: await storeBlob(f.blob, f.name), name: f.name });
      } catch (e) {
        notify(`「${f.name}」存檔失敗：${errMsg(e)}`);
      }
    }
    return out;
  }

  async function insertImages(forceRow) {
    const picked = await api.dialog.pickImages('選擇圖片（可以多選，依檔名順序插入）');
    if (!picked.length) return;
    const list = await storeFiles(picked.map((f) => ({ blob: new Blob([f.data]), name: f.name })));
    placeImages(list);
  }

  function insertQuote(text) {
    // 每張截圖一行，全部放在同一個引用方塊裡
    insertBlocks([{ type: 'quote', content: text }]);
    setOcrOpen(false);
    editor.focus();
  }

  function askUrl(kind) {
    const video = kind === 'video';
    setDialog({
      kind,
      title: video ? '插入影片' : '插入書籤連結',
      onLocal: video ? () => {
        setDialog(null);
        editor.focus();
        defaultItem('video');
      } : null,
      onSubmit: (url) => {
        setDialog(null);
        editor.focus();
        if (!video) insertBlocks([{ type: 'bookmark', props: { url } }]);
        else {
          const info = parseVideoUrl(url);
          insertBlocks([info ? { type: 'videoEmbed', props: { url: info.watchUrl } } : { type: 'video', props: { url } }]);
        }
      },
    });
  }

  // 加總表格裡所有「數字＋小時」，寫到表格下一行的「總共」；沒有那一行就補上
  function updateTotal(table) {
    const text = `總共：${sumHours(table)} 小時`;
    const next = editor.getNextBlock(table);
    if (next && next.type === 'paragraph' && TOTAL_LINE.test(inlineText(next.content))) editor.updateBlock(next, { content: bold(text) });
    else editor.insertBlocks([{ type: 'paragraph', content: bold(text) }], table, 'after');
    notify(text);
  }

  function linkToBlock(id) {
    editor.focus();
    editor.createLink(BLOCK_LINK_PREFIX + id);
    setLinkPicker(false);
  }

  // BlockNote 內建的斜線項目（音訊、檔案、表情符號、本機影片）直接沿用它的行為
  function defaultItem(key) {
    const it = getDefaultReactSlashMenuItems(editor).find((x) => x.key === key);
    if (it) it.onItemClick();
  }

  // 每個動作實際做的事（清單與說明在 lib/editorActions.js）
  const block = (type, props, content) => () => insertBlocks([{ type, ...(props ? { props } : {}), ...(content !== undefined ? { content } : {}) }]);
  const runners = {
    paste: () => api.win.edit('paste'),
    selectAll: () => api.win.edit('selectAll'),
    copyLink: async (cur) => {
      if (!cur) return;
      await navigator.clipboard.writeText(BLOCK_LINK_PREFIX + cur.id);
      notify('已複製段落連結，選取文字後按 Ctrl+K 貼上即可');
    },
    ocr: () => setOcrOpen(true),
    timeStats: () => insertBlocks(timeStatsBlocks()),
    paragraph: block('paragraph'),
    h1: block('heading', { level: 1 }),
    h2: block('heading', { level: 2 }),
    h3: block('heading', { level: 3 }),
    quote: block('quote', undefined, ''),
    callout: block('callout', { kind: 'note' }, ''),
    code: block('codeBlock'),
    check: block('checkListItem'),
    bullet: block('bulletListItem'),
    numbered: block('numberedListItem'),
    toggle: block('toggleListItem', undefined, ''),
    toggleH1: block('heading', { level: 1, isToggleable: true }),
    toggleH2: block('heading', { level: 2, isToggleable: true }),
    toggleH3: block('heading', { level: 3, isToggleable: true }),
    image: () => insertImages(false),
    imageRow: () => insertImages(true),
    video: () => askUrl('video'),
    bookmark: () => askUrl('bookmark'),
    audio: () => defaultItem('audio'),
    file: () => defaultItem('file'),
    divider: block('divider'),
    table: () => insertBlocks([{ type: 'table', content: { type: 'tableContent', rows: [{ cells: ['', '', ''] }, { cells: ['', '', ''] }] } }]),
    emoji: () => defaultItem('emoji'),
  };

  // 斜線選單：依 Anytype／Notion 的分組排列
  const slashItems = SLASH_GROUPS.flatMap((group) =>
    EDITOR_ACTIONS.filter((a) => a.slash && a.group === group && runners[a.id]).map((a) => ({
      key: a.id,
      title: a.slash.title,
      subtext: a.slash.subtext,
      aliases: a.slash.aliases,
      group,
      icon: <Icon name={a.icon} size={18} />,
      onItemClick: () => runners[a.id](editor.getTextCursorPosition().block),
    })),
  );

  // ---------- 智能分段：按 Enter、貼上多行文字 ----------

  // 按 Enter：這句話還沒結束（沒有句號、問號…）就只換行、留在同一個文字塊；有了句尾符號才開新的。
  // 連按兩次 Enter、Ctrl+Enter 一定開新文字塊。Shift+Enter 永遠只換行。標題、清單、引用、程式碼維持原本的行為
  function onKeyDownCapture(e) {
    const smart = smartRef.current;
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || !e.target.closest || !e.target.closest('.bn-editor')) return;
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && smart.enter) {
      // 強制開新文字塊：送一個一般的 Enter，並讓下面的判斷放行
      e.preventDefault();
      e.stopPropagation();
      forceSplitRef.current = true;
      e.target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      forceSplitRef.current = false;
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || !smart.enter || forceSplitRef.current) return;
    const view = editor.prosemirrorView;
    const sel = view.state.selection;
    if (!sel.empty) return;
    const cur = editor.getTextCursorPosition().block;
    if (!cur || cur.type !== 'paragraph') return;
    const parent = sel.$from.parent;
    const before = parent.textBetween(0, sel.$from.parentOffset, '\n', '\n');
    if (!before.trim()) return; // 空的或在最前面：原本的行為
    if (before.endsWith('\n')) {
      // 上一下已經換過行，這下才是真的要開新文字塊：把剛才那個換行拿掉，再交給原本的 Enter
      view.dispatch(view.state.tr.delete(sel.$from.pos - 1, sel.$from.pos));
      return;
    }
    if (endsSentence(before, smart.ends)) return; // 句子結束了：開新文字塊
    e.preventDefault();
    e.stopPropagation();
    view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.hardBreak.create()).scrollIntoView());
  }

  // 貼上的純文字有很多換行：依句尾符號重新分段，沒講完的行接在同一個文字塊
  function smartPaste(text) {
    const paras = reflowText(text, smartRef.current);
    if (!paras || !paras.length) return false;
    const cur = editor.getTextCursorPosition().block;
    if (!cur || cur.type === 'codeBlock') return false;
    editor.insertInlineContent(paras[0]);
    if (paras.length > 1) {
      const added = editor.insertBlocks(paras.slice(1).map((p) => ({ type: 'paragraph', content: p })), cur, 'after');
      const last = added && added[added.length - 1];
      if (last) editor.setTextCursorPosition(last, 'end');
    }
    return true;
  }

  // ---------- 貼上：多張圖片可選併排；單獨一個 YouTube／B 站網址變成播放器 ----------

  async function onPasteCapture(e) {
    const dt = e.clipboardData;
    if (!dt || !e.target.closest('.bn-editor')) return;
    const files = [...dt.files].filter((f) => f.type.startsWith('image/'));
    if (files.length > 1) {
      e.preventDefault();
      e.stopPropagation();
      placeImages(await storeFiles(files.map((f) => ({ blob: f, name: f.name }))));
      return;
    }
    if (files.length) return;
    const plain = dt.getData('text/plain');
    const html = dt.getData('text/html');
    // 從網頁、Word 貼上有連結、圖片、表格、清單的內容就交給原本的貼上；只有純文字的多行才重新分段
    if (smartRef.current.paste && plain && /\n/.test(plain.trim()) && (!html || !/<(a|img|table|ul|ol|li|h[1-6]|pre|blockquote|iframe)\b/i.test(html))) {
      if (smartPaste(plain)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    const info = soleVideoUrl(dt.getData('text/plain'));
    const cur = editor.getTextCursorPosition().block;
    const empty = cur && cur.type === 'paragraph' && Array.isArray(cur.content) && cur.content.length === 0;
    if (info && empty) {
      e.preventDefault();
      e.stopPropagation();
      insertBlocks([{ type: 'videoEmbed', props: { url: info.watchUrl } }]);
      notify(`已變成內嵌 ${info.label} 播放器；只要連結的話按 Ctrl+Z`);
    }
  }

  // ---------- 拖曳圖片到另一張圖旁邊就併排；把併排裡的圖拖出來就拆開 ----------

  function blockElAt(target) {
    return target && target.closest ? target.closest('.bn-block-outer') : null;
  }

  // 游標在某張圖（或一排圖）的左右兩側 → 回傳要放進哪一排的哪個位置
  function mergeSpot(e) {
    const outer = blockElAt(e.target);
    if (!outer) return null;
    const b = editor.getBlock(outer.getAttribute('data-id'));
    // 拖圖片到有字的段落左右兩側：圖片和這段文字併排
    if (b && b.type === 'paragraph' && Array.isArray(b.content) && b.content.length) {
      const tbox = outer.querySelector('.bn-block-content');
      if (!tbox) return null;
      const tr = tbox.getBoundingClientRect();
      if (e.clientY < tr.top || e.clientY > tr.bottom) return null;
      const zone = Math.min(150, tr.width * 0.28);
      if (e.clientX < tr.left + zone) return { block: b, index: 0, el: tbox, side: 'left', text: true };
      if (e.clientX > tr.right - zone) return { block: b, index: 1, el: tbox, side: 'right', text: true };
      return null;
    }
    if (!b || (b.type !== 'image' && b.type !== 'imageRow')) return null;
    const box = outer.querySelector(b.type === 'image' ? '.bn-visual-media-wrapper, .bn-visual-media, img' : '.img-row');
    if (!box) return null;
    const r = box.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom) return null;
    if (b.type === 'image') {
      // 圖片本身的左右兩側（含圖片旁邊的空白）：放在這張的左邊或右邊
      const edge = Math.min(120, r.width * 0.35);
      if (e.clientX < r.left + edge) return { block: b, index: 0, el: box, side: 'left' };
      if (e.clientX > r.right - edge) return { block: b, index: 1, el: box, side: 'right' };
      return null;
    }
    const items = [...box.querySelectorAll('.img-row-item')];
    // 這一排的最左邊之外／最右邊之外（旁邊的空白）：插在最前面或最後面
    if (items.length && e.clientX > items[items.length - 1].getBoundingClientRect().right) return { block: b, index: items.length, el: items[items.length - 1], side: 'right' };
    if (items.length && e.clientX < items[0].getBoundingClientRect().left) return { block: b, index: 0, el: items[0], side: 'left' };
    for (let i = 0; i < items.length; i += 1) {
      const ir = items[i].getBoundingClientRect();
      if (e.clientX >= ir.left && e.clientX <= ir.right) {
        const before = e.clientX < ir.left + ir.width / 2;
        return { block: b, index: before ? i : i + 1, el: items[i], side: before ? 'left' : 'right' };
      }
    }
    return null;
  }

  function dragged(e) {
    const types = [...(e.dataTransfer ? e.dataTransfer.types : [])];
    if (types.includes('application/x-makonote-rowimg')) return { kind: 'rowimg' };
    if (types.includes('blocknote/html')) {
      // 從左邊的拖曳把手拖的時候，選取範圍會連同後面那個段落的開頭一起選進來；只看最前面連續的圖片方塊。
      // 放開的瞬間選取已經被清掉，所以拖曳途中算好的結果先存起來
      // 只在拖曳剛開始（還沒記下來）時算一次；放開時選取已經跑到別處，不能再算
      const sel = !dragSrcRef.current && e.type !== 'drop' ? editor.getSelection() : null;
      if (sel) {
        const lead = [];
        for (const b of sel.blocks) {
          if (b.type !== 'image' && b.type !== 'imageRow') break;
          lead.push(b);
        }
        dragSrcRef.current = lead.length ? { kind: 'blocks', blocks: lead } : null;
      }
      return dragSrcRef.current;
    }
    return null;
  }

  function clearDropMark() {
    if (dropRef.current) dropRef.current.classList.remove('merge-left', 'merge-right');
    dropRef.current = null;
  }

  function onDragOverCapture(e) {
    const src = dragged(e);
    if (!src) return;
    const spot = mergeSpot(e);
    if (src.kind === 'blocks' && spot && src.blocks.some((x) => x.id === spot.block.id)) {
      clearDropMark();
      return;
    }
    if (!spot) {
      clearDropMark();
      if (src.kind === 'rowimg') e.preventDefault();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current !== spot.el) {
      clearDropMark();
      finishDrag();
    }
    dropRef.current = spot.el;
    spot.el.classList.remove('merge-left', 'merge-right');
    spot.el.classList.add(spot.side === 'left' ? 'merge-left' : 'merge-right');
  }

  // 我們自己處理放開時，ProseMirror 的「放在這裡」橫線沒機會收掉，會一直留在畫面上；補送一個 dragend 讓它收
  function finishDrag() {
    try {
      editor.prosemirrorView.dom.dispatchEvent(new Event('dragend'));
    } catch {
      // 沒有就不用收
    }
  }

  // 從檔案總管一次拖進多張圖片：自動併排，放在放開位置那一段的後面
  async function dropFiles(e, files) {
    e.preventDefault();
    e.stopPropagation();
    const outer = blockElAt(e.target);
    const at = outer && editor.getBlock(outer.getAttribute('data-id'));
    const list = await storeFiles(files.map((f) => ({ blob: f, name: f.name })));
    if (!list.length) return;
    const blocks = imageBlocks(list, true);
    if (at) editor.insertBlocks(blocks, at.id, 'after');
    else insertBlocks(blocks);
    notify('多張圖片已自動併排；要分開放，在圖上按右鍵選「拆開併排」');
  }

  function onDropCapture(e) {
    const files = e.dataTransfer ? [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')) : [];
    if (files.length > 1) {
      dropFiles(e, files);
      return;
    }
    const src = dragged(e);
    dragSrcRef.current = null;
    clearDropMark();
    if (!src) return;
    finishDrag();
    const spot = mergeSpot(e);
    if (src.kind === 'blocks') {
      if (!spot || src.blocks.some((x) => x.id === spot.block.id)) return;
      e.preventDefault();
      e.stopPropagation();
      const moving = src.blocks.flatMap(imagesOf);
      if (spot.text) {
        if (moving.length !== 1) {
          notify('一次只能拿一張圖和文字併排');
          return;
        }
        editor.transact(() => {
          editor.removeBlocks(src.blocks.map((x) => x.id));
          editor.replaceBlocks([spot.block.id], [sideImageBlock(moving[0], spot.block, spot.side)]);
        });
        return;
      }
      const target = imagesOf(spot.block);
      if (target.length + moving.length > MAX_PER_ROW) {
        notify(`一排最多 ${MAX_PER_ROW} 張圖`);
        return;
      }
      const next = [...target.slice(0, spot.index), ...moving, ...target.slice(spot.index)];
      editor.transact(() => {
        editor.removeBlocks(src.blocks.map((x) => x.id));
        editor.replaceBlocks([spot.block.id], [{ type: 'imageRow', props: { images: imagesProp(next) } }]);
      });
      return;
    }
    // 從併排裡拖出來的一張
    e.preventDefault();
    e.stopPropagation();
    let data;
    try {
      data = JSON.parse(e.dataTransfer.getData('application/x-makonote-rowimg'));
    } catch {
      return;
    }
    const row = editor.getBlock(data.block);
    const list = rowImages(row);
    const img = list[data.index];
    if (!row || !img) return;
    const rest = list.filter((_, k) => k !== data.index);
    const restBlocks = rest.length === 1 ? [{ type: 'image', props: { url: rest[0].url, name: rest[0].name || '' } }] : [{ type: 'imageRow', props: { images: imagesProp(rest) } }];
    if (spot && spot.text) {
      editor.transact(() => {
        editor.replaceBlocks([spot.block.id], [sideImageBlock(img, spot.block, spot.side)]);
        editor.replaceBlocks([row.id], restBlocks);
      });
      return;
    }
    if (spot && spot.block.id === row.id) {
      // 同一排裡換位置
      const to = spot.index > data.index ? spot.index - 1 : spot.index;
      const next = [...rest];
      next.splice(to, 0, img);
      editor.updateBlock(row, { props: { images: imagesProp(next) } });
      return;
    }
    if (spot) {
      const target = imagesOf(spot.block);
      if (target.length + 1 > MAX_PER_ROW) {
        notify(`一排最多 ${MAX_PER_ROW} 張圖`);
        return;
      }
      const next = [...target.slice(0, spot.index), img, ...target.slice(spot.index)];
      editor.transact(() => {
        editor.replaceBlocks([spot.block.id], [{ type: 'imageRow', props: { images: imagesProp(next) } }]);
        editor.replaceBlocks([row.id], restBlocks);
      });
      return;
    }
    // 拖到其他段落：放在那一段的上方或下方，成為單張圖片
    const outer = blockElAt(e.target);
    const at = outer && editor.getBlock(outer.getAttribute('data-id'));
    if (!at) return;
    const r = outer.getBoundingClientRect();
    const where = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
    editor.transact(() => {
      editor.insertBlocks([{ type: 'image', props: { url: img.url, name: img.name || '' } }], at.id, where);
      editor.replaceBlocks([row.id], restBlocks);
    });
  }

  // ---------- 段落連結：點了跳到指定方塊 ----------

  function jumpTo(id) {
    const el = wrapRef.current && wrapRef.current.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!el) {
      notify('找不到連結的段落，可能已經被刪除');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1400);
  }

  function onClickCapture(e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href.startsWith(BLOCK_LINK_PREFIX)) {
      e.preventDefault();
      e.stopPropagation();
      jumpTo(href.slice(BLOCK_LINK_PREFIX.length));
    } else if ((e.ctrlKey || e.metaKey) && /^https?:/.test(href)) {
      e.preventDefault();
      window.open(href);
    }
  }

  // ---------- 右鍵選單 ----------

  function onContextMenu(e) {
    // 只管編輯區本身；對話框（例如 OCR）裡的文字框交給全域的文字選單
    const outer = e.target.closest && e.target.closest('.bn-editor');
    if (!outer) return;
    e.preventDefault();
    e.stopPropagation();
    // 右鍵點在某個方塊上：那個方塊就是這次選單的對象
    const hit = blockElAt(e.target);
    const hitBlock = hit && editor.getBlock(hit.getAttribute('data-id'));
    const cur = hitBlock || editor.getTextCursorPosition().block;
    const hasSelection = !!editor.getSelectedText();
    const items = [];
    if (hasSelection) {
      items.push({ label: '剪下', icon: 'cut', run: () => api.win.edit('cut') });
      items.push({ label: '複製', icon: 'copy', run: () => api.win.edit('copy') });
      items.push({ label: '連結到文中段落…', icon: 'link', run: () => setLinkPicker(true) });
    }
    if (cur && cur.type === 'table') items.push({ label: '計算總時數', icon: 'clock', run: () => updateTotal(editor.getBlock(cur.id)) });
    if (cur && (cur.type === 'image' || cur.type === 'imageRow')) {
      const next = editor.getNextBlock(cur);
      const room = imagesOf(cur).length + imagesOf(next).length <= MAX_PER_ROW;
      if (next && imagesOf(next).length && room) {
        items.push({
          label: '與下一張圖併排',
          icon: 'row',
          run: () =>
            editor.transact(() => {
              const list = [...imagesOf(cur), ...imagesOf(next)];
              editor.removeBlocks([next.id]);
              editor.replaceBlocks([cur.id], [{ type: 'imageRow', props: { images: imagesProp(list) } }]);
            }),
        });
      }
      const nextP = editor.getNextBlock(cur);
      if (cur.type === 'image' && nextP && nextP.type === 'paragraph' && Array.isArray(nextP.content) && nextP.content.length) {
        for (const [side, label] of [['left', '與下一段文字並排（圖在左）'], ['right', '與下一段文字並排（圖在右）']]) {
          items.push({
            label,
            icon: 'row',
            run: () =>
              editor.transact(() => {
                editor.removeBlocks([cur.id]);
                editor.replaceBlocks([nextP.id], [sideImageBlock(imagesOf(cur)[0], nextP, side)]);
              }),
          });
        }
      }
      if (cur.type === 'imageRow')
        items.push({ label: '拆開併排', icon: 'layers', run: () => editor.replaceBlocks([cur.id], imageBlocks(rowImages(cur), false)) });
    }
    // 自訂的常用動作（設定 → 撰寫 → 右鍵選單）
    for (const id of menuIds(menuSettings)) {
      const a = actionById(id);
      if (!runners[id] || (id === 'copyLink' && !cur)) continue;
      items.push({ label: a.label, icon: a.icon, run: () => runners[id](cur) });
    }
    if (onCustomizeMenu) items.push({ label: '自訂這個選單…', icon: 'sliders', run: onCustomizeMenu });
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  return (
    <div
      ref={wrapRef}
      onClickCapture={onClickCapture}
      onContextMenu={onContextMenu}
      onPasteCapture={onPasteCapture}
      onKeyDownCapture={onKeyDownCapture}
      onDragOverCapture={onDragOverCapture}
      onDropCapture={onDropCapture}
      onDragLeave={(e) => !wrapRef.current.contains(e.relatedTarget) && clearDropMark()}
      onDragEndCapture={(e) => {
        if (!e.isTrusted) return; // 我們自己送出去讓橫線收掉的 dragend，不是真的拖曳結束
        clearDropMark();
        dragSrcRef.current = null;
      }}
    >
      <BlockNoteView
        editor={editor}
        theme="dark"
        slashMenu={false}
        formattingToolbar={false}
        onChange={() => {
          if (!readyRef.current) return;
          upgradeVideoBlocks();
          onMarkdown(serialize());
          localizeRemoteImages();
        }}
      >
        <SuggestionMenuController triggerCharacter="/" getItems={async (query) => filterSuggestionItems(slashItems, query)} />
        <FormattingToolbarController formattingToolbar={textToolbar} />
      </BlockNoteView>

      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      {ocrOpen && <OcrDialog settings={ocrSettings} onSettings={onOcrSettings} onInsert={insertQuote} onClose={() => setOcrOpen(false)} />}
      {linkPicker && <BlockLinkPicker editor={editor} onPick={linkToBlock} onClose={() => setLinkPicker(false)} />}
      {dialog && <InsertDialog dialog={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
