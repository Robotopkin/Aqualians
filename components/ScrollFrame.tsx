"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_D = 32;
const K = 0.5522847498;

function leftHalf(cx: number, cy: number, radius: number) {
  const k = radius * K;
  return `M ${cx} ${cy - radius} C ${cx - k} ${cy - radius} ${cx - radius} ${cy - k} ${cx - radius} ${cy} C ${cx - radius} ${cy + k} ${cx - k} ${cy + radius} ${cx} ${cy + radius}`;
}

function rightHalf(cx: number, cy: number, radius: number) {
  const k = radius * K;
  return `M ${cx} ${cy - radius} C ${cx + k} ${cy - radius} ${cx + radius} ${cy - k} ${cx + radius} ${cy} C ${cx + radius} ${cy + k} ${cx + k} ${cy + radius} ${cx} ${cy + radius}`;
}

function bulge(cx: number, y0: number, y1: number, side: number, radius: number) {
  const cy = (y0 + y1) / 2;
  const dir = Math.sign(y1 - y0) || 1;
  const k = radius * K;
  const x = cx + side * radius;
  return `C ${cx + side * k} ${y0} ${x} ${cy - dir * k} ${x} ${cy} C ${x} ${cy + dir * k} ${cx + side * k} ${y1} ${cx} ${y1}`;
}

function shape(w: number, h: number, ox: number, diameter: number) {
  const radius = diameter / 2;
  const left = ox;
  const right = ox + w;
  const topCx = right - radius;
  const botCx = left + radius;
  const fill = [
    `M ${left} ${diameter}`,
    bulge(left, diameter, 0, -1, radius),
    `H ${topCx}`,
    `A ${radius} ${radius} 0 0 1 ${right} ${radius}`,
    `V ${h - diameter}`,
    bulge(right, h - diameter, h, 1, radius),
    `H ${botCx}`,
    `A ${radius} ${radius} 0 0 1 ${left} ${h - radius}`,
    `V ${diameter}`,
    "Z",
  ].join(" ");
  const rollers = [
    `M ${left} ${diameter}`,
    bulge(left, diameter, 0, -1, radius),
    `H ${topCx}`,
    `A ${radius} ${radius} 0 0 1 ${right} ${radius}`,
    `A ${radius} ${radius} 0 0 1 ${topCx} ${diameter}`,
    `H ${left}`,
    "Z",
    `M ${botCx} ${h - diameter}`,
    `H ${right}`,
    bulge(right, h - diameter, h, 1, radius),
    `H ${botCx}`,
    `A ${radius} ${radius} 0 0 1 ${left} ${h - radius}`,
    `A ${radius} ${radius} 0 0 1 ${botCx} ${h - diameter}`,
    "Z",
  ].join(" ");
  return { fill, rollers };
}

export default function ScrollFrame({ rollerSize = DEFAULT_D }: { rollerSize?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const diameter = Math.max(8, rollerSize);
  const radius = diameter / 2;

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () => setBox({ w: parent.clientWidth, h: parent.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const ready = box.w > 8 && box.h >= diameter * 2;
  const glass = ready ? shape(box.w, box.h, radius, diameter) : null;

  return (
    <div ref={ref} className="scroll-frame" aria-hidden>
      {ready && glass ? (
        <>
          <div className="scroll-glass" style={{ left: -radius, width: box.w + diameter, height: box.h, clipPath: `path('${glass.fill}')` }} />
          <div className="scroll-roller" style={{ left: -radius, width: box.w + diameter, height: box.h, clipPath: `path('${glass.rollers}')` }} />
          <svg className="scroll-stroke" width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`}>
            <path
              d={`M 0 0 H ${box.w - radius} M 0 ${diameter} H ${box.w - radius} M ${box.w} ${radius} V ${box.h - diameter} M 0 ${diameter} V ${box.h - radius} M ${radius} ${box.h - diameter} H ${box.w} M ${radius} ${box.h} H ${box.w} ${leftHalf(0, radius, radius)} ${rightHalf(box.w, box.h - radius, radius)}`}
              fill="none"
              stroke="rgba(214, 244, 236, 0.55)"
              strokeWidth="1"
            />
            <circle cx={box.w - radius} cy={radius} r={radius} fill="none" stroke="rgba(214, 244, 236, 0.55)" strokeWidth="1" />
            <circle cx={radius} cy={box.h - radius} r={radius} fill="none" stroke="rgba(214, 244, 236, 0.55)" strokeWidth="1" />
          </svg>
        </>
      ) : null}
    </div>
  );
}
