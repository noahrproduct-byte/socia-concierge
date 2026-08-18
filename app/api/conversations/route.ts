import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// List the user's saved chats (newest first).
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ conversations: [] });

    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, messages, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);

    if (error) return NextResponse.json({ conversations: [] });
    return NextResponse.json({ conversations: data ?? [] });
  } catch {
    return NextResponse.json({ conversations: [] });
  }
}

// Create or update a conversation. Returns its id.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { id?: string; title?: string; messages?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const now = new Date().toISOString();

  try {
    if (body.id) {
      const { error } = await supabase
        .from("conversations")
        .update({ title: body.title ?? null, messages: body.messages ?? [], updated_at: now })
        .eq("id", body.id)
        .eq("user_id", user.id);
      if (error) throw error;
      return NextResponse.json({ id: body.id });
    } else {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          user_id: user.id,
          title: body.title ?? null,
          messages: body.messages ?? [],
          updated_at: now,
        })
        .select("id")
        .single();
      if (error) throw error;
      return NextResponse.json({ id: data.id });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Couldn't save.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
