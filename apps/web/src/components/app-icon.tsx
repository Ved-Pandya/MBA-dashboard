import type { SVGProps } from "react";

const paths = {
  today: "M4 5h16v15H4z M8 3v4 M16 3v4 M4 10h16 M8 14h3 M8 17h6",
  book: "M12 6v15 M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z",
  briefcase: "M3 7h18v13H3z M8 7V4h8v3 M3 12c5 3 13 3 18 0 M10 13h4v4h-4z",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  bell: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z M10 21h4 M12 2v2",
  people: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M20 21v-3a4 4 0 0 0-3-4 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M17 3a4 4 0 0 1 0 8",
  poll: "M4 21V10h4v11 M10 21V3h4v18 M16 21V7h4v14",
  form: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7",
  report: "M4 3h16v18H4z M8 8h8 M8 12h3 M8 16h8",
  board: "M3 4h18v16H3z M9 4v16 M15 4v16 M6 8v4 M12 8v7 M18 8v3",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  arrow: "M4 12h15 M14 7l5 5-5 5",
  chevron: "M9 5l7 7-7 7",
  plus: "M12 4v16 M4 12h16",
  check: "M5 12l4 4L19 6",
  close: "M5 5l14 14 M19 5 5 19",
  logout: "M9 3H4v18h5 M10 12h11 M16 7l5 5-5 5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
} as const;
export type IconName = keyof typeof paths;
export function AppIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}

export function Brand() {
  return <div className="brand"><span className="brand-mark"><AppIcon name="today" /></span><span>Deadline<span className="brand-suffix">OS</span></span></div>;
}
