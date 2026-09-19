// The vertical master: the on-screen demo perspective-mapped onto a MacBook
// in a dark room — warm LED strip on the right, screen glow on the keys,
// slight handheld drift, TikTok-style caption pinned at the top. Built
// procedurally in CSS 3D so the whole deliverable stays in code.

import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ScreenDemo } from "./ScreenDemo";

const SCREEN_W = 1920;
const SCREEN_H = 1200; // 16:10 MacBook panel

export const Reel: React.FC<{ caption: string }> = ({ caption }) => {
  const f = useCurrentFrame();
  // handheld drift: slow, low-amplitude sums of sines
  const dx = Math.sin(f / 97) * 5 + Math.sin(f / 41) * 2;
  const dy = Math.cos(f / 83) * 4 + Math.sin(f / 37) * 1.5;
  const dr = Math.sin(f / 131) * 0.35;
  const scale = 1 + Math.sin(f / 151) * 0.006;

  const lidW = 1010;
  const lidH = 660;
  const bezel = 16;
  const screenW = lidW - bezel * 2;
  const screenH = screenW * (SCREEN_H / SCREEN_W);
  const scr = screenW / SCREEN_W;

  return (
    <AbsoluteFill style={{ background: "#040507", overflow: "hidden" }}>
      {/* room */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(80% 60% at 55% 62%, #14131f 0%, #08090d 55%, #030304 100%)" }} />
      {/* warm LED strip on the right wall */}
      <div style={{ position: "absolute", left: 1006, top: 40, width: 16, height: 330, borderRadius: 8, background: "linear-gradient(180deg, #FFE7C2, #FFC98A 60%, #E9A96A)", boxShadow: "0 0 26px 8px rgba(255,205,150,0.55), 0 0 120px 40px rgba(255,170,90,0.22), 0 0 260px 90px rgba(255,150,70,0.10)" }} />
      <div style={{ position: "absolute", left: 700, top: -100, width: 500, height: 900, background: "radial-gradient(50% 50% at 70% 30%, rgba(255,160,90,0.10), rgba(0,0,0,0) 70%)" }} />

      {/* desk lit by the screen */}
      <div style={{ position: "absolute", left: -200, top: 1150, width: 1480, height: 900, background: "radial-gradient(50% 45% at 50% 30%, rgba(96,84,220,0.22) 0%, rgba(60,50,160,0.08) 45%, rgba(0,0,0,0) 70%)" }} />
      {/* laptop */}
      <div style={{ position: "absolute", inset: 0, transform: `translate(${dx}px, ${dy}px) rotate(${dr}deg) scale(${scale})`, transformOrigin: "50% 60%" }}>
        <div style={{ position: "absolute", left: 35, top: 590, width: lidW, height: lidH + 700, perspective: 2400, perspectiveOrigin: "48% 30%" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: lidW, transformStyle: "preserve-3d", transform: "rotateY(-12deg) rotateX(16deg) rotateZ(-1.5deg)", transformOrigin: `50% ${lidH}px` }}>
            {/* lid */}
            <div style={{ position: "absolute", left: 0, top: 0, width: lidW, height: lidH, transformOrigin: "50% 100%", transform: "rotateX(-6deg)", transformStyle: "preserve-3d" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: 26, background: "linear-gradient(160deg, #1a1b21 0%, #0c0d11 60%, #14151b 100%)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 60px 120px -20px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(0,0,0,0.6)" }} />
              {/* warm rim from the LED on the right edge */}
              <div style={{ position: "absolute", inset: 0, borderRadius: 26, background: "linear-gradient(90deg, rgba(255,190,130,0) 80%, rgba(255,190,130,0.22) 100%)" }} />
              {/* panel */}
              <div style={{ position: "absolute", left: bezel, top: bezel, width: screenW, height: screenH, borderRadius: 12, overflow: "hidden", background: "#000", boxShadow: "inset 0 0 40px rgba(0,0,0,0.9)" }}>
                <div style={{ position: "absolute", left: 0, top: 0, width: SCREEN_W, height: SCREEN_H, transform: `scale(${scr})`, transformOrigin: "0 0" }}>
                  <ScreenDemo w={SCREEN_W} h={SCREEN_H} />
                </div>
                {/* glare + panel falloff */}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.12) 100%)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 60px rgba(0,0,0,0.35)", pointerEvents: "none" }} />
              </div>
              {/* camera notch */}
              <div style={{ position: "absolute", left: lidW / 2 - 6, top: 4, width: 12, height: 12, borderRadius: 6, background: "#000", boxShadow: "inset 0 0 3px rgba(255,255,255,0.15)" }} />
            </div>

            {/* base */}
            <div style={{ position: "absolute", left: -10, top: lidH - 2, width: lidW + 20, height: 840, transformOrigin: "50% 0%", transform: "rotateX(70deg)", transformStyle: "preserve-3d" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: 30, background: "linear-gradient(180deg, #1b1c22 0%, #101116 45%, #0b0c10 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 80px 140px -30px rgba(0,0,0,0.95)" }} />
              {/* screen glow spilling onto the deck */}
              <div style={{ position: "absolute", inset: 0, borderRadius: 30, background: "linear-gradient(180deg, rgba(123,108,246,0.55) 0%, rgba(123,108,246,0.22) 35%, rgba(123,108,246,0.05) 70%, rgba(0,0,0,0) 100%)" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: 30, background: "linear-gradient(90deg, rgba(255,190,130,0) 82%, rgba(255,190,130,0.16) 100%)" }} />
              {/* keyboard */}
              <div style={{ position: "absolute", left: 70, top: 60, width: lidW - 120, display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 9 }}>
                {Array.from({ length: 14 * 6 }).map((_, i) => (
                  <div key={i} style={{ height: 52, borderRadius: 8, background: "linear-gradient(180deg, #23242c 0%, #15161c 100%)", boxShadow: "0 2px 0 rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -8px 14px rgba(123,108,246,0.18)" }} />
                ))}
              </div>
              {/* trackpad */}
              <div style={{ position: "absolute", left: lidW / 2 - 165, top: 60 + 6 * 61 + 24, width: 330, height: 220, borderRadius: 16, background: "linear-gradient(180deg, #16171d, #101116)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "inset 0 10px 30px rgba(123,108,246,0.10)" }} />
            </div>
          </div>
        </div>
      </div>

      {/* vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 60% at 50% 55%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)", pointerEvents: "none" }} />

      {/* TikTok-style caption */}
      <div style={{ position: "absolute", left: 0, top: 265, width: 1080, display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", maxWidth: 820, padding: "22px 34px", borderRadius: 14, background: "#fff", color: "#111", fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif", fontSize: 40, lineHeight: 1.25, fontWeight: 500, textAlign: "center", letterSpacing: "-0.01em", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
          <span style={{ position: "absolute", left: -18, top: -30, fontSize: 40 }}>🐐</span>
          {caption}
        </div>
      </div>
    </AbsoluteFill>
  );
};
