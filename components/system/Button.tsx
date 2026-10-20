import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  icon = false,
  className?: string,
) {
  return cn("s-btn", `s-btn--${variant}`, size !== "md" && `s-btn--${size}`, icon && "s-btn--icon", className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the control while a request runs. */
  busy?: boolean;
};

/** One button. `primary` is the single cobalt action on a screen; everything else is neutral. */
export function Button({ variant = "secondary", size = "md", busy, className, type = "button", disabled, children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, false, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <SpinnerGlyph /> : null}
      {children}
    </button>
  );
}

/** Icon-only button. The label is the accessible name and the tooltip. */
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button type={type} aria-label={label} title={label} className={buttonClass(variant, size, true, className)} {...rest}>
      {children}
    </button>
  );
}

/** A link that looks like a button (navigation, never a form submit). */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; variant?: ButtonVariant; size?: ButtonSize; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, false, className)} {...rest}>
      {children}
    </Link>
  );
}

function SpinnerGlyph() {
  return (
    <svg className="s-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
