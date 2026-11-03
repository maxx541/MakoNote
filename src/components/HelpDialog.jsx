import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import logo from '../assets/logo.png';
import shelf from '../assets/help/shelf.webp';
import game from '../assets/help/game.webp';
import editor from '../assets/help/editor.webp';
import slash from '../assets/help/slash.webp';
import smart from '../assets/help/smart.webp';
import ocr from '../assets/help/ocr.webp';
import baha from '../assets/help/baha.webp';

export const TAGLINE = '專為 Galgame 與動畫愛好者設計的筆記軟體';

const K = ({ children }) => <kbd>{children}</kbd>;

// 使用說明：一個功能一張圖，旁邊只寫「這是什麼」和幾個重點。畫面上其他地方不放操作說明
const FEATURES = [
  {
    title: '作品牆：以作品為中心',
    img: shelf,
    lead: '每篇文章都連結到一部作品。依作品排成封面牆，Galgame、動畫、部落格三種檢視隨時切換。',
    points: [
      <>寫文章時按「連結作品」，從 VNDB、Bangumi 帶入封面與資料；上方「配對作品」可一次配很多篇。</>,
      <><K>Ctrl</K> + <K>K</K> 搜尋整個文章庫，<K>Ctrl</K> + <K>B</K> 收起側邊欄。</>,
      <>把文章拖到左邊的資料夾就會搬移檔案。</>,
      <>文章就是你資料夾裡的 Markdown，不開 MakoNote 用記事本也讀得到。按右上角「新增文章」開始寫。</>,
    ],
  },
  {
    title: '作品頁：一部作品的全部',
    img: game,
    lead: '點封面進入作品頁：這部作品所有的文章、完成數、總共花了多少時間。',
    points: [
      <>「更換封面」，或直接把圖片拖到橫幅上。</>,
      <>作品配錯了按「重新配對」，勾選的文章會一起改連過去。</>,
    ],
  },
  {
    title: '寫作：專心寫，不被格式打斷',
    img: editor,
    lead: '背景是這部作品的封面，跟著文章一起捲動。右上角「版面」可以邊寫邊調字型、寬度、背景。',
    points: [
      <>選取文字會出現格式工具列；<K>Ctrl</K> + <K>Z</K> 連文章屬性的修改也能復原。</>,
      <>「完工」會記下完工日與撰寫時間（只算視窗在前景、而且有在輸入的時間）。</>,
      <><K>Ctrl</K> + 滾輪整個介面縮放，<K>Ctrl</K> + <K>0</K> 還原。</>,
    ],
  },
  {
    title: '方塊選單：輸入 / 就能插入',
    img: slash,
    lead: '標題、清單、摺疊、圖片、影片、提示框、表格，最上面是 MakoNote 專屬的「插入遊戲台詞」與「時數統計表」。',
    points: [
      <>貼上或拖進圖片，一次放多張會自動併排；拖到另一張圖或有字的段落旁邊就併排，拖分隔線調大小。</>,
      <>貼上單獨一個 YouTube 或 bilibili 網址，變成可直接播放的內嵌播放器。</>,
      <>按右鍵有常用動作，可在 設定 → 撰寫 自訂。</>,
    ],
  },
  {
    title: '智能分段：用句號判斷一段話說完沒',
    img: smart,
    lead: '沒有句號就代表還沒說完，下一行留在同一個文字塊；被切碎的文字塊也能一鍵併回去。',
    points: [
      <>按 <K>Enter</K> 沒句號只換行；連按兩次或 <K>Ctrl</K> + <K>Enter</K> 才開新的。</>,
      <>貼上多行文字依句號重新分段；句尾符號可以自訂。</>,
    ],
  },
  {
    title: '遊戲台詞：截圖丟進來就是文字',
    img: ocr,
    lead: '選、貼上或拖入一到多張截圖，用 Windows 內建 OCR 在本機辨識（圖片不會上傳），依順序合併成引用。',
    points: [
      <>內建排除表會自動拿掉 SAVE、AUTO、SKIP、LOG、返回、存檔這類遊戲介面的字。</>,
      <>也可加自己的忽略字詞，結果可先修改再插入。</>,
    ],
  },
  {
    title: '一篇文章，隨處分享',
    img: baha,
    lead: '編輯頁上方的分頁，同一篇文章預覽成巴哈、FB、串文、Google 文件、Markdown 的樣子。',
    points: [
      <>點分頁只是預覽，修改後才另存成該格式的版本，主稿不受影響。</>,
      <>文章屬性的「雲端」可把圖片備份到 Cloudinary，並換成雲端網址（金鑰在 設定 → 雲端）。</>,
    ],
  },
];

// 使用說明：一頁一個功能，用「上一頁／下一頁」翻。第一次進入會自動跳出，之後按標題列的「？」再打開
export default function HelpDialog({ onClose }) {
  const [page, setPage] = useState(0);
  const last = FEATURES.length - 1;
  const f = FEATURES[page];
  const go = (n) => setPage(Math.max(0, Math.min(last, n)));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setPage((p) => Math.min(last, p + 1));
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
      else if (e.key === 'Escape') onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, onClose]);

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
          <section className="help-feature" key={page}>
            <figure>
              <img src={f.img} alt={f.title} />
            </figure>
            <div>
              <p className="help-step">
                {page + 1} / {FEATURES.length}
              </p>
              <h3>{f.title}</h3>
              <p className="help-lead">{f.lead}</p>
              <ul>
                {f.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          </section>
        </div>
        <div className="modal-foot help-foot">
          <button className="btn" onClick={() => go(page - 1)} disabled={page === 0}>
            <Icon name="back" size={16} />
            上一頁
          </button>
          <div className="help-dots" role="tablist" aria-label="頁碼">
            {FEATURES.map((x, i) => (
              <button key={x.title} className={i === page ? 'on' : ''} onClick={() => go(i)} title={x.title} aria-label={x.title} aria-selected={i === page} role="tab" />
            ))}
          </div>
          {page < last ? (
            <button className="btn primary" onClick={() => go(page + 1)}>
              下一頁
              <Icon name="chevron" size={16} />
            </button>
          ) : (
            <button className="btn primary" onClick={onClose}>
              開始使用
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
