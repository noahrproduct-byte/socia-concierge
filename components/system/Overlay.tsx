"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "./Button";

type OverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children?: ReactNode;
  /** Width in px; the primitive caps it to the viewport. */
  width?: number;
  className?: string;
};

/** Centred dialog for a decision that needs protected focus. Focus is trapped and restored by Base UI. */
export function Dialog({ open, onOpenChange, title, description, children, actions, width, className }: OverlayProps & { description?: ReactNode; actions?: ReactNode }) {
  const style = width ? ({ "--dialog-w": `${width}px` } as CSSProperties) : undefined;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="s-backdrop" />
        <DialogPrimitive.Popup className={cn("s-dialog", className)} style={style}>
          <div className="s-dialog-head">
            <DialogPrimitive.Title className="s-dialog-title">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close render={<IconButton label="Close" size="sm" />}>
              <X />
            </DialogPrimitive.Close>
          </div>
          {description && <DialogPrimitive.Description className="s-dialog-body">{description}</DialogPrimitive.Description>}
          {children}
          {actions && <div className="s-dialog-actions">{actions}</div>}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Side panel for details and secondary work. Same semantics as the dialog, slides from the right. */
export function Drawer({ open, onOpenChange, title, children, footer, width, className }: OverlayProps & { footer?: ReactNode }) {
  const style = width ? ({ "--drawer-w": `${width}px` } as CSSProperties) : undefined;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="s-backdrop" />
        <DialogPrimitive.Popup className={cn("s-drawer", className)} style={style}>
          <div className="s-drawer-head">
            <DialogPrimitive.Title className="s-drawer-title">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close render={<IconButton label="Close" size="sm" />}>
              <X />
            </DialogPrimitive.Close>
          </div>
          <div className="s-drawer-body s-scroll">{children}</div>
          {footer && <div className="s-drawer-foot">{footer}</div>}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The replacement for window.confirm: names the object and the consequence,
 * and the confirming button names the action.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  danger,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={body}
      width={440}
      actions={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => void onConfirm()} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
