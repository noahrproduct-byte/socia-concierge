// Tables that hold platform OAuth tokens. A browser session has no access to
// them at all (supabase/security-hardening.sql revokes every privilege from
// anon and authenticated), so an XSS or a curious owner with devtools can't
// read a token through Supabase REST.
//
// SOCIA's server still reads and writes them for the signed-in person. This
// wraps the server's per-request client so that `.from(<private table>)`
// goes through the service role, while everything else keeps using the
// person's session and RLS. Every request-path query on these tables already
// filters by the owner's user_id (guests have always gone through the
// service role, so the code was written for it); lib/supabase/privateTables.test.ts
// fails if a query without that filter is added.
//
// Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./service";

export const PRIVATE_TABLES: ReadonlySet<string> = new Set([
  "instagram_connections",
  "facebook_connections",
  "youtube_connections",
  "tiktok_connections",
  "facebook_pending_tokens",
]);

const WRAPPED = Symbol.for("socia.privateTables");

/**
 * The same client, except that private tables are reached with the service
 * role. Without a service key (local development) the session client is used
 * and those reads fail closed after the migration.
 */
export function withPrivateTables<T extends SupabaseClient>(client: T, svcFactory: () => SupabaseClient | null = createServiceClient): T {
  if ((client as unknown as Record<symbol, boolean>)[WRAPPED]) return client;
  let svc: SupabaseClient | null | undefined;
  const service = () => (svc === undefined ? (svc = svcFactory()) : svc);
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === WRAPPED) return true;
      if (prop === "from") {
        return (table: string) => {
          if (PRIVATE_TABLES.has(table)) {
            const s = service();
            if (s) return s.from(table);
          }
          return target.from(table);
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
