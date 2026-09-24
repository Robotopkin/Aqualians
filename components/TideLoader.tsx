"use client";

import { useEffect, useState } from "react";

const MARKS = ["shrimp", "dolphin", "shark", "whale"];

export default function TideLoader() {
  const [mark, setMark] = useState("");
  useEffect(() => {
    setMark(MARKS[Math.floor(Math.random() * MARKS.length)] ?? "shrimp");
  }, []);
  return (
    <div className="tide-loader" role="status" aria-label="Loading">
      {mark ? <img src={`/roles/${mark}.png`} alt="" className={`tide-loader-mark${mark === "whale" ? " whale" : ""}`} /> : null}
    </div>
  );
}
