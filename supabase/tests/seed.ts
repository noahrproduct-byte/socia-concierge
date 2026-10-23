// The people and rows the authorization tests use. Seeded as the database
// owner (the SQL editor), before supabase/security-hardening.sql runs, so the
// migration is also proven against data that already exists.
//
//   A    a customer with one workspace (WA), a post, a destination, an
//        Instagram connection (with a token), a file in storage
//   B    another customer, the same shape (WB)
//   O    an agency owner with two workspaces (W1, W2)
//   AD   an Admin of W1 only
//   M    a Member of W1 only
//   N    a new person with no workspace yet

import type { Db } from "./harness";

export const U = {
  A: "aaaaaaaa-0000-4000-8000-000000000001",
  B: "bbbbbbbb-0000-4000-8000-000000000002",
  O: "cccccccc-0000-4000-8000-000000000003",
  AD: "dddddddd-0000-4000-8000-000000000004",
  M: "eeeeeeee-0000-4000-8000-000000000005",
  N: "ffffffff-0000-4000-8000-000000000006",
} as const;

export const W = {
  WA: "aaaaaaaa-1111-4000-8000-000000000001",
  WB: "bbbbbbbb-1111-4000-8000-000000000002",
  W1: "cccccccc-1111-4000-8000-000000000003",
  W2: "cccccccc-2222-4000-8000-000000000004",
} as const;

export const P = {
  A: "aaaaaaaa-2222-4000-8000-000000000001",
  B: "bbbbbbbb-2222-4000-8000-000000000002",
  O1: "cccccccc-3333-4000-8000-000000000003",
  O2: "cccccccc-4444-4000-8000-000000000004",
} as const;

export const TOKEN = (who: string) => `IGQ-secret-token-of-${who}`;

export async function seed(db: Db): Promise<void> {
  const users = Object.entries(U).map(([k, id]) => `('${id}', '${k.toLowerCase()}@example.com')`).join(", ");
  await db.exec(`
    insert into auth.users (id, email) values ${users};
    insert into public.profiles (user_id, plan) values
      ('${U.A}', 'growth'), ('${U.B}', 'growth'), ('${U.O}', 'pro'), ('${U.AD}', 'free'), ('${U.M}', 'free'), ('${U.N}', 'free');

    insert into public.workspaces (id, owner_id, name, is_default) values
      ('${W.WA}', '${U.A}', 'A brand', true),
      ('${W.WB}', '${U.B}', 'B brand', true),
      ('${W.W1}', '${U.O}', 'Client one', true),
      ('${W.W2}', '${U.O}', 'Client two (confidential)', false);
    insert into public.workspace_members (workspace_id, user_id, role) values
      ('${W.W1}', '${U.AD}', 'admin'), ('${W.W1}', '${U.M}', 'member');
    insert into public.workspace_invites (workspace_id, role, token, created_by) values
      ('${W.W1}', 'member', 'invite-token-w1-secret', '${U.O}'),
      ('${W.W1}', 'admin', 'invite-token-w1-admin-secret', '${U.O}');

    insert into public.scheduled_posts (id, user_id, workspace_id, scheduled_at, caption, status) values
      ('${P.A}', '${U.A}', '${W.WA}', now() + interval '1 day', 'A draft', 'scheduled'),
      ('${P.B}', '${U.B}', '${W.WB}', now() + interval '1 day', 'B unreleased launch', 'scheduled'),
      ('${P.O1}', '${U.O}', '${W.W1}', now() + interval '1 day', 'Client one post', 'scheduled'),
      ('${P.O2}', '${U.O}', '${W.W2}', now() + interval '1 day', 'Client two secret post', 'scheduled');
    insert into public.post_destinations (post_id, user_id, workspace_id, platform, account_id, status, scheduled_at) values
      ('${P.A}', '${U.A}', '${W.WA}', 'instagram', 'ig-a', 'scheduled', now() + interval '1 day'),
      ('${P.B}', '${U.B}', '${W.WB}', 'instagram', 'ig-b', 'scheduled', now() + interval '1 day');

    insert into public.instagram_connections (user_id, ig_user_id, username, access_token, workspace_id, is_active) values
      ('${U.A}', 'ig-a', 'a_brand', '${TOKEN("A")}', '${W.WA}', true),
      ('${U.B}', 'ig-b', 'b_brand', '${TOKEN("B")}', '${W.WB}', true),
      ('${U.O}', 'ig-o1', 'client_one', '${TOKEN("O1")}', '${W.W1}', true);
    insert into public.facebook_connections (user_id, workspace_id, page_id, access_token, connection_status, pending_pages) values
      ('${U.A}', '${W.WA}', null, null, 'choose_page',
       '[{"id":"p1","name":"Page one","access_token":"EAA-page-token-1"},{"id":"p2","name":"Page two","access_token":"EAA-page-token-2"}]'::jsonb);
    insert into public.youtube_connections (user_id, workspace_id, channel_id, access_token, refresh_token) values
      ('${U.B}', '${W.WB}', 'UC-b', 'ya29-secret-B', '1//refresh-secret-B');
    insert into public.tiktok_connections (user_id, workspace_id, open_id, access_token, refresh_token) values
      ('${U.B}', '${W.WB}', 'tt-b', 'act.secret-B', 'rft.secret-B');

    insert into public.alert_events (user_id, workspace_id, type, fingerprint, title, body) values
      ('${U.O}', '${W.W1}', 'breakout', 'fp-1', 'Real alert', 'A post broke out');
    insert into public.comment_drafts (user_id, workspace_id, platform, account_id, post_id, comment_id, draft) values
      ('${U.O}', '${W.W2}', 'instagram', 'ig-o2', 'm1', 'c1', 'Thanks!');
    insert into public.studio_projects (id, user_id, workspace_id, title) values
      ('cccccccc-5555-4000-8000-000000000005', '${U.O}', '${W.W2}', 'Client two launch video');

    insert into storage.buckets (id, name, public) values ('studio-sources', 'studio-sources', false) on conflict do nothing;
    insert into storage.objects (bucket_id, name, owner) values
      ('scheduled-media', '${U.A}/${P.A}/1_a.jpg', '${U.A}'),
      ('scheduled-media', '${U.B}/${P.B}/1_unreleased.mp4', '${U.B}'),
      ('studio-sources', '${U.O}/proj/clip/source.mp4', '${U.O}');
  `);
}
