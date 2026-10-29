"use client";

// The All sections panel: the workspace switcher, every section grouped, Help
// and the account row. A panel at the right edge on desktops (opened from the
// dock's All sections button), the full screen on phones (the menu button).
// It closes itself when the route changes.

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { IconButton } from "@/components/system";

export default function MobileSheet({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="s-sheet-backdrop" />
        <DialogPrimitive.Popup className="s-sheet s-scroll" aria-label="All sections">
          <div className="s-sheet-head">
            <Link href="/dashboard" className="s-brand" onClick={() => onOpenChange(false)}>
              <BrandMark size={22} />
              SOCIA
            </Link>
            <DialogPrimitive.Close render={<IconButton label="Close all sections" />}>
              <X />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
