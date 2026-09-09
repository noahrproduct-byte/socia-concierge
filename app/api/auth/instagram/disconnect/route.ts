import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Remove a stored Instagram connection. With no ig_user_id in the body the
// ACTIVE account is removed (the pre-multi-account behavior). If another
// account remains, it is promoted to active so the app never points nowhere.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { ig_user_id?: string } | null;

  // Which account ids are about to go, so their daily snapshots go with them
  // (the Privacy Policy promises exactly that). Read before deleting.
  const gone: string[] = [];
  try {
    let q = supabase.from("instagram_connections").select("ig_user_id, is_active").eq("user_id", user.id);
    if (body?.ig_user_id) q = q.eq("ig_user_id", body.ig_user_id);
    const { data } = await q;
    const rows = (data ?? []) as { ig_user_id: string | null; is_active?: boolean | null }[];
    const target = body?.ig_user_id ? rows : rows.some((r) => r.is_active) ? rows.filter((r) => r.is_active) : rows;
    for (const r of target) if (r.ig_user_id) gone.push(r.ig_user_id);
  } catch {
    /* older schema without is_active: the deletes below still run */
  }
  const dropSnapshots = async () => {
    for (const id of gone) {
      await supabase.from("account_snapshots").delete().eq("user_id", user.id).eq("ig_user_id", id).then(() => null, () => null);
    }
  };

  let del = supabase.from("instagram_connections").delete().eq("user_id", user.id);
  if (body?.ig_user_id) {
    del = del.eq("ig_user_id", body.ig_user_id);
  } else {
    // Delete only the active row when the column exists; a failed filter
    // falls through to the single-row world below.
    const activeDel = await supabase
      .from("instagram_connections")
      .delete()
      .eq("user_id", user.id)
      .eq("is_active", true);
    if (!activeDel.error) {
      await dropSnapshots();
      await promoteRemaining(supabase, user.id);
      return NextResponse.json({ ok: true });
    }
  }

  const { error } = await del;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await dropSnapshots();
  await promoteRemaining(supabase, user.id);
  return NextResponse.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function promoteRemaining(supabase: any, userId: string) {
  try {
    const { data } = await supabase
      .from("instagram_connections")
      .select("ig_user_id, is_active")
      .eq("user_id", userId);
    const rows = (data ?? []) as { ig_user_id: string | null; is_active?: boolean }[];
    if (!rows.length || rows.some((r) => r.is_active)) return;
    const first = rows[0]?.ig_user_id;
    if (first) {
      await supabase
        .from("instagram_connections")
        .update({ is_active: true })
        .eq("user_id", userId)
        .eq("ig_user_id", first);
    }
  } catch {
    // pre-migration: nothing to promote
  }
}
