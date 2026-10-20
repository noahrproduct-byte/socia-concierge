"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One toast system. Wrap the shell once; call `useToast().add({...})` anywhere.
 * Toasts use transitions, not keyframes, so a second one arriving mid-motion
 * never restarts the first.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastPrimitive.Provider timeout={5000}>
      {children}
      <ToastList />
    </ToastPrimitive.Provider>
  );
}

export function useToast() {
  return ToastPrimitive.useToastManager();
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className="s-toasts">
        {toasts.map((t) => (
          <ToastPrimitive.Root key={t.id} toast={t} className={cn("s-toast", t.type === "error" && "s-toast--negative")}>
            <ToastPrimitive.Content>
              <ToastPrimitive.Title>{t.title}</ToastPrimitive.Title>
              {t.description && <ToastPrimitive.Description style={{ fontWeight: "var(--fw-regular)", opacity: 0.85 }}>{t.description}</ToastPrimitive.Description>}
            </ToastPrimitive.Content>
            {t.actionProps && <ToastPrimitive.Action className="s-btn s-btn--ghost s-btn--sm" />}
            <ToastPrimitive.Close className="s-btn s-btn--ghost s-btn--sm" aria-label="Dismiss">
              Dismiss
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}
