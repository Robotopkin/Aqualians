"use client";

import { useEffect } from "react";

const DROPS = ["/drop.mp3", "/drop-2.mp3", "/drop-3.mp3", "/drop-4.mp3", "/drop-5.mp3", "/drop-6.mp3"];

export default function ClickSound() {
  useEffect(() => {
    const sounds = DROPS.map((src) => {
      const sound = new Audio(src);
      sound.preload = "auto";
      sound.volume = 0.2;
      return sound;
    });
    const play = () => {
      const sound = sounds[Math.floor(Math.random() * sounds.length)];
      if (!sound) return;
      sound.volume = 0.2;
      sound.currentTime = 0;
      void sound.play().catch(() => {});
    };
    document.addEventListener("pointerdown", play);
    return () => document.removeEventListener("pointerdown", play);
  }, []);
  return null;
}
