"use client";

import {
  createContext,
  useContext,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type FieldCtx = { id: string; describedBy?: string; invalid: boolean };
const Ctx = createContext<FieldCtx | null>(null);

/**
 * Label above the control, bound by id; the hint or the error below it,
 * announced to assistive tech. The control inside reads the context, so a
 * field never ships with an unlabelled input.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("s-field", className)}>
      <label className="s-label" htmlFor={id}>
        {label}
        {optional && <small>optional</small>}
      </label>
      <Ctx.Provider value={{ id, describedBy: errorId ?? hintId, invalid: Boolean(error) }}>{children}</Ctx.Provider>
      {error ? (
        <div id={errorId} className="s-error" role="alert">
          {error}
        </div>
      ) : hint ? (
        <div id={hintId} className="s-hint">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function useField() {
  return useContext(Ctx);
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const f = useField();
  return (
    <input
      id={f?.id}
      aria-describedby={f?.describedBy}
      aria-invalid={f?.invalid || undefined}
      className={cn("s-input", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const f = useField();
  return <select id={f?.id} aria-describedby={f?.describedBy} aria-invalid={f?.invalid || undefined} className={cn("s-select", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const f = useField();
  return (
    <textarea
      id={f?.id}
      aria-describedby={f?.describedBy}
      aria-invalid={f?.invalid || undefined}
      className={cn("s-textarea", className)}
      {...props}
    />
  );
}

/** A checkbox with its label as one click target. */
export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("s-check", className)}>
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

/** A switch: on is a state (green), not the action colour. Always labelled. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
  disabled,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cn("s-switch", className)}
      onClick={() => onCheckedChange(!checked)}
      {...rest}
    />
  );
}
