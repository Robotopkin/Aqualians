"use client";

import { useState } from "react";

const MARKS = ["shrimp", "dolphin", "shark", "whale"];

export default function TideLoader() {
  const [mark] = useState(() => MARKS[Math.floor(Math.random() * MARKS.length)]);
  return (
    <div className="tide-loader" role="status" aria-label="Loading">
      <img src={`/roles/${mark}.png`} alt="" className="tide-loader-mark" />
    </div>
  );
}
