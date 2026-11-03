import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errMsg, debounce, libUrl, gameCover, articleThumb } from './lib/util.js';
import { mergeSettings, themeVars } from './lib/settings.js';
import { processImage } from './lib/image.js';
import { buildSearch, runSearch, matchRule, selectionRule, SORTS, collectFacets, ruleIsEmpty } from './lib/query.js';
import Icon from './components/Icon.jsx';
import Sidebar from './components/Sidebar.jsx';
import { BlogView, GalView } from './components/LibraryViews.jsx';
import GamePage from './components/GamePage.jsx';
import Editor from './components/Editor.jsx';
import RuleDialog from './components/RuleDialog.jsx';
import SettingsDialog from './components/SettingsDialog.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import Backdrop from './components/Backdrop.jsx';
import StickerLayer from './components/StickerLayer.jsx';
import WorkMatchDialog from './components/WorkMatchDialog.jsx';
import HelpDialog, { TAGLINE } from './components/HelpDialog.jsx';
import logo from './assets/logo.png';
import { inMode, MODE_LABEL } from './lib/kind.js';

// Galgame／動畫收「主題」屬於它、或連結到該類作品的文章；部落格顯示全部
const VIEW_MODES = [
  { id: 'gal', icon: 'gal', label: 'Galgame' },
  { id: 'anime', icon: 'film', label: '動畫' },
  { id: 'blog', icon: 'blog', label: '部落格' },
];

export default function App() {
  const [root, setRoot] = useState(null);
  const [data, setData] = useState({ articles: [], folders: [], games: {} });
  const [settings, setSettings] = useState(mergeSettings());
  const [page, setPage] = useState({ name: 'library' });
  const [sel, setSel] = useState({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [adhoc, setAdhoc] = useState(null);
  const [ruleDialog, setRuleDialog] = useState(null);
  const [showSettings, setShowSettings] = useState(null); // 打開的設定分頁；null＝沒開
  const [matchOpen, setMatchOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [toast, setToast] = useState('');
  const [stickerFolders, setStickerFolders] = useState([]);
  const searchRef = useRef(null);
  // 使用說明：第一次進入自動跳出，之後從標題列的「？」打開
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    if (!root) return;
    let seen = false;
    try {
      seen = localStorage.getItem('makonote.helpSeen') === '1';
    } catch {
      // 讀不到就當沒看過
    }
    if (!seen) setHelpOpen(true);
  }, [root]);
  const closeHelp = () => {
    setHelpOpen(false);
    try {
      localStorage.setItem('makonote.helpSeen', '1');
    } catch {
      // 記不住就算了，下次再跳一次
    }
  };

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? '' : t)), 3500);
  }, []);

  const reload = useCallback(async () => {
    try {
      setData(await api.lib.scan());
    } catch (e) {
      notify(errMsg(e));
    }
  }, [notify]);

  // 啟動：讀文章庫位置與設定
  useEffect(() => {
    api.app.getRoot().then(setRoot);
  }, []);

  useEffect(() => {
    if (!root) return;
    api.lib.readSettings().then((s) => setSettings(mergeSettings(s)));
    reload();
  }, [root, reload]);

  // 回到視窗時重新掃描，外部改過的檔案（例如用記事本編輯）會反映出來
  useEffect(() => {
    const onFocus = () => {
      if (!root || page.name === 'editor') return;
      // 先問主程式現在的文章庫是哪個：設定被改過就換過去，不然才是單純重新掃描
      api.app.getRoot().then((r) => (r && r !== root ? setRoot(r) : reload()));
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [root, page.name, reload]);

  // 小貼圖資料夾：讀出裡面的圖片清單（同時讓主程式開放讀取這些資料夾）
  const stickerPaths = settings.stickers.folders.map((f) => f.path).join('\n');
  useEffect(() => {
    if (!root) return;
    api.stickers
      .list(stickerPaths ? stickerPaths.split('\n') : [])
      .then(setStickerFolders)
      .catch(() => setStickerFolders([]));
  }, [root, stickerPaths]);

  const saveSettings = useMemo(() => debounce((s) => api.lib.writeSettings(s).catch(() => {}), 500), []);
  const updateSettings = useCallback(
    (fn) => {
      setSettings((prev) => {
        const next = typeof fn === 'function' ? fn(prev) : { ...prev, ...fn };
        saveSettings(next);
        return next;
      });
    },
    [saveSettings],
  );

  const toggleSidebar = useCallback(() => updateSettings((s) => ({ ...s, sidebar: { ...s.sidebar, hidden: !s.sidebar.hidden } })), [updateSettings]);
  const toggleSidebarRef = useRef(toggleSidebar);
  toggleSidebarRef.current = toggleSidebar;

  // 整個介面縮放，像瀏覽器：Ctrl+滾輪、Ctrl+加號／減號、Ctrl+0 還原。版面和字體一起等比例變，記在這台電腦上
  useEffect(() => {
    const KEY = 'makonote.zoom';
    const clamp = (z) => Math.min(2.5, Math.max(0.5, Math.round(z * 100) / 100));
    const read = () => {
      try {
        return Number(localStorage.getItem(KEY)) || 1;
      } catch {
        return 1;
      }
    };
    const apply = (z, say) => {
      const f = clamp(z);
      api.zoom.set(f);
      try {
        localStorage.setItem(KEY, String(f));
      } catch {
        // 記不住也沒關係，只是下次打開回到 100%
      }
      if (say) notify(`縮放 ${Math.round(f * 100)}%`);
    };
    apply(read(), false);
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      apply(api.zoom.get() + (e.deltaY < 0 ? 0.1 : -0.1), true);
    };
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === '+' || e.key === '=') apply(api.zoom.get() + 0.1, true);
      else if (e.key === '-' || e.key === '_') apply(api.zoom.get() - 0.1, true);
      else if (e.key === '0') apply(1, true);
      else return;
      e.preventDefault();
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [notify]);

  // Ctrl+K 叫出搜尋（編輯頁不攔，那是插入連結的快捷鍵）
  useEffect(() => {
    const onKey = (e) => {
      // Ctrl+B：整個側邊欄收進左邊／拉出來（編輯頁沒有側邊欄，而且 Ctrl+B 是粗體）
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && page.name !== 'editor') {
        e.preventDefault();
        toggleSidebarRef.current();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && page.name !== 'editor') {
        e.preventDefault();
        if (page.name !== 'library') setPage({ name: 'library' });
        setTimeout(() => searchRef.current && searchRef.current.select(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page.name]);

  const fuse = useMemo(() => buildSearch(data.articles, data.games), [data]);

  // 目前模式裡的文章：側欄的數量、主題、標籤、篩選條件都以它為準，才不會切到 Galgame 還看到全部的數字
  const mode = settings.view.mode;
  const scoped = useMemo(() => (mode === 'blog' ? data.articles : data.articles.filter((a) => inMode(a.meta, mode, data.games))), [data.articles, data.games, mode]);
  const scopedData = useMemo(() => ({ ...data, articles: scoped }), [data, scoped]);
  const facets = useMemo(() => collectFacets(scoped), [scoped]);
  // 搜尋一律從文章庫根目錄的全部文章找（不管在哪個模式），選了資料夾也看那個資料夾的全部文章；
  // Galgame／動畫模式只用來分類作品牆，不限制搜尋與資料夾的範圍
  const base = query.trim() || sel.kind === 'folder' ? data.articles : scoped;

  const visible = useMemo(() => {
    const rule = selectionRule(sel, settings.collections);
    let list = base.filter((a) => matchRule(a, rule) && matchRule(a, adhoc));
    const scores = runSearch(fuse, query);
    if (scores) {
      list = list.filter((a) => scores.has(a.rel)).sort((x, y) => scores.get(x.rel) - scores.get(y.rel));
    } else {
      list = [...list].sort((SORTS[settings.view.sort] || SORTS.recent).fn);
    }
    return list;
  }, [base, sel, settings.collections, settings.view.sort, adhoc, fuse, query]);

  // ---------- 動作 ----------

  const openArticle = (rel) => setPage({ name: 'editor', rel, from: page.name === 'editor' ? page.from : page });

  async function createArticle(extra = {}) {
    try {
      const folder = sel.kind === 'folder' ? sel.value : '';
      const rel = await api.lib.create(folder, extra.title || '未命名文章');
      if (extra.works) {
        const a = await api.lib.read(rel);
        await api.lib.write(rel, { ...a.meta, works: extra.works }, a.body);
      }
      await reload();
      setPage({ name: 'editor', rel, isNew: true, from: page });
    } catch (e) {
      notify(errMsg(e));
    }
  }

  async function moveArticle(rel, folder) {
    try {
      await api.lib.move(rel, folder);
      await reload();
      notify(`已移到「${folder || '文章庫根目錄'}」`);
    } catch (e) {
      notify(errMsg(e));
    }
  }

  async function createFolder(parent) {
    const name = window.prompt('資料夾名稱', '新資料夾');
    if (!name) return;
    try {
      await api.lib.createFolder(parent || '', name);
      await reload();
    } catch (e) {
      notify(errMsg(e));
    }
  }

  function articleMenu(e, a) {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: '開啟', icon: 'pen', run: () => openArticle(a.rel) },
        { label: '在檔案總管開啟資料夾', icon: 'open', run: () => api.lib.reveal(a.rel) },
        {
          label: '移到資源回收筒',
          icon: 'trash',
          danger: true,
          run: async () => {
            if (!window.confirm(`把「${a.meta.title}」整個資料夾移到資源回收筒？\n（可以從資源回收筒還原）`)) return;
            await api.lib.trash(a.rel);
            reload();
          },
        },
      ],
    });
  }

  // ---------- 作品封面 ----------

  async function changeGameCover(id, dropped) {
    try {
      // dropped：拖進來或貼上的圖片檔；沒有就開檔案選擇視窗
      const f = dropped ? { name: dropped.name || '貼上的圖片', data: await dropped.arrayBuffer() } : await api.dialog.pickImage();
      if (!f) return;
      const { data: buf, ext } = await processImage(new Blob([f.data]), { maxEdge: 1600, format: 'webp', quality: 0.9 }, f.name);
      await api.game.setCustomCover(id, buf, ext);
      await reload();
      notify('封面已更換，原本的封面仍保留，可以隨時還原');
    } catch (e) {
      notify('更換封面失敗：' + errMsg(e));
    }
  }

  async function resetGameCover(id) {
    try {
      await api.game.setCustomCover(id, null, '');
      await reload();
    } catch (e) {
      notify(errMsg(e));
    }
  }

  async function refetchGame(id) {
    try {
      await api.game.bind(id);
      await reload();
      notify('已重新抓取作品資料');
    } catch (e) {
      notify('重新抓取失敗：' + errMsg(e));
    }
  }

  function gameMenu(e, id) {
    e.preventDefault();
    const g = data.games[id];
    const items = [
      { label: '開啟詳細頁', icon: 'external', run: () => setPage({ name: 'game', id }) },
      { label: '更換封面', icon: 'image', run: () => changeGameCover(id) },
    ];
    if (g && g.customCover) items.push({ label: '還原封面', icon: 'undo', run: () => resetGameCover(id) });
    if (g && g.source !== 'custom') items.push({ label: '重新抓取資料', icon: 'link', run: () => refetchGame(id) });
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  // 文字框（搜尋、標題、對話框裡的輸入框）的右鍵選單：剪下、複製、貼上、全選。
  // 其他地方的右鍵選單（文章、作品、編輯區）各自處理，這裡只接沒人處理的
  function textMenu(e) {
    if (e.defaultPrevented) return;
    const field = e.target.closest && e.target.closest('input, textarea');
    if (!field || field.disabled || !/^(text|search|url|email|number|password|)$/i.test(field.type || '') && field.tagName === 'INPUT') return;
    e.preventDefault();
    const selected = field.selectionStart !== field.selectionEnd;
    const items = [];
    if (selected && !field.readOnly) items.push({ label: '剪下', icon: 'cut', run: () => api.win.edit('cut') });
    if (selected) items.push({ label: '複製', icon: 'copy', run: () => api.win.edit('copy') });
    if (!field.readOnly) items.push({ label: '貼上', icon: 'paste', run: () => api.win.edit('paste') });
    items.push({ label: '全選', icon: 'select', run: () => field.select() });
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  function saveCollection(c) {
    updateSettings((s) => {
      const list = s.collections.filter((x) => x.id !== c.id);
      const idx = s.collections.findIndex((x) => x.id === c.id);
      if (idx >= 0) list.splice(idx, 0, c);
      else list.push(c);
      return { ...s, collections: list };
    });
    setSel({ kind: 'collection', value: c.id });
    setAdhoc(null);
  }

  function deleteCollection(id) {
    updateSettings((s) => ({ ...s, collections: s.collections.filter((x) => x.id !== id) }));
    setSel({ kind: 'all' });
  }

  // ---------- 畫面 ----------

  const style = themeVars(settings.theme);

  if (root === null) return <div className="app" style={style} />;
  if (!root) return <Welcome onChoose={async () => setRoot(await api.app.chooseRoot())} style={style} />;

  const ctx = {
    data,
    settings,
    openArticle,
    openGame: (id) => setPage({ name: 'game', id }),
    articleMenu,
    gameMenu,
    changeGameCover,
    resetGameCover,
    createArticle,
    reload,
    notify,
    updateSettings,
    openSettings: (tab) => setShowSettings(tab || 'look'),
  };

  const stickerFiles = settings.stickers.enabled
    ? stickerFolders.filter((f) => (settings.stickers.folders.find((x) => x.path === f.path) || {}).enabled).flatMap((f) => f.files)
    : [];
  const stickerTrigger = [page.name, page.rel || page.id || '', settings.view.mode, sel.kind, sel.value || '', query ? 'q' : ''].join('|');

  let bgImage = settings.theme.background ? libUrl(settings.theme.background) : '';
  if (page.name === 'editor' && settings.theme.editorBackground !== 'global') {
    const a = data.articles.find((x) => x.rel === page.rel);
    if (settings.theme.editorBackground === 'none') bgImage = '';
    else if (a) bgImage = gameCover(a, data.games) || (a.meta.cover ? articleThumb(a, data.games) : '') || bgImage;
  }

  const selLabel =
    sel.kind === 'all' && query.trim() ? '全部文章' : sel.kind === 'all' && mode !== 'blog' ? `${MODE_LABEL[mode]} 文章` : selectionLabel(sel, settings.collections);

  return (
    <div className="app" style={style} onClick={() => menu && setMenu(null)} onContextMenu={textMenu}>
      <Backdrop image={page.name === 'editor' ? '' : bgImage} />
      {stickerFiles.length > 0 && (
        <StickerLayer
          files={stickerFiles}
          corner={settings.stickers.corner}
          withSidebar={page.name !== 'editor'}
          size={settings.stickers.size}
          opacity={settings.stickers.opacity}
          trigger={stickerTrigger}
          hideWhenCovered={settings.stickers.hideWhenCovered}
          tooMany={page.name === 'library' && settings.stickers.maxArticles > 0 && visible.length > settings.stickers.maxArticles}
        />
      )}

      <header className="titlebar">
        <div className="brand">
          <img src={logo} className="brand-logo" alt="" />
          <span>MakoNote</span>
        </div>
        {page.name !== 'editor' && (
          <>
            <button className={'icon-btn ghost sidebar-toggle' + (settings.sidebar.hidden ? '' : ' on')} onClick={toggleSidebar} title={settings.sidebar.hidden ? '展開側邊欄（Ctrl+B）' : '收起側邊欄（Ctrl+B）'} aria-pressed={!settings.sidebar.hidden}>
              <Icon name="panel" size={18} />
            </button>
            <div className="search">
              <Icon name="search" size={16} />
              <input
                ref={searchRef}
                value={query}
                placeholder="搜尋標題、作品、標籤、內文…"
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (page.name !== 'library') setPage({ name: 'library' });
                }}
                onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              />
              {query ? (
                <button className="icon-btn ghost" onClick={() => setQuery('')} title="清除">
                  <Icon name="x" size={14} />
                </button>
              ) : (
                <kbd>Ctrl K</kbd>
              )}
            </div>
            <div className="seg-group">
              {VIEW_MODES.map((m) => (
                <button
                  key={m.id}
                  className={'seg' + (settings.view.mode === m.id && page.name === 'library' ? ' on' : '')}
                  onClick={() => {
                    updateSettings((s) => ({ ...s, view: { ...s.view, mode: m.id } }));
                    setPage({ name: 'library' });
                  }}
                  title={m.label + '模式'}
                >
                  <Icon name={m.icon} size={16} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
            <button className="btn primary" onClick={() => createArticle()}>
              <Icon name="plus" size={16} />
              新增文章
            </button>
            <button className="icon-btn" onClick={() => setShowSettings('look')} title="設定">
              <Icon name="sliders" size={18} />
            </button>
          </>
        )}
        <button className="icon-btn ghost help-btn" onClick={() => setHelpOpen(true)} title="使用說明">
          <Icon name="help" size={18} />
        </button>
      </header>

      {page.name === 'editor' ? (
        <Editor
          key={page.rel}
          rel={page.rel}
          isNew={page.isNew}
          ctx={ctx}
          facets={facets}
          backdrop={bgImage}
          onClose={async () => {
            await reload();
            setPage(page.from && page.from.name === 'game' ? page.from : { name: 'library' });
          }}
        />
      ) : (
        <div className="body">
          <Sidebar
            data={scopedData}
            folderData={data}
            facets={facets}
            collapsed={settings.sidebar.collapsed}
            hidden={settings.sidebar.hidden}
            onToggle={(key) => updateSettings((s) => ({ ...s, sidebar: { ...s.sidebar, collapsed: { ...s.sidebar.collapsed, [key]: !s.sidebar.collapsed[key] } } }))}
            collections={settings.collections}
            sel={sel}
            setSel={(s) => {
              setSel(s);
              setPage({ name: 'library' });
            }}
            onDropArticle={moveArticle}
            onCreateFolder={createFolder}
            onNewCollection={() => setRuleDialog({ mode: 'collection', rule: adhoc || undefined })}
            onEditCollection={(c) => setRuleDialog({ mode: 'collection', collection: c })}
            rootPath={root}
            onOpenRoot={() => api.lib.reveal('')}
          />
          <main className="main">
            {page.name === 'game' ? (
              <GamePage id={page.id} ctx={ctx} onBack={() => setPage({ name: 'library' })} />
            ) : (
              <>
                <div className="main-head">
                  <div>
                    <h1>{query ? `搜尋「${query}」` : selLabel}</h1>
                    <span className="muted">
                      {visible.length} 篇{query ? ` · 範圍：${selLabel}` : ''}
                    </span>
                  </div>
                  <div className="head-tools">
                    {adhoc && !ruleIsEmpty(adhoc) && (
                      <span className="chip on">
                        已套用篩選
                        <button className="chip-x" onClick={() => setAdhoc(null)} title="清除篩選">
                          <Icon name="x" size={12} />
                        </button>
                      </span>
                    )}
                    {mode !== 'blog' && (
                      <button className="btn" onClick={() => setMatchOpen(true)} title={`用標題裡的《作品名》批次連結${mode === 'gal' ? '遊戲（VNDB／Bangumi）' : '動畫（Bangumi）'}`}>
                        <Icon name="link" size={16} />
                        配對作品
                      </button>
                    )}
                    <button className="btn" onClick={() => setRuleDialog({ mode: 'adhoc', rule: adhoc || undefined })}>
                      <Icon name="filter" size={16} />
                      篩選
                    </button>
                    {!query && (
                      <select
                        value={settings.view.sort}
                        onChange={(e) => updateSettings((s) => ({ ...s, view: { ...s.view, sort: e.target.value } }))}
                      >
                        {Object.entries(SORTS).map(([k, v]) => (
                          <option key={k} value={k}>
                            依{v.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                {data.articles.length === 0 ? (
                  <EmptyLibrary onCreate={() => createArticle()} />
                ) : base.length === 0 ? (
                  <div className="empty-note">
                    沒有屬於{MODE_LABEL[mode]}的文章。這個模式收主題含「{mode === 'gal' ? 'gal' : '動畫'}」、或連結到{mode === 'gal' ? '遊戲' : '動畫'}作品的文章，在文章裡改「主題」或連結作品就會出現；切到「部落格」可以看到全部。
                  </div>
                ) : visible.length === 0 ? (
                  <div className="empty-note">沒有符合的文章。換個關鍵字，或清除篩選看看。</div>
                ) : mode === 'blog' ? (
                  <BlogView list={visible} ctx={ctx} query={query} />
                ) : (
                  <GalView list={visible} ctx={ctx} query={query} onOpenGame={(id) => setPage({ name: 'game', id })} />
                )}
              </>
            )}
          </main>
        </div>
      )}

      {ruleDialog && (
        <RuleDialog
          {...ruleDialog}
          data={data}
          facets={facets}
          onClose={() => setRuleDialog(null)}
          onApply={(rule) => {
            setAdhoc(ruleIsEmpty(rule) ? null : rule);
            setRuleDialog(null);
          }}
          onSaveCollection={(c) => {
            saveCollection(c);
            setRuleDialog(null);
          }}
          onDeleteCollection={(id) => {
            deleteCollection(id);
            setRuleDialog(null);
          }}
        />
      )}

      {showSettings && (
        <SettingsDialog
          initialTab={showSettings}
          root={root}
          stickerFolders={stickerFolders}
          settings={settings}
          updateSettings={updateSettings}
          notify={notify}
          onChangeRoot={async () => {
            const r = await api.app.chooseRoot();
            if (r !== root) {
              setRoot(r);
              setSel({ kind: 'all' });
              setShowSettings(null);
            }
          }}
          onClose={() => setShowSettings(null)}
        />
      )}

      {matchOpen && <WorkMatchDialog mode={mode} articles={visible} games={data.games} notify={notify} onDone={reload} onClose={() => setMatchOpen(false)} />}

      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      {helpOpen && <HelpDialog onClose={closeHelp} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function selectionLabel(sel, collections) {
  switch (sel.kind) {
    case 'status':
      return sel.value;
    case 'folder':
      return sel.value.split('/').pop();
    case 'topic':
      return '主題：' + sel.value;
    case 'tag':
      return '#' + sel.value;
    case 'collection': {
      const c = collections.find((x) => x.id === sel.value);
      return c ? c.name : '動態收藏';
    }
    default:
      return '全部文章';
  }
}

function Welcome({ onChoose, style }) {
  return (
    <div className="app" style={style}>
      <Backdrop image="" />
      <header className="titlebar">
        <div className="brand">
          <img src={logo} className="brand-logo" alt="" />
          <span>MakoNote</span>
        </div>
      </header>
      <div className="welcome">
        <img src={logo} className="welcome-logo" alt="" />
        <h1>MakoNote</h1>
        <p className="muted">{TAGLINE}</p>
        <button className="btn primary big" onClick={onChoose}>
          <Icon name="folder" size={18} />
          選擇文章庫資料夾
        </button>
      </div>
    </div>
  );
}

function EmptyLibrary({ onCreate }) {
  return (
    <div className="welcome small">
      <h2>還沒有文章</h2>
      <button className="btn primary" onClick={onCreate}>
        <Icon name="plus" size={16} />
        新增文章
      </button>
    </div>
  );
}
