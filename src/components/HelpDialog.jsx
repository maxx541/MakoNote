import Icon from './Icon.jsx';
import logo from '../assets/logo.png';

export const TAGLINE = '專為 Galgame 與動畫愛好者設計的筆記軟體';

const K = ({ children }) => <kbd>{children}</kbd>;

// 使用說明的內容。畫面上其他地方不放說明文字，要查怎麼用都在這裡
const SECTIONS = [
  {
    title: '開始',
    items: [
      <>文章庫就是你選的一個資料夾：一篇心得一個資料夾，內文是 Markdown，圖片放在旁邊的 <code>assets/</code>。不開這個程式，用記事本或 Obsidian 也讀得到。</>,
      <>按右上的「新增心得」開始寫；寫完按「完工」，會記下完工日與這篇花的撰寫時間（只算視窗在前景、而且有在輸入的時間）。</>,
      <>文章庫位置在 設定 → 文章庫 可以換。</>,
    ],
  },
  {
    title: '書架',
    items: [
      <>Galgame、動畫、部落格三種模式：依文章的「主題」分類，連結到該類作品的心得也會一起出現。左邊的資料夾樹永遠顯示整個文章庫，不受模式影響。</>,
      <><K>Ctrl</K> + <K>K</K> 搜尋整個文章庫（標題、作品名、標籤、內文）。<K>Ctrl</K> + <K>B</K> 收起或展開側邊欄。</>,
      <>文章可以拖到左邊的資料夾；在文章或作品上按右鍵有更多動作。點作品進入作品頁，可以更換封面（也能直接把圖片拖到橫幅上）、重新配對作品。</>,
      <>作品資料和封面來自 VNDB 與 Bangumi；寫文章時用「連結作品」配對，書架上方可以批次配對。</>,
    ],
  },
  {
    title: '寫作',
    items: [
      <>在空行輸入 <K>/</K> 叫出方塊選單（標題、清單、摺疊、圖片、影片、提示框、時數統計表…）；按右鍵有常用動作，可以在 設定 → 撰寫 自訂。</>,
      <>選取文字會出現格式工具列，可以改段落類型、粗體、連結，也能「連結到段落」跳到文中別處。<K>Ctrl</K> + <K>Z</K> 復原，連文章屬性的修改也一起復原。</>,
      <>「智能分段」：用句號判斷一段話結束了沒。沒有句號時按 <K>Enter</K> 只換行、留在同一個文字塊；連按兩次或 <K>Ctrl</K> + <K>Enter</K> 開新的；貼上多行文字會依句號重新分段；也能一鍵把被切碎的文字塊併回去。句尾符號可以自訂。</>,
      <>右上角「版面」按鈕開啟側邊面板：字型、行距、寬度、背景圖、遮罩，邊寫邊調、立刻看到效果。</>,
    ],
  },
  {
    title: '圖片與影片',
    items: [
      <>圖片可以貼上、拖進來或用選單插入。一次放多張會自動併排（每排最多 4 張）。</>,
      <>把圖片拖到另一張圖或同一排的左右側就併排；拖到有字的段落左右側，就變成圖文並排。拖兩張之間的分隔線調整大小，接近同大小會吸附。</>,
      <>貼上單獨一個 YouTube 或 bilibili 網址會變成內嵌播放器，拖右下角等比例縮放。</>,
    ],
  },
  {
    title: '遊戲台詞辨識',
    items: [
      <>輸入 <K>/</K> 台詞，或右鍵選「插入遊戲台詞」：選、貼上或拖入一到多張截圖，用 Windows 內建 OCR 辨識（圖片不會上傳），依順序合併成引用。</>,
      <>內建排除表會拿掉遊戲介面的字（SAVE、AUTO、SKIP、LOG、返回、存檔…），也可以加自己的忽略字詞；結果可以先修改再插入。</>,
    ],
  },
  {
    title: '發佈到各平台',
    items: [
      <>編輯頁上方的分頁可以預覽成 Markdown、巴哈、FB、串文（Threads、X、Bluesky）、Google 文件格式。點了只是預覽，修改後才會建立獨立版本，不影響主稿。</>,
      <>文章屬性的「雲端」可以把圖片與文章備份到 Cloudinary，並把巴哈、Markdown 版本換成雲端網址（金鑰在 設定 → 雲端）。</>,
    ],
  },
  {
    title: '外觀與快捷鍵',
    items: [
      <>整個介面縮放：<K>Ctrl</K> + 滾輪，或 <K>Ctrl</K> + <K>+</K> / <K>-</K>，<K>Ctrl</K> + <K>0</K> 還原。</>,
      <>設定裡有背景圖、遮罩、字型、主題、小貼圖等。外觀可以存成主題帶去別台電腦。</>,
    ],
  },
];

// 使用說明：第一次進入會自動跳出，之後按標題列的「？」再打開
export default function HelpDialog({ onClose }) {
  return (
    <div className="modal-wrap" onMouseDown={onClose}>
      <div className="modal help-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-head">
          <img src={logo} alt="" className="help-logo" />
          <div>
            <h2>MakoNote 使用說明</h2>
            <p>{TAGLINE}</p>
          </div>
          <button className="icon-btn ghost" onClick={onClose} title="關閉">
            <Icon name="x" />
          </button>
        </div>
        <div className="help-body">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3>{s.title}</h3>
              <ul>
                {s.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="modal-foot">
          <span className="muted small">之後想再看，按右上角的「？」。</span>
          <button className="btn primary" onClick={onClose}>
            開始使用
          </button>
        </div>
      </div>
    </div>
  );
}
