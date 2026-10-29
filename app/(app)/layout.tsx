import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getViewer } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { getProfile } from "@/lib/profile";
import { readOnboarding } from "@/lib/growthStore";
import { needsOnboarding } from "@/lib/onboarding";

// Every signed-in section shares this shell. As a layout it stays mounted
// while the person moves between sections: the sidebar and top bar are not
// re-read or re-drawn on each click, and only the content area swaps (behind
// the loading skeleton in ./loading.tsx).
//
// Onboarding is required (Noah, 2026-10-29): a brand's owner who hasn't
// finished setting it up is sent to /onboarding first (lib/onboarding.ts).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getViewer();
  if (user) {
    const ctx = await resolveContext(supabase, user.id);
    if (ctx.isOwner) {
      const [{ tableReady, row }, profile] = await Promise.all([
        readOnboarding(ctx),
        getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null),
      ]);
      if (needsOnboarding({ isOwner: ctx.isOwner, row, tableReady, niche: profile?.niche ?? null })) redirect("/onboarding");
    }
  }
  return <AppShell>{children}</AppShell>;
}
