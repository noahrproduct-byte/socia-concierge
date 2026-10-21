"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ---- Menu: one keyboard model for every dropdown ------------------------- */

export function Menu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />;
}

/** Pass the trigger element as `render` so a Button or IconButton opens the menu. */
export function MenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger {...props} />;
}

export function MenuContent({
  align = "start",
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner align={align} side={side} sideOffset={sideOffset} style={{ zIndex: "var(--z-menu)" }}>
        <MenuPrimitive.Popup className={cn("s-menu", className)} {...props} />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

/** API and external links navigate with a plain anchor (no RSC prefetch); app paths use Link. */
function isPlainHref(href: string) {
  return href.startsWith("/api/") || href.startsWith("http");
}

/**
 * An item: an optional leading icon, the label in a span, and `end` at the
 * right (a shortcut, a check, a pill). `href` makes it a link; `why` explains
 * a disabled item instead of hiding it.
 */
export function MenuItem({
  href,
  why,
  shortcut,
  end,
  className,
  children,
  disabled,
  ...props
}: MenuPrimitive.Item.Props & { href?: string; why?: string; shortcut?: string; end?: ReactNode }) {
  const trailing = disabled && why ? why : shortcut ? <kbd className="s-kbd">{shortcut}</kbd> : end;
  return (
    <MenuPrimitive.Item
      className={cn("s-menu-item", className)}
      disabled={disabled}
      render={href ? (isPlainHref(href) ? <a href={href} /> : <Link href={href} />) : undefined}
      {...props}
    >
      {children}
      {trailing != null && trailing !== false ? <span className="s-menu-end">{trailing}</span> : null}
    </MenuPrimitive.Item>
  );
}

export function MenuSeparator(props: MenuPrimitive.Separator.Props) {
  return <MenuPrimitive.Separator className="s-menu-sep" {...props} />;
}

export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <MenuPrimitive.Group>
      <MenuPrimitive.GroupLabel className="s-menu-label">{label}</MenuPrimitive.GroupLabel>
      {children}
    </MenuPrimitive.Group>
  );
}

/* ---- Popover: a small panel anchored to its trigger ------------------------ */

export function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />;
}

export function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger {...props} />;
}

export function PopoverContent({
  align = "start",
  side = "bottom",
  sideOffset = 6,
  className,
  ...props
}: PopoverPrimitive.Popup.Props & Pick<PopoverPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner align={align} side={side} sideOffset={sideOffset} style={{ zIndex: "var(--z-menu)" }}>
        <PopoverPrimitive.Popup className={cn("s-popover", className)} {...props} />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

/* ---- Tooltip: a plain box, no arrow, for icon buttons and short facts ------ */

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delay={300}>{children}</TooltipPrimitive.Provider>;
}

/**
 * Wraps one focusable element. A tooltip is never the only place a reason
 * lives: use it for an icon button's name or a short definition.
 */
export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={6} style={{ zIndex: "var(--z-menu)" }}>
          <TooltipPrimitive.Popup className="s-tooltip">{content}</TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
