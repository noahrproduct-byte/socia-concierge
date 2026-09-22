"use client";

// Section 1: where the post goes. Rendered from the capability model and the
// connected accounts, grouped by platform. A checkbox appears only for an
// account SOCIA can publish to right now; every other state shows its reason
// and, when there is a real action (reconnect, connect), a link to it.

import Link from "next/link";
import { availabilityFor, CAPABILITIES } from "@/lib/publishing/capabilities";
import { availabilityOf, type ComposerDraft, type DraftDestination, type PickerAccount } from "@/lib/publishing/composer";
import { PLATFORMS, PLATFORM_LABEL, type Platform } from "@/lib/publishing/types";
import type { ComposerAction } from "./contracts";
import { ACCOUNTS_UNKNOWN_SENTENCE } from "./useComposer";

export function PlatformMark({ platform, size = 26 }: { platform: Platform; size?: number }) {
  const letter = platform === "instagram" ? "IG" : platform === "youtube" ? "YT" : platform === "facebook" ? "FB" : "TT";
  return (
    <span className={`cp-mark cp-mark-${platform}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden>
      {letter}
    </span>
  );
}

export function accountFor(d: DraftDestination, accounts: PickerAccount[]): PickerAccount | null {
  return accounts.find((a) => a.platform === d.platform && a.accountId === d.accountId) ?? null;
}

export default function DestinationPicker({
  draft, accounts, accountsComplete, dispatch,
}: {
  draft: ComposerDraft;
  accounts: PickerAccount[];
  /** false when a connections table could not be read: the list is a lower bound, not "no accounts". */
  accountsComplete: boolean;
  dispatch: (a: ComposerAction) => void;
}) {
  const available = draft.destinations.filter((d) => availabilityOf(d, accounts).state === "available");
  const allOn = available.length > 0 && available.every((d) => d.enabled);

  return (
    <div className="cp-dest" data-field="destinations">
      {!accountsComplete && (
        <p className="cp-empty" role="status">
          {ACCOUNTS_UNKNOWN_SENTENCE} You can keep writing and save a draft; scheduling waits until the list is complete.
        </p>
      )}
      {accountsComplete && accounts.length === 0 && (
        <p className="cp-empty">
          No accounts are connected yet. <Link href="/settings#accounts">Connect one in Settings</Link> to publish from here.
        </p>
      )}
      {available.length >= 2 && (
        <div className="cp-dest-tools">
          <button
            type="button"
            className="cp-link"
            onClick={() => available.forEach((d) => dispatch({ type: "toggle_destination", key: d.key, enabled: !allOn }))}
          >
            {allOn ? "Clear selection" : "Select all available"}
          </button>
        </div>
      )}
      {PLATFORMS.map((platform) => {
        const rows = draft.destinations.filter((d) => d.platform === platform);
        return (
          <div key={platform} className="cp-dest-group">
            <div className="cp-dest-group-head">
              <PlatformMark platform={platform} size={18} />
              <span>{PLATFORM_LABEL[platform]}</span>
            </div>
            {rows.length === 0 && <PlatformRow platform={platform} account={null} />}
            {rows.map((d) => (
              <PlatformRow key={d.key} platform={platform} account={accountFor(d, accounts)} dest={d} dispatch={dispatch} accounts={accounts} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function PlatformRow({
  platform, account, dest, dispatch, accounts,
}: {
  platform: Platform;
  account: PickerAccount | null;
  dest?: DraftDestination;
  dispatch?: (a: ComposerAction) => void;
  accounts?: PickerAccount[];
}) {
  const av = dest && accounts ? availabilityOf(dest, accounts) : availabilityFor(platform, account ? { status: account.status, suspended: account.suspended, scopes: account.scopes } : null);
  const label = account?.label ?? CAPABILITIES[platform].label;
  const handle = account?.handle ? (account.handle.startsWith("@") ? account.handle : `@${account.handle}`) : null;
  const on = Boolean(dest?.enabled);
  const id = `cp-dest-${platform}-${account?.accountId ?? "none"}`;

  const body = (
    <>
      {account?.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cp-avatar" src={account.avatar} alt="" width={34} height={34} />
      ) : (
        <PlatformMark platform={platform} size={34} />
      )}
      <span className="cp-dest-text">
        <span className="cp-dest-label">{label}</span>
        <span className="cp-dest-sub">
          {av.state === "available" ? (handle ?? PLATFORM_LABEL[platform]) : av.reason}
        </span>
      </span>
    </>
  );

  if (av.state === "available" && dest && dispatch) {
    return (
      <label htmlFor={id} className={`cp-dest-row${on ? " on" : ""}`}>
        {body}
        <input
          id={id}
          type="checkbox"
          className="cp-check"
          checked={on}
          onChange={(e) => dispatch({ type: "toggle_destination", key: dest.key, enabled: e.target.checked })}
          aria-label={`Post to ${label}`}
        />
      </label>
    );
  }

  return (
    <div className={`cp-dest-row disabled state-${av.state}`} aria-disabled>
      {body}
      <span className="cp-dest-action">
        {av.state === "needs_scope" && <a href={`/api/auth/${platform}/start`}>Reconnect</a>}
        {av.state === "not_connected" && CAPABILITIES[platform].implemented && <Link href="/settings#accounts">Connect in Settings</Link>}
      </span>
    </div>
  );
}
