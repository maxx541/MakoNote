// Electron 主程式：開視窗、提供 lib:// 讀取文章庫檔案、把檔案操作開放給介面
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, clipboard, ClipboardItem, safeStorage, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const lib = require('./library.cjs');
const games = require('./games.cjs');
const ocr = require('./ocr.cjs');
const cloud = require('./cloud.cjs');

// 測試用：把使用者資料（金鑰、設定檔）放到別的位置，不動到真正的設定
if (process.env.GALNOTE_USER_DATA) app.setPath('userData', process.env.GALNOTE_USER_DATA);

// 改名前這個程式叫「心得書架」，設定檔在 %APPDATA%\心得書架；新資料夾還沒有設定檔時搬過來，不用重選文章庫
if (!process.env.GALNOTE_USER_DATA) {
  try {
    const next = path.join(app.getPath('userData'), 'config.json');
    const old = path.join(path.dirname(app.getPath('userData')), '心得書架', 'config.json');
    if (!fs.existsSync(next) && fs.existsSync(old)) {
      fs.mkdirSync(path.dirname(next), { recursive: true });
      fs.copyFileSync(old, next);
    }
  } catch {
    // 搬不過去就當第一次使用，重新選一次文章庫
  }
}

if (process.env.GALNOTE_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.GALNOTE_DEBUG_PORT);
}

// lib://local/<相對路徑> 對應到文章庫裡的檔案，介面用它顯示圖片
protocol.registerSchemesAsPrivileged([
  { scheme: 'lib', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// ---------- 使用者設定（只記文章庫位置，其他設定都存在文章庫裡） ----------

const configFile = () => path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
}

let root = process.env.GALNOTE_ROOT || readConfig().root || '';
if (root && !fs.existsSync(root)) root = '';

// 啟動記錄：每次啟動留一行，之後若看到的文章庫不對，可以對照這裡（userData/start.log）
try {
  fs.appendFileSync(
    path.join(app.getPath('userData'), 'start.log'),
    JSON.stringify({ time: new Date().toISOString(), pid: process.pid, root, configRoot: readConfig().root || '', envRoot: process.env.GALNOTE_ROOT || '' }) + '\n',
  );
} catch {
  // 寫不進去不影響程式
}

// 設定檔才是文章庫位置的依據。程式開著的時候別的地方改了設定（例如重新指定母資料夾），
// 這裡每次被問到、或又開了一次程式時都重讀一次，不會一直停在啟動時的舊資料夾。回傳有沒有換
function syncRoot() {
  if (process.env.GALNOTE_ROOT) return false;
  const next = readConfig().root || '';
  if (next && next !== root && fs.existsSync(next)) {
    root = next;
    return true;
  }
  return false;
}

// 允許 lib://ext/ 讀取的外部資料夾（目前只有小貼圖資料夾）
let externalDirs = new Set();

function requireRoot() {
  if (!root) throw new Error('尚未選擇文章庫資料夾');
  return root;
}

// ---------- Cloudinary 金鑰 ----------
// 雲名稱與 API key 不是機密，直接存；API secret 用系統加密（Windows 的 DPAPI）後才存，
// 只存在這台電腦的使用者資料夾，不會進到文章庫（文章庫可能會被同步或分享），也不會傳回介面。

function getCloudCreds() {
  const c = readConfig().cloud;
  if (!c || !c.cloudName || !c.apiKey || !c.secret) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return { cloudName: c.cloudName, apiKey: c.apiKey, apiSecret: safeStorage.decryptString(Buffer.from(c.secret, 'base64')) };
  } catch {
    return null;
  }
}

function requireCloud() {
  const c = getCloudCreds();
  if (!c) throw new Error('還沒有設定 Cloudinary 金鑰（設定 → 雲端）');
  return c;
}

function cloudStatus() {
  const c = readConfig().cloud;
  return {
    configured: !!getCloudCreds(),
    cloudName: c ? c.cloudName : '',
    apiKey: c ? c.apiKey : '',
    canEncrypt: safeStorage.isEncryptionAvailable(),
  };
}

// ---------- IPC ----------

const handlers = {
  'app:getRoot': () => {
    syncRoot();
    return root;
  },
  'app:chooseRoot': async () => {
    const r = await dialog.showOpenDialog({ title: '選擇文章庫資料夾', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return root;
    root = r.filePaths[0];
    writeConfig({ ...readConfig(), root });
    return root;
  },

  'lib:scan': () => lib.scan(requireRoot()),
  'lib:read': (rel) => lib.readArticle(requireRoot(), rel),
  'lib:write': (rel, meta, body) => lib.writeArticle(requireRoot(), rel, meta, body),
  'lib:updateMeta': (rel, patch) => lib.updateMeta(requireRoot(), rel, patch),
  'lib:listVariants': (rel) => lib.listVariants(requireRoot(), rel),
  'lib:readVariant': (rel, kind) => lib.readVariant(requireRoot(), rel, kind),
  'lib:writeVariant': (rel, kind, text, info) => lib.writeVariant(requireRoot(), rel, kind, text, info),
  'lib:deleteVariant': (rel, kind) => lib.deleteVariant(requireRoot(), rel, kind),
  // 把文字或 HTML 放進剪貼簿（貼到 Google 文件會保留格式）
  'clip:write': ({ text, html }) => {
    const item = { 'text/plain': text || '' };
    if (html) item['text/html'] = html;
    return clipboard.write([new ClipboardItem(item)]);
  },
  'lib:create': (folderRel, title) => lib.createArticle(requireRoot(), folderRel, title),
  'lib:renameToTitle': (rel, title, oldTitle) => lib.renameToTitle(requireRoot(), rel, title, oldTitle),
  'lib:move': (rel, target) => lib.move(requireRoot(), rel, target),
  'lib:createFolder': (parent, name) => lib.createFolder(requireRoot(), parent, name),
  'lib:saveAsset': (rel, data, ext) => lib.saveAsset(requireRoot(), rel, data, ext),
  'lib:trash': (rel) => shell.trashItem(lib.trashTarget(requireRoot(), rel)),
  // 檔案就在檔案總管裡選取它，資料夾就直接打開
  'lib:reveal': (rel) => {
    const abs = lib.resolveInside(requireRoot(), rel || '');
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) shell.showItemInFolder(abs);
    else shell.openPath(abs);
  },
  'lib:readSettings': () => lib.readLibSettings(requireRoot()),
  'lib:writeSettings': (s) => lib.writeLibSettings(requireRoot(), s),
  'lib:saveBackground': (data, ext) => lib.saveBackground(requireRoot(), data, ext),
  'lib:listThemes': () => lib.listThemes(requireRoot()),
  'lib:saveTheme': (name, theme) => lib.saveTheme(requireRoot(), name, theme),
  'lib:deleteTheme': (name) => lib.deleteTheme(requireRoot(), name),

  // 小貼圖：直接參考使用者指定的資料夾，不複製
  'stickers:pickFolder': async () => {
    const r = await dialog.showOpenDialog({ title: '選擇貼圖資料夾（建議放透明背景的圖片）', properties: ['openDirectory'] });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  },
  'stickers:list': (dirs) => {
    externalDirs = new Set(dirs.map((d) => path.resolve(d)));
    return dirs.map((d) => {
      let files = [];
      try {
        files = fs
          .readdirSync(d)
          .filter((f) => /\.(png|webp|gif|apng|avif|svg)$/i.test(f))
          .map((f) => path.join(d, f));
      } catch {
        // 資料夾被移走或改名時當作空的，設定頁會顯示 0 張
      }
      return { path: d, files };
    });
  },

  // 編輯區右鍵選單的剪下、複製、貼上
  'win:edit': (cmd) => {
    const wc = BrowserWindow.getFocusedWindow() && BrowserWindow.getFocusedWindow().webContents;
    if (wc && ['cut', 'copy', 'paste', 'selectAll'].includes(cmd)) wc[cmd]();
  },

  'ocr:run': (images, lang) => ocr.run(images, lang),

  'dialog:pickImages': async (title) => {
    const r = await dialog.showOpenDialog({
      title: title || '選擇遊戲截圖（可多選，會依檔名順序拼接）',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
    });
    if (r.canceled) return [];
    return r.filePaths
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((f) => ({ name: path.basename(f), data: fs.readFileSync(f) }));
  },

  'dialog:pickImage': async () => {
    const r = await dialog.showOpenDialog({
      title: '選擇圖片',
      properties: ['openFile'],
      filters: [{ name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const file = r.filePaths[0];
    return { name: path.basename(file), data: fs.readFileSync(file) };
  },

  // 從網頁複製貼上的圖片，由主程式下載（介面直接抓會被跨網域擋下）
  'net:fetchImage': async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下載圖片失敗 ${res.status}`);
    return { type: res.headers.get('content-type') || '', data: Buffer.from(await res.arrayBuffer()) };
  },

  // 書籤連結：抓網頁的標題、說明、預覽圖（只讀前面一段 HTML，抓不到就算了）
  'net:fetchMeta': async (url) => {
    if (!/^https?:\/\//i.test(String(url || ''))) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' } });
      if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return null;
      const html = (await res.text()).slice(0, 400000);
      const meta = (name) => {
        const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i');
        const tag = re.exec(html);
        const c = tag && /content=["']([^"']*)["']/i.exec(tag[0]);
        return c ? c[1].trim() : '';
      };
      const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
      let image = meta('og:image') || meta('twitter:image');
      if (image) image = new URL(decode(image), res.url).toString();
      return { title: decode(meta('og:title') || (t ? t[1].trim() : '')), desc: decode(meta('og:description') || meta('description')), image };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },

  'cloud:status': () => cloudStatus(),
  'cloud:save': async (cloudName, apiKey, apiSecret) => {
    const name = String(cloudName || '').trim();
    const key = String(apiKey || '').trim();
    const secret = String(apiSecret || '').trim();
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error('Cloud name 只能有英數字、底線和連字號');
    if (!/^\d{6,20}$/.test(key)) throw new Error('API key 應該是一串數字');
    if (!secret) throw new Error('請輸入 API secret');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('這台電腦無法加密儲存金鑰，所以不儲存');
    // 先驗證再存，輸錯的金鑰不會留下來
    await cloud.testCredentials({ cloudName: name, apiKey: key, apiSecret: secret });
    writeConfig({ ...readConfig(), cloud: { cloudName: name, apiKey: key, secret: safeStorage.encryptString(secret).toString('base64') } });
    return cloudStatus();
  },
  'cloud:clear': () => {
    const cfg = readConfig();
    delete cfg.cloud;
    writeConfig(cfg);
    return cloudStatus();
  },
  'cloud:plan': (rel) => cloud.plan(requireRoot(), rel),
  'cloud:manifest': (rel) => cloud.manifest(requireRoot(), rel),
  'cloud:listArticles': () => cloud.listArticles(requireCloud()),
  'cloud:pickFolder': async () => {
    const r = await dialog.showOpenDialog({ title: '選擇還原到哪個資料夾（會照原本的資料夾結構放回去）', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  },

  'game:search': (source, text, types, limit) => games.search(source, text, types, limit),
  'game:bind': (id) => games.bind(requireRoot(), id),
  'game:createCustom': (title) => games.createCustom(requireRoot(), title),
  'game:setCustomCover': (id, data, ext) => games.setCustomCover(requireRoot(), id, data, ext),
  'game:update': (id, patch) => games.updateWork(requireRoot(), id, patch),
};

ipcMain.handle('cloud:upload', (e, rel) => cloud.upload(requireRoot(), rel, requireCloud(), (p) => e.sender.send('cloud:progress', p)));
ipcMain.handle('cloud:restore', (e, ids, folder) => cloud.restore(requireCloud(), folder, ids, (p) => e.sender.send('cloud:progress', p)));

for (const [channel, fn] of Object.entries(handlers)) {
  ipcMain.handle(channel, (_e, ...args) => fn(...args));
}

// ---------- 視窗 ----------

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0f1218',
    title: 'MakoNote',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f1218', symbolColor: '#c9ced8', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // 外部連結用系統瀏覽器開，不在程式裡跳頁
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (/^https?:/.test(url) && !url.startsWith(process.env.VITE_DEV_SERVER_URL || '\u0000')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // 又開了一次程式：已經開著的視窗被叫到前面；如果這段時間設定檔裡的文章庫換了，順便重新載入成新的
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (syncRoot()) win.webContents.reload();
    }
  });

  app.whenReady().then(() => {
    // 介面是 file:// 載入的，沒有 Referer；YouTube 內嵌播放器沒有 Referer 會顯示「錯誤 153」拒絕播放，
    // bilibili 的播放器也會擋。只對這兩家的播放器網址補上 Referer，其他請求不動
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*', 'https://player.bilibili.com/*'] },
      (details, cb) => {
        const headers = { ...details.requestHeaders };
        if (!headers.Referer && !headers.referer) headers.Referer = details.url.includes('bilibili') ? 'https://www.bilibili.com/' : 'https://www.youtube-nocookie.com/';
        cb({ requestHeaders: headers });
      },
    );
    // 介面要能用 fetch 讀圖（例如畫到 canvas 上處理），回應加上 CORS 標頭
    const withCors = async (resPromise) => {
      const res = await resPromise;
      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(res.body, { status: res.status, headers });
    };
    protocol.handle('lib', (req) => withCors(serveLib(req)));
    function serveLib(req) {
      const url = new URL(req.url);
      const rel = url.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/');
      try {
        // lib://ext/<絕對路徑>：只開放設定裡登記過的外部資料夾（小貼圖）
        if (url.host === 'ext') {
          const abs = path.resolve(rel);
          const ok = [...externalDirs].some((d) => abs.startsWith(d + path.sep));
          if (!ok) return new Response('forbidden', { status: 403 });
          return net.fetch(pathToFileURL(abs).toString());
        }
        return net.fetch(pathToFileURL(lib.resolveInside(requireRoot(), rel)).toString());
      } catch {
        return new Response('not found', { status: 404 });
      }
    }
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
