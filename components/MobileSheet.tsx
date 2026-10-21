"use client";

// The phone menu: a full-screen sheet with the brand, the workspace switcher,
// the grouped navigation, Settings and Help, and the account row. It closes
// itself when the route changes.

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
        <DialogPrimitive.Popup className="s-sheet s-scroll" aria-label="Menu">
          <div className="s-sheet-head">
            <Link href="/dashboard" className="s-brand" onClick={() => onOpenChange(false)}>
              <BrandMark size={22} />
              SOCIA
            </Link>
            <DialogPrimitive.Close render={<IconButton label="Close menu" />}>
              <X />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
