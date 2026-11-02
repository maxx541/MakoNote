// 介面只能透過 window.api 呼叫主程式，碰不到 Node 本身
const { contextBridge, ipcRenderer, webFrame } = require('electron');

const channels = [
  'app:getRoot',
  'app:chooseRoot',
  'lib:scan',
  'lib:read',
  'lib:write',
  'lib:updateMeta',
  'lib:listVariants',
  'lib:readVariant',
  'lib:writeVariant',
  'lib:deleteVariant',
  'clip:write',
  'cloud:status',
  'cloud:save',
  'cloud:clear',
  'cloud:plan',
  'cloud:manifest',
  'cloud:listArticles',
  'cloud:pickFolder',
  'cloud:upload',
  'cloud:restore',
  'lib:create',
  'lib:renameToTitle',
  'lib:move',
  'lib:createFolder',
  'lib:saveAsset',
  'lib:trash',
  'lib:reveal',
  'lib:readSettings',
  'lib:writeSettings',
  'lib:saveBackground',
  'lib:listThemes',
  'lib:saveTheme',
  'lib:deleteTheme',
  'stickers:pickFolder',
  'stickers:list',
  'win:edit',
  'ocr:run',
  'dialog:pickImages',
  'dialog:pickImage',
  'net:fetchImage',
  'net:fetchMeta',
  'game:search',
  'game:bind',
  'game:createCustom',
  'game:setCustomCover',
  'game:update',
];

const api = {};
for (const ch of channels) {
  // 'lib:readSettings' → api.lib.readSettings(...)
  const [group, name] = ch.split(':');
  api[group] = api[group] || {};
  api[group][name] = (...args) => ipcRenderer.invoke(ch, ...args);
}

// 主程式主動推給介面的事件（上傳與還原的進度）
const EVENTS = new Set(['cloud:progress']);
api.on = (channel, cb) => {
  if (!EVENTS.has(channel)) return () => {};
  const h = (_e, data) => cb(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

// 整個介面的縮放（像瀏覽器的 Ctrl+滾輪）：版面和字體一起等比例放大縮小
api.zoom = {
  get: () => webFrame.getZoomFactor(),
  set: (f) => webFrame.setZoomFactor(f),
};

contextBridge.exposeInMainWorld('api', api);
