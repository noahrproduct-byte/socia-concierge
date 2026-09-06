"use client";

import { useEffect, useState } from "react";

/** Renders children only in the browser, after hydration. For controls whose
 *  markup depends on client state (search params, fetched accounts) and never
 *  needs to be in the server HTML. `fallback` holds the layout meanwhile. */
export default function Mounted({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  return <>{on ? children : fallback}</>;
}
