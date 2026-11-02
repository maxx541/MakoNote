// 編輯器能做的動作清單：斜線選單與右鍵選單共用同一份。
// 新增方塊或斜線選單項目時加在這裡，設定 → 撰寫 的「右鍵選單」就能把它挑進去。
//   group：斜線選單的分組（仿 Anytype／Notion：文字、列表、媒體、其他）
//   slash：在斜線選單出現時的說明與搜尋別名；沒有 slash 的只出現在右鍵選單（例如貼上）
// 真正執行的程式在 BlockEditor.jsx 的 runners。

export const SLASH_GROUPS = ['MakoNote', '文字', '列表', '媒體', '其他'];

export const EDITOR_ACTIONS = [
  // 只在右鍵選單
  { id: 'paste', label: '貼上', icon: 'paste' },
  { id: 'selectAll', label: '全選', icon: 'select' },
  { id: 'copyLink', label: '複製這段的連結', icon: 'link' },

  // MakoNote 自己的
  { id: 'ocr', label: '插入遊戲台詞（OCR）', icon: 'pen', group: 'MakoNote', slash: { title: '插入遊戲台詞', subtext: '選截圖自動辨識文字，以引用插入', aliases: ['台詞', 'ocr', 'taici'] } },
  { id: 'timeStats', label: '插入時數統計表', icon: 'clock', group: 'MakoNote', slash: { title: '時數統計表', subtext: '路線時數表格；填完後右鍵「計算總時數」自動加總', aliases: ['時數', '時長', 'time', 'shishu'] } },

  // 文字
  { id: 'paragraph', label: '插入段落', icon: 'text', group: '文字', slash: { title: '文字', subtext: '一般段落', aliases: ['p', 'text', '段落', 'wenzi'] } },
  { id: 'h1', label: '插入標題', icon: 'h1', group: '文字', slash: { title: '標題', subtext: '大標題', aliases: ['h1', 'title', 'biaoti'] } },
  { id: 'h2', label: '插入子標題', icon: 'h2', group: '文字', slash: { title: '子標題', subtext: '中標題', aliases: ['h2', 'subtitle', 'zibiaoti'] } },
  { id: 'h3', label: '插入小標題', icon: 'h3', group: '文字', slash: { title: '小標題', subtext: '小標題', aliases: ['h3', 'xiaobiaoti'] } },
  { id: 'quote', label: '插入引用', icon: 'book', group: '文字', slash: { title: '引用', subtext: '引用一段話或台詞', aliases: ['quote', 'yinyong', '>'] } },
  { id: 'callout', label: '插入提示框', icon: 'callout', group: '文字', slash: { title: 'Callout 提示框', subtext: '有底色的提示、注意事項（存成 > [!NOTE]）', aliases: ['callout', 'note', 'tip', '提示', '注意', 'tishi'] } },
  { id: 'code', label: '插入程式碼', icon: 'code', group: '文字', slash: { title: '程式碼', subtext: '等寬字的程式碼區塊', aliases: ['code', '```', 'chengshi'] } },

  // 列表
  { id: 'check', label: '插入核取方塊', icon: 'checkbox', group: '列表', slash: { title: 'Checkbox 核取方塊', subtext: '可以打勾的待辦清單', aliases: ['todo', 'check', 'checkbox', '待辦', 'hequ'] } },
  { id: 'bullet', label: '插入項目清單', icon: 'bullets', group: '列表', slash: { title: 'Bulleted List 項目清單', subtext: '圓點清單', aliases: ['ul', 'list', 'bullet', '清單', 'xiangmu'] } },
  { id: 'numbered', label: '插入編號清單', icon: 'numbers', group: '列表', slash: { title: 'Numbered List 編號清單', subtext: '1. 2. 3. 的清單', aliases: ['ol', 'numbered', '編號', 'bianhao'] } },
  { id: 'toggle', label: '插入摺疊清單', icon: 'toggle', group: '列表', slash: { title: 'Toggle 折疊清單', subtext: '點箭頭展開、收合內容（存成 <details>）', aliases: ['toggle', 'details', '摺疊', '折疊', 'zhedie'] } },
  { id: 'toggleH1', label: '插入折疊標題', icon: 'h1', group: '列表', slash: { title: 'Toggle 折疊文章標題', subtext: '可以收合底下內容的大標題', aliases: ['toggle h1', '折疊標題'] } },
  { id: 'toggleH2', label: '插入折疊子標題', icon: 'h2', group: '列表', slash: { title: 'Toggle 折疊標題', subtext: '可以收合底下內容的中標題', aliases: ['toggle h2', '折疊標題'] } },
  { id: 'toggleH3', label: '插入折疊小標題', icon: 'h3', group: '列表', slash: { title: 'Toggle 折疊子標題', subtext: '可以收合底下內容的小標題', aliases: ['toggle h3', '折疊標題'] } },

  // 媒體
  { id: 'image', label: '插入圖片', icon: 'image', group: '媒體', slash: { title: '圖片', subtext: '從電腦選一張或多張，可以直接併排（存進這篇的 assets/）', aliases: ['image', 'img', '圖片', 'tupian'] } },
  { id: 'imageRow', label: '插入併排圖片', icon: 'row', group: '媒體', slash: { title: '併排圖片', subtext: '一排放 2～4 張圖，等高縮放', aliases: ['row', 'gallery', '併排', '並排', 'bingpai'] } },
  { id: 'video', label: '插入影片（YouTube／B 站）', icon: 'video', group: '媒體', slash: { title: 'Video 影片', subtext: '貼 YouTube、bilibili 網址內嵌播放，或選本機影片檔', aliases: ['video', 'youtube', 'yt', 'bilibili', 'b站', '影片', 'yingpian'] } },
  { id: 'audio', label: '插入音訊', icon: 'audio', group: '媒體', slash: { title: 'Audio 音訊', subtext: '上傳或嵌入音訊檔', aliases: ['audio', 'mp3', '音訊', '音樂', 'yinxun'] } },
  { id: 'file', label: '插入檔案', icon: 'file', group: '媒體', slash: { title: '檔案', subtext: '附加任何檔案（存進這篇的 assets/）', aliases: ['file', '附件', 'dangan'] } },
  { id: 'bookmark', label: '插入書籤連結', icon: 'bookmark', group: '媒體', slash: { title: '書籤連結', subtext: '網址顯示成有標題的連結卡片', aliases: ['bookmark', 'link', 'url', '書籤', '連結', 'shuqian'] } },

  // 其他
  { id: 'divider', label: '插入分隔線', icon: 'divider', group: '其他', slash: { title: '分隔線', subtext: '一條橫線', aliases: ['hr', '---', 'divider', 'fenge'] } },
  { id: 'table', label: '插入表格', icon: 'table', group: '其他', slash: { title: '表格', subtext: '3 欄的表格', aliases: ['table', '表格', 'biaoge'] } },
  { id: 'emoji', label: '插入表情符號', icon: 'smile', group: '其他', slash: { title: '表情符號', subtext: '搜尋並插入表情符號', aliases: ['emoji', '表情'] } },
];

// 右鍵選單的預設內容（和原本固定的選單一樣）
export const DEFAULT_MENU = ['paste', 'ocr', 'timeStats', 'image', 'toggle', 'quote', 'copyLink'];

export const actionById = (id) => EDITOR_ACTIONS.find((a) => a.id === id);

// 設定裡存的清單可能有舊版或已移除的動作，過濾掉；沒設定過就用預設
export function menuIds(saved) {
  const list = Array.isArray(saved) ? saved : DEFAULT_MENU;
  return list.filter((id, i) => actionById(id) && list.indexOf(id) === i);
}
