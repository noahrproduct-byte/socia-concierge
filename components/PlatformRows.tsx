"use client";

// Settings-page platform list: neutral premium rows instead of brand-colored
// buttons. Uses the same platform registry (and the same register/remove
// toggle) as onboarding's ConnectAccounts.

import { ArrowRight, Check, Loader2 } from "lucide-react";
import { ACCOUNTS } from "./ConnectAccounts";

export default function PlatformRows({
  connected,
  pending,
  onToggle,
  exclude = [],
}: {
  connected: string[];
  /** Platform id currently being saved, if any. */
  pending: string | null;
  onToggle: (id: string) => void;
  exclude?: string[];
}) {
  return (
    <div className="st2-plats">
      {ACCOUNTS.filter((a) => !exclude.includes(a.id)).map((a) => {
        const on = connected.includes(a.id);
        const busy = pending === a.id;
        return (
          <button
            key={a.id}
            type="button"
            className={`st2-plat${on ? " on" : ""}`}
            onClick={() => onToggle(a.id)}
            disabled={busy}
            title={on ? `Remove ${a.name}` : `Add ${a.name}`}
          >
            <span className="st2-plat-ico" aria-hidden>
              {a.mark(a.color, 18)}
            </span>
            <span className="st2-plat-meta">
              <b>{a.name}</b>
              {busy ? (
                <small>Saving…</small>
              ) : on ? (
                <small className="on">Registered, tap to remove</small>
              ) : (
                <small>Not registered</small>
              )}
            </span>
            <span className={`st2-plat-cta${on ? " on" : ""}`}>
              {busy ? (
                <Loader2 size={14} className="spin" />
              ) : on ? (
                <Check size={15} />
              ) : (
                <>
                  Add <ArrowRight size={13} />
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
