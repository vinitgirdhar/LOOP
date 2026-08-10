import type { SVGProps } from 'react';

/** One stroked 24×24 grid, so every icon lines up without an icon package. */
const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export const Icon = {
  home: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-6h5v6" /></svg>
  ),
  board: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><rect x="3" y="4" width="5.5" height="16" rx="1.5" /><rect x="9.75" y="4" width="5.5" height="10" rx="1.5" /><rect x="16.5" y="4" width="4.5" height="13" rx="1.5" /></svg>
  ),
  check: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 12.5l5 5L20 6.5" /></svg>,
  sprint: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M4 20V9" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M2 20h20" /></svg>
  ),
  bolt: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" /></svg>,
  sparkles: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" /><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" /></svg>
  ),
  chat: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M20 15a3 3 0 01-3 3H8l-4 3V6a3 3 0 013-3h10a3 3 0 013 3v9z" /></svg>,
  doc: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>
  ),
  folder: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>,
  calendar: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
  ),
  video: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><rect x="2.5" y="6" width="13" height="12" rx="2" /><path d="M15.5 10.5l6-3.5v10l-6-3.5" /></svg>
  ),
  clock: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.5l3.5 2" /></svg>,
  chart: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M3 20h18" /><path d="M6 20v-6M11 20V7M16 20v-9M21 20V4" /></svg>
  ),
  settings: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1A1.6 1.6 0 003.6 8a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H8a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V8a1.6 1.6 0 001.5 1H22a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" /></svg>
  ),
  shield: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 3l8 3v6c0 5-3.4 8.4-8 9.5C7.4 20.4 4 17 4 12V6l8-3z" /></svg>,
  bell: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M18 8a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7" /><path d="M13.7 20a2 2 0 01-3.4 0" /></svg>
  ),
  search: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>,
  plus: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>,
  more: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></svg>
  ),
  menu: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  close: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  chevronRight: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M9 5l7 7-7 7" /></svg>,
  chevronDown: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 9l7 7 7-7" /></svg>,
  arrowLeft: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>,
  logout: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
  ),
  user: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></svg>,
  users: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.4 2.9-5.5 6.5-5.5s6.5 2.1 6.5 5.5" /><path d="M17 5.5a3.5 3.5 0 010 6.5M18.5 20c0-2.3-.7-3.9-2-5" /></svg>
  ),
  block: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg>,
  flag: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>,
  trash: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" /></svg>
  ),
  link: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M10 13a4 4 0 005.7 0l3-3a4 4 0 10-5.7-5.7L11.5 5.8" /><path d="M14 11a4 4 0 00-5.7 0l-3 3A4 4 0 1011 19.7l1.4-1.4" /></svg>
  ),
  github: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M9 19c-4.3 1.4-4.3-2.2-6-2.6m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.3 4.3 0 00-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 00-6.2 0C6.5 3.2 5.4 3.5 5.4 3.5a4.3 4.3 0 00-.1 3.2A4.6 4.6 0 004 9.9c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" /></svg>
  ),
  download: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 3v12M7 11l5 5 5-5M4 20h16" /></svg>,
  play: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M7 4l12 8-12 8V4z" /></svg>,
  stop: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>,
  filter: (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" /></svg>,
  alert: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M12 3l9.5 17H2.5L12 3z" /><path d="M12 9v5M12 17.5v.01" /></svg>
  ),
  contrast: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 3v18a9 9 0 000-18z" fill="currentColor" stroke="none" /></svg>
  ),
  paperclip: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.4 3.4 0 014.8 4.8l-8.6 8.6a1.8 1.8 0 01-2.5-2.5l7.9-7.9" /></svg>
  ),
  checkSquare: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9" /><path d="M8.5 11.5l3 3 8-8.5" /></svg>
  ),
  smile: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 007 0" /><path d="M9 9.5v.01M15 9.5v.01" /></svg>
  ),
  send: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M4.5 12L20 4l-4.5 16-3.5-6-7.5-2z" /></svg>
  ),
  reply: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M9 8L4 12l5 4" /><path d="M4 12h9a6 6 0 016 6v2" /></svg>
  ),
  lock: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><rect x="4.5" y="10" width="15" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></svg>
  ),
  sheet: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 9.5h17M9 9.5V20M15 9.5V20" /></svg>
  ),
  image: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><rect x="3" y="4.5" width="18" height="15" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" /></svg>
  ),
  archive: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><rect x="3" y="4" width="18" height="4.5" rx="1.5" /><path d="M5 8.5V19a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 19V8.5" /><path d="M10 12.5h4" /></svg>
  ),
  film: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="M7.5 4.5v15M16.5 4.5v15M3 12h18M3 8.25h4.5M3 15.75h4.5M16.5 8.25H21M16.5 15.75H21" /></svg>
  ),
  eye: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>
  ),
  target: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>
  ),
};

export type IconName = keyof typeof Icon;
