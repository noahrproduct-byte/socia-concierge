import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ChatClient from "@/components/ChatClient";

export const metadata = { title: "AI Strategist — SOCIA" };

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell active="chat" userEmail={user.email}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Ask anything</div>
          <h1>AI Strategist</h1>
          <p className="page-sub">
            A strategist that already knows your account, niche, and numbers.
          </p>
        </div>
      </div>
      <ChatClient />
    </AppShell>
  );
}
