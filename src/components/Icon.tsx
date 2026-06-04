// Stroke-based icon set, ported from the reference (ui.jsx).
import React from "react";

const ICONS: Record<string, string> = {
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8",
  briefcase:
    "M4 8.5A1.5 1.5 0 015.5 7h13A1.5 1.5 0 0120 8.5V18a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18zM9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7M4 12h16",
  users:
    "M8 11a3 3 0 100-6 3 3 0 000 6zM2.5 19a5.5 5.5 0 0111 0M16 11a3 3 0 10-1.5-5.6M15 13.6a5.5 5.5 0 016.5 5.4",
  plus: "M12 5v14M5 12h14",
  mic: "M12 4a2.5 2.5 0 012.5 2.5v5a2.5 2.5 0 01-5 0v-5A2.5 2.5 0 0112 4zM6 11a6 6 0 0012 0M12 17v3",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12M18 6L6 18",
  chevron: "M6 9l6 6 6-6",
  chevronR: "M9 6l6 6-6 6",
  share: "M16 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM6 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM16 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM8.2 10.8l5.6-3.1M8.2 13.2l5.6 3.1",
  filter: "M4 6h16M7 12h10M10 18h4",
  bolt: "M13 3L5 13h5l-1 8 8-10h-5z",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v4l3 2",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  sliders: "M5 8h9M18 8h1M5 16h1M10 16h9M14 6v4M6 14v4",
  building: "M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16M15 21V9h3a2 2 0 012 2v10M8 7h2M8 11h2M8 15h2",
  sparkle2: "M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z",
  alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
  shield: "M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  warn: "M12 9v4M12 16h.01M10.3 4.3l-7.6 13A1.5 1.5 0 004 19.6h16a1.5 1.5 0 001.3-2.3l-7.6-13a1.5 1.5 0 00-2.6 0z",
  user: "M12 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM5 20a7 7 0 0114 0",
  wallet:
    "M4 7a2 2 0 012-2h11a1 1 0 011 1v2M4 7v10a2 2 0 002 2h13a1 1 0 001-1v-2M4 7h15a1 1 0 011 1v2M17 12a1.5 1.5 0 100 3h4v-3z",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  calendar: "M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM4 9h16M8 3v4M16 3v4",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  link: "M9.5 14.5l5-5M8 13l-2 2a3 3 0 004.2 4.2l2-2M16 11l2-2A3 3 0 0013.8 4.8l-2 2",
  video: "M4 7a1 1 0 011-1h9a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1zM15 10l5-3v10l-5-3",
  message: "M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7a2.5 2.5 0 01-2.5 2.5H9l-4 3.5v-3.5H6.5A2.5 2.5 0 014 13.5z",
};

export function Icon({
  name,
  size = 18,
  className = "",
  style = {},
  stroke = 1.6,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  stroke?: number;
}) {
  const d = ICONS[name] ?? ICONS.spark;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {d
        .split("M")
        .filter(Boolean)
        .map((seg, i) => (
          <path key={i} d={"M" + seg} />
        ))}
    </svg>
  );
}
