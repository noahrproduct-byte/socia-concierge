"use client";

import { useEffect, useState } from "react";

// Renders the viewer's actual IANA time zone (client-side, since the server
// runs in UTC and would report the wrong one).
export default function TimeZoneNote() {
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      setTz(null);
    }
  }, []);
  return <span>{tz ? `Timezone: ${tz}` : "Times shown in your device's time zone"}</span>;
}
