"use client";

// Time-of-day greeting in the viewer's own clock. The server renders a
// neutral "Hello" (its clock is UTC, not the viewer's); the browser swaps in
// the time of day after mount, so the first paint never depends on local time
// and hydration always matches.

import { useEffect, useState } from "react";

const forHour = (h: number) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

export function useGreeting(): string {
  const [greet, setGreet] = useState("Hello");
  useEffect(() => setGreet(forHour(new Date().getHours())), []);
  return greet;
}

export default function Greeting({ name }: { name: string }) {
  const greet = useGreeting();
  return (
    <>
      {greet}, {name} <span aria-hidden>👋</span>
    </>
  );
}
