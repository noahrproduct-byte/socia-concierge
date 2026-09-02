"use client";

// Platform filter for the roster. A real dropdown that changes ?platform= so
// the server filters the competitor set; the user's own card always stays.

import { useRouter, useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";

export default function PlatformSelect({ value }: { value: string }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <label className="lb-sel compact">
      <Globe size={13} />
      <select
        value={value}
        aria-label="Platform"
        onChange={(e) => {
          const next = new URLSearchParams(params?.toString() ?? "");
          if (e.target.value === "all") next.delete("platform"); else next.set("platform", e.target.value);
          router.push(`/competitors${next.toString() ? `?${next}` : ""}`);
        }}
      >
        <option value="all">All platforms</option>
        <option value="instagram">Instagram</option>
        <option value="youtube">YouTube</option>
        <option value="facebook">Facebook</option>
      </select>
    </label>
  );
}
