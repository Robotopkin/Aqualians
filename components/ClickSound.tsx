"use client";

import { useEffect } from "react";

export default function ClickSound() {
  useEffect(() => {
    const sound = new Audio("/drop.mp3");
    sound.preload = "auto";
    sound.volume = 0.1;
    const play = () => {
      sound.volume = 0.1;
      sound.currentTime = 0;
      void sound.play().catch(() => {});
    };
    document.addEventListener("pointerdown", play);
    return () => document.removeEventListener("pointerdown", play);
  }, []);
  return null;
}
