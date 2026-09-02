"use client";

// The header's refresh action. Runs discovery, then re-renders the page from
// the stored results so every section updates together.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function RefreshDiscovery() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`cw-refresh${busy ? " busy" : ""}`}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await fetch("/api/competitors/intel?refresh=1");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      aria-label="Refresh competitor data"
      title="Refresh competitor data"
    >
      <RefreshCw size={12} className={busy ? "cp4-spin" : undefined} /> {busy ? "Refreshing…" : "Refresh"}
    </button>
  );
}
