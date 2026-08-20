"use client";

import { useEffect, useRef } from "react";

// The environmental layer: a fixed full-viewport canvas drawing a slow,
// deliberate "social intelligence" field — data particles, neural links,
// drifting signal waves, and a periodic scanning line. Intensity and hue
// react to the active chapter (dark chapters glow, editorial chapters go
// quiet). Pure canvas 2D: no dependencies, cheap on mobile, and the page
// remains fully readable if it never paints.

type Mode = "dark" | "deep" | "light";

export default function IntelligenceField({ mode }: { mode: Mode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.innerWidth < 760;
    const DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);

    let W = 0, H = 0;
    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const COUNT = mobile ? 46 : 110;
    const LINK = mobile ? 110 : 150;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const parts = Array.from({ length: COUNT }, () => ({
      x: rand(0, 1),
      y: rand(0, 1),
      vx: rand(-0.012, 0.012),
      vy: rand(-0.009, 0.009),
      r: rand(0.7, 1.9),
      tw: rand(0, Math.PI * 2),
    }));

    let scanY = -0.2;
    let raf = 0;
    let last = performance.now();
    let scroll = 0;
    const onScroll = () => { scroll = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });

    const draw = (now: number) => {
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      const m = modeRef.current;
      // editorial chapters: field goes nearly silent
      const base = m === "light" ? 0.16 : m === "deep" ? 1 : 0.75;

      ctx.clearRect(0, 0, W, H);

      const drift = scroll * 0.03;
      for (const p of parts) {
        if (!reduced) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.tw += dt * 1.4;
          if (p.x < -0.05) p.x = 1.05; else if (p.x > 1.05) p.x = -0.05;
          if (p.y < -0.05) p.y = 1.05; else if (p.y > 1.05) p.y = -0.05;
        }
      }

      // neural links
      ctx.lineWidth = 1;
      for (let i = 0; i < COUNT; i++) {
        const a = parts[i];
        const ax = a.x * W, ay = (a.y * H - drift * (0.4 + a.r * 0.2) % H + H) % H;
        for (let j = i + 1; j < COUNT; j++) {
          const b = parts[j];
          const bx = b.x * W, by = (b.y * H - drift * (0.4 + b.r * 0.2) % H + H) % H;
          const dx = ax - bx, dy = ay - by;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            const t = 1 - Math.sqrt(d2) / LINK;
            ctx.strokeStyle = `rgba(96,165,250,${(0.13 * t * base).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }
      }

      // particles
      for (const p of parts) {
        const px = p.x * W;
        const py = (p.y * H - drift * (0.4 + p.r * 0.2) % H + H) % H;
        const tw = reduced ? 0.7 : 0.55 + 0.45 * Math.sin(p.tw);
        ctx.fillStyle = `rgba(147,197,253,${(0.5 * tw * base).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // scanning line (dark chapters only)
      if (!reduced && m !== "light") {
        scanY += dt * 0.045;
        if (scanY > 1.25) scanY = -0.25;
        const y = scanY * H;
        const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
        g.addColorStop(0, "rgba(37,99,255,0)");
        g.addColorStop(0.5, `rgba(37,99,255,${0.05 * base})`);
        g.addColorStop(1, "rgba(37,99,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, y - 60, W, 120);
        ctx.fillStyle = `rgba(96,165,250,${0.16 * base})`;
        ctx.fillRect(0, y, W, 1);
      }

      raf = requestAnimationFrame(draw);
    };

    if (reduced) {
      // one static, quiet frame
      draw(performance.now());
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return <canvas ref={ref} className="so-field" aria-hidden />;
}
