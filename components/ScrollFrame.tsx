"use client";

import { useEffect, useRef, useState } from "react";

const D = 32;
const R = D / 2;
const K = 0.5522847498;

function leftHalf(cx: number, cy: number) {
  const k = R * K;
  return `M ${cx} ${cy - R} C ${cx - k} ${cy - R} ${cx - R} ${cy - k} ${cx - R} ${cy} C ${cx - R} ${cy + k} ${cx - k} ${cy + R} ${cx} ${cy + R}`;
}

function rightHalf(cx: number, cy: number) {
  const k = R * K;
  return `M ${cx} ${cy - R} C ${cx + k} ${cy - R} ${cx + R} ${cy - k} ${cx + R} ${cy} C ${cx + R} ${cy + k} ${cx + k} ${cy + R} ${cx} ${cy + R}`;
}

function bulge(cx: number, y0: number, y1: number, side: number) {
  const cy = (y0 + y1) / 2;
  const dir = Math.sign(y1 - y0) || 1;
  const k = R * K;
  const x = cx + side * R;
  return `C ${cx + side * k} ${y0} ${x} ${cy - dir * k} ${x} ${cy} C ${x} ${cy + dir * k} ${cx + side * k} ${y1} ${cx} ${y1}`;
}

function shape(w: number, h: number, ox: number) {
  const left = ox;
  const right = ox + w;
  const topCx = right - R;
  const botCx = left + R;
  const fill = [
    `M ${left} ${D}`,
    bulge(left, D, 0, -1),
    `H ${topCx}`,
    `A ${R} ${R} 0 0 1 ${right} ${R}`,
    `V ${h - D}`,
    bulge(right, h - D, h, 1),
    `H ${botCx}`,
    `A ${R} ${R} 0 0 1 ${left} ${h - R}`,
    `V ${D}`,
    "Z",
  ].join(" ");
  const rollers = [
    `M ${left} ${D}`,
    bulge(left, D, 0, -1),
    `H ${topCx}`,
    `A ${R} ${R} 0 0 1 ${right} ${R}`,
    `A ${R} ${R} 0 0 1 ${topCx} ${D}`,
    `H ${left}`,
    "Z",
    `M ${botCx} ${h - D}`,
    `H ${right}`,
    bulge(right, h - D, h, 1),
    `H ${botCx}`,
    `A ${R} ${R} 0 0 1 ${left} ${h - R}`,
    `A ${R} ${R} 0 0 1 ${botCx} ${h - D}`,
    "Z",
  ].join(" ");
  return { fill, rollers };
}

export default function ScrollFrame() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () => setBox({ w: parent.clientWidth, h: parent.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const ready = box.w > 8 && box.h > D * 2;
  const glass = ready ? shape(box.w, box.h, R) : null;

  return (
    <div ref={ref} className="scroll-frame" aria-hidden>
      {ready && glass ? (
        <>
          <div className="scroll-glass" style={{ width: box.w + D, height: box.h, clipPath: `path('${glass.fill}')` }} />
          <div className="scroll-roller" style={{ width: box.w + D, height: box.h, clipPath: `path('${glass.rollers}')` }} />
          <svg className="scroll-stroke" width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`}>
            <path
              d={`M 0 0 H ${box.w - R} M 0 ${D} H ${box.w - R} M ${box.w} ${R} V ${box.h - D} M 0 ${D} V ${box.h - R} M ${R} ${box.h - D} H ${box.w} M ${R} ${box.h} H ${box.w} ${leftHalf(0, R)} ${rightHalf(box.w, box.h - R)}`}
              fill="none"
              stroke="rgba(214, 244, 236, 0.55)"
              strokeWidth="1"
            />
            <circle cx={box.w - R} cy={R} r={R} fill="none" stroke="rgba(214, 244, 236, 0.55)" strokeWidth="1" />
            <circle cx={R} cy={box.h - R} r={R} fill="none" stroke="rgba(214, 244, 236, 0.55)" strokeWidth="1" />
          </svg>
        </>
      ) : null}
    </div>
  );
}
