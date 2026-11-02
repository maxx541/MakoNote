// 整個視窗的背景圖與遮罩：圖片一層、遮罩一層，介面內容疊在上面
export default function Backdrop({ image }) {
  return (
    <div className="backdrop" aria-hidden="true">
      {image && <div className="backdrop-img" style={{ backgroundImage: `url("${image}")` }} />}
      <div className="backdrop-mask" />
    </div>
  );
}
