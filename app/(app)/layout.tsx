import AppShell from "@/components/AppShell";

// Every signed-in section shares this shell. As a layout it stays mounted
// while the person moves between sections: the sidebar and top bar are not
// re-read or re-drawn on each click, and only the content area swaps (behind
// the loading skeleton in ./loading.tsx).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
