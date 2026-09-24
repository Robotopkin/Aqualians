"use client";

import { useEffect } from "react";

const DROPS = [
  { src: "/drop.mp3", volume: 0.2 },
  { src: "/drop-2.mp3", volume: 0.1 },
  { src: "/drop-3.mp3", volume: 0.2 },
  { src: "/drop-4.mp3", volume: 0.2 },
  { src: "/drop-6.mp3", volume: 0.2 },
];

export default function ClickSound() {
  useEffect(() => {
    const sounds = DROPS.map(({ src, volume }) => {
      const sound = new Audio(src);
      sound.preload = "auto";
      sound.volume = volume;
      return sound;
    });
    const play = () => {
      const sound = sounds[Math.floor(Math.random() * sounds.length)];
      if (!sound) return;
      sound.currentTime = 0;
      void sound.play().catch(() => {});
    };
    document.addEventListener("pointerdown", play);
    return () => document.removeEventListener("pointerdown", play);
  }, []);
  return null;
}
