"use client";

import { useEffect } from "react";

// Opens the browser print dialog once the client-ready report has rendered.
// Used only on the print view (?print=1); the report is a normal page the
// person can also print later with Cmd/Ctrl+P.
export default function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => { try { window.print(); } catch { /* ignore */ } }, 400);
    return () => clearTimeout(t);
  }, []);
  return null;
}
