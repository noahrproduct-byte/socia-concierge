"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";

// The fixed chrome and the chapter rail. Both sit over the page in
// difference blend, so they read black on the paper bands and off-white on
// the black ones without any script. The rail's current mark follows the
// chapter in view.

const CHAPTERS = [
  { id: "chapter-1", name: "Introduction" },
  { id: "chapter-2", name: "The problem" },
  { id: "chapter-3", name: "Intelligence" },
  { id: "chapter-4", name: "Content Studio" },
  { id: "chapter-5", name: "Planning and publishing" },
  { id: "chapter-6", name: "Explore" },
  { id: "chapter-7", name: "Start" },
];

export default function Chrome() {
  const [current, setCurrent] = useState("chapter-1");

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const c of CHAPTERS) {
      const el = document.getElementById(c.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return (
    <>
      <header className="lp-chrome">
        <Link href="/" className="lp-chrome-brand"><BrandMark size={22} />SOCIA</Link>
        <nav className="lp-chrome-links" aria-label="Main">
          <Link href="/pricing" className="lp-chrome-link">Pricing</Link>
          <Link href="/login" className="lp-chrome-link">Log in</Link>
          <Link href="/signup" className="lp-btn is-sm">Get started free</Link>
        </nav>
      </header>
      <ol className={current === "chapter-7" ? "lp-rail is-done" : "lp-rail"} aria-label="Chapters">
        {CHAPTERS.map((c) => (
          <li key={c.id}>
            <a href={`#${c.id}`} className={current === c.id ? "is-current" : undefined} aria-label={c.name} aria-current={current === c.id ? "true" : undefined} />
          </li>
        ))}
      </ol>
    </>
  );
}
