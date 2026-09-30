import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile, type BrandDetail } from "@/lib/profile";
import { resolveContext, brandWorkspace, can, forbiddenCopy } from "@/lib/context";
import { updateWorkspace, type WorkspacePatch } from "@/lib/workspaces";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ profile: null });
    // Per-user fields (theme, platforms) come from the VIEWER's own profile
    // row; the brand is overlaid from the active non-default workspace. This
    // keeps a guest's own theme correct while showing the workspace's brand.
    const ctx = await resolveContext(supabase, user.id);
    const profile = await getProfile(supabase, user.id, brandWorkspace(ctx));
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ profile: null });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: {
    niche?: string;
    brand_name?: string;
    goals?: string;
    platforms?: string[];
    account_connected?: boolean;
    brand_detail?: BrandDetail;
    appearance?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if ("appearance" in body && !["light", "dark", "system"].includes(String(body.appearance))) {
    return NextResponse.json({ error: "appearance must be light, dark or system." }, { status: 400 });
  }

  // A non-default Brand Workspace owns its brand; the default workspace and
  // pre-migration accounts keep their brand on the per-user profile.
  const ctx = await resolveContext(supabase, user.id);
  const brandWs = brandWorkspace(ctx);

  // Per-user fields (theme, legacy platforms, account flag) always go to the
  // profile, whichever workspace is active.
  const row: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (Array.isArray(body.platforms)) row.platforms = body.platforms;
  if (typeof body.account_connected === "boolean") row.account_connected = body.account_connected;
  if ("appearance" in body) row.appearance = body.appearance;

  // Brand fields (niche / name / goals / brand_detail). Only touch what the
  // caller sends, so the brand form, strategist form and connections manager
  // save independently without wiping each other.
  const brand: Record<string, unknown> = {};
  if ("niche" in body) brand.niche = body.niche || null;
  if ("brand_name" in body) brand.brand_name = body.brand_name || null;
  if ("goals" in body) brand.goals = body.goals || null;

  // brand_detail is a single jsonb shared by two forms — merge, never clobber.
  // Merge against the source the brand actually lives in (workspace or profile).
  let brandSaved: boolean | undefined;
  if (body.brand_detail && typeof body.brand_detail === "object") {
    let existing: BrandDetail;
    if (brandWs) {
      existing = (brandWs.brand_detail ?? {}) as BrandDetail;
    } else {
      const { data: cur } = await supabase.from("profiles").select("brand_detail").eq("user_id", user.id).maybeSingle();
      existing = (cur?.brand_detail ?? {}) as BrandDetail;
    }
    brand.brand_detail = {
      ...existing,
      ...body.brand_detail,
      strategist: { ...(existing.strategist ?? {}), ...(body.brand_detail.strategist ?? {}) },
    };
    brandSaved = true;
  }

  // Editing a workspace's brand is a manage_workspace action: only the owner or
  // an admin may. Without this, a Member (who acts through the service-role
  // client) could overwrite the owner's brand. Per-user fields (theme etc.)
  // still save below, so a Member can still set their own preferences.
  if (brandWs && Object.keys(brand).length && !can(ctx, "manage_workspace")) {
    return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  }

  // Route the brand to the workspace when one owns it; otherwise fold it into
  // the profile upsert (the historical path).
  if (brandWs) {
    if (Object.keys(brand).length) {
      const ok = await updateWorkspace(ctx.client, ctx.ownerId, brandWs.id, brand as WorkspacePatch);
      if (!ok) return NextResponse.json({ error: "Couldn't save the brand for this workspace." }, { status: 500 });
    }
  } else {
    Object.assign(row, brand);
  }

  // The profile upsert carries the per-user fields (and the brand too, for the
  // default/pre-migration path). Skip it when there is nothing profile-side to
  // write beyond the bookkeeping keys.
  const hasProfileWork = Object.keys(row).some((k) => k !== "user_id" && k !== "updated_at");
  let error: { message: string } | null = null;
  if (hasProfileWork) {
    ({ error } = await supabase.from("profiles").upsert(row, { onConflict: "user_id" }));
    if (error && "appearance" in row) {
      // Column not migrated yet: the device copy still applies; save the rest.
      delete row.appearance;
      ({ error } = await supabase.from("profiles").upsert(row, { onConflict: "user_id" }));
    }
    if (error && "brand_detail" in row) {
      // Column may not exist yet — save everything else and tell the client.
      delete row.brand_detail;
      brandSaved = false;
      ({ error } = await supabase.from("profiles").upsert(row, { onConflict: "user_id" }));
    }
  }

  if (error) {
    return NextResponse.json(
      { error: `Couldn't save — is the profiles table created? (${error.message})` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, ...(brandSaved !== undefined ? { brandSaved } : {}) });
}
