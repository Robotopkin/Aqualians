"use client";

import { useId } from "react";

export default function TideNum({ value, small = false }: { value: string; small?: boolean }) {
  const id = `aura-${useId().replace(/:/g, "")}`;
  const fontSize = small ? 30 : 40;
  const height = small ? 36 : 48;
  const baseline = small ? 29 : 38;
  const width = Math.max(small ? 32 : 40, value.length * (small ? 24 : 32));
  return (
    <svg className={`tide-svg${small ? " small" : ""}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={value}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2={width} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="10%" stopColor="#f4fff9" />
          <stop offset="42%" stopColor="#7ee7ff" />
          <stop offset="68%" stopColor="#e4d2ff" />
          <stop offset="100%" stopColor="#f0d48a" />
        </linearGradient>
      </defs>
      <text x="0" y={baseline} fill={`url(#${id})`} fontSize={fontSize} fontWeight="600" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        {value}
      </text>
    </svg>
  );
}
