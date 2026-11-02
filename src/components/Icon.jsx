// 線條圖示（不用 emoji，各平台顯示一致）
const PATHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  blog: 'M4 5h6v6H4zM13 6h7M13 10h5M4 15h6v4H4zM13 15h7M13 19h5',
  gal: 'M5 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5zM5 3v18M17 7h2v14H9',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  folderPlus: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v5M9.5 13.5h5',
  back: 'M15 5l-7 7 7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1 1 0 1 0 0 .1',
  tag: 'M3 12V4h8l9 9-8 8zM7.5 7.5h.01',
  filter: 'M4 5h16l-6 8v5l-4 2v-7z',
  star: 'M12 4l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z',
  x: 'M6 6l12 12M18 6L6 18',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  layers: 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1M3 7v10a2 2 0 0 0 2 2h12l4-8H7l-4 8',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  panel: 'M4 5h16v14H4zM9.5 5v14',
  chevron: 'M9 6l6 6-6 6',
  film: 'M4 5h16v14H4zM10 9.2v5.6l4.6-2.8z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  text: 'M5 6h14M12 6v13M9 19h6',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2.9-1.2 1.8M12 16.8h.01',
  paragraph: 'M13 4H9.5a3.5 3.5 0 0 0 0 7H13M13 4v16M17 4v16',
  h1: 'M4 6v12M12 6v12M4 12h8M16 10l3-2v10',
  h2: 'M4 6v12M12 6v12M4 12h8M15.5 10a2.5 2.5 0 0 1 5 0c0 2-5 4-5 8h5',
  h3: 'M4 6v12M12 6v12M4 12h8M15.5 8h5l-3 4a3 3 0 1 1-2 5',
  bullets: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  numbers: 'M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M4 15.5a1.5 1.5 0 0 1 3 0c0 1-3 2-3 3.5h3',
  checkbox: 'M4 4h16v16H4zM8 12l3 3 5-6',
  toggle: 'M5 7l4 3-4 3zM12 10h8M12 16h8M8 16h.01',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  divider: 'M3 12h18M7 7h10M7 17h10',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  callout: 'M4 5h16v11H9l-5 4zM12 8v3M12 13.5h.01',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
  audio: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  row: 'M3 6h5v12H3zM9.5 6h5v12h-5zM16 6h5v12h-5z',
  smile: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  paste: 'M8 4h8v3H8zM6 5H4v16h16V5h-2M8 12h8M8 16h5',
  cut: 'M6 6a2.5 2.5 0 1 0 0 .1M6 18a2.5 2.5 0 1 0 0 .1M8 7.5L20 18M8 16.5L20 6',
  select: 'M4 4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 8v8M20 8v8M8 4h8M8 20h8',
};

export default function Icon({ name, size = 18, stroke = 1.7, className = '' }) {
  return (
    <svg
      className={'icon ' + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'dots' ? 3 : stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] || ''} />
    </svg>
  );
}
