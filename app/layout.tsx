import type { Metadata } from "next";
import { Cinzel, Philosopher } from "next/font/google";
import ClickSound from "@/components/ClickSound";
import "./globals.css";

const display = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const sans = Philosopher({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "AuraSea — Aqualians",
  description: "Two tides a day. Predict which sector's volume or transaction count moves, and stake Aura.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <ClickSound />
        {children}
        <a className="x-mark" href="https://x.com/Aqualians" target="_blank" rel="noreferrer" aria-label="Aqualians on X">
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path
              fill="currentColor"
              d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"
            />
          </svg>
        </a>
      </body>
    </html>
  );
}
