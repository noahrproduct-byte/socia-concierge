"use client";

import type { ReactNode } from "react";
import { Drawer as SystemDrawer } from "@/components/system";

/** Right-side drawer on the system Drawer: focus is trapped and restored,
 *  Escape and the backdrop close it, and the page behind does not scroll. */
export default function Drawer({ open, title, onClose, children, width = 460 }: { open: boolean; title: string; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <SystemDrawer open={open} onOpenChange={(next) => { if (!next) onClose(); }} title={title} width={width}>
      {children}
    </SystemDrawer>
  );
}
