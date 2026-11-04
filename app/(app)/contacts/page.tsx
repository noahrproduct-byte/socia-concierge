import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { getViewer } from "@/lib/supabase/server";
import { resolveContext, can } from "@/lib/context";
import PageHeader from "@/components/PageHeader";
import ContactsPage from "@/components/contacts/ContactsPage";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { minPlanWithFeature, pricingHref, PLANS } from "@/lib/plans";
import { getIgSnapshot } from "@/lib/instagramSync";
import { isMissingTable, listContacts, readRules, readSignupPage } from "@/lib/contacts/server";
import "@/components/contacts/contacts.css";

export const metadata = { title: "Contacts | SOCIA" };

const SUB = "The people who comment on your posts or sign up on your page, with your tags and notes.";

// Contacts (Starter and up, owner and admins): commenters on the brand's own
// Instagram posts and sign-ups from its page, with tags, notes, keyword rules
// and a CSV export. lib/contacts.
export default async function Contacts() {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const ctx = await resolveContext(supabase, user.id);
  const ent = await getEntitlements(ctx.client, ctx.ownerId);

  if (!canUseFeature(ent, "contacts")) {
    const plan = minPlanWithFeature("contacts");
    return (
      <>
        <PageHeader title="Contacts" sub={SUB} />
        <div className="ct-gate">
          <span className="ct-gate-ico" aria-hidden><Users size={22} /></span>
          <h2>Contacts are on {PLANS[plan].name}</h2>
          <p>See everyone who comments on your Instagram posts, tag them, keep notes, and collect emails with a sign-up page SOCIA hosts for you.</p>
          <Link href={pricingHref(plan)} className="s-btn s-btn--primary">Upgrade to {PLANS[plan].name} <ArrowRight size={15} /></Link>
        </div>
      </>
    );
  }
  if (!can(ctx, "manage_workspace")) {
    return (
      <>
        <PageHeader title="Contacts" sub={SUB} />
        <p className="ct-note">Contacts hold people&apos;s emails, so only the workspace owner and admins can open them.</p>
      </>
    );
  }

  const wsId = ctx.workspace?.id ?? null;
  let initial: Parameters<typeof ContactsPage>[0]["initial"] = { contacts: [], rules: [], page: null, migration: false };
  try {
    const [contacts, rules, page] = await Promise.all([
      listContacts(ctx.client, ctx.ownerId, wsId),
      readRules(ctx.client, ctx.ownerId, wsId),
      readSignupPage(ctx.client, ctx.ownerId, wsId),
    ]);
    initial = { contacts, rules, page, migration: false };
  } catch (e) {
    initial = { ...initial, migration: isMissingTable(e) };
  }
  const ig = await getIgSnapshot(ctx.client, ctx.ownerId, wsId).catch(() => null);

  return (
    <>
      <PageHeader title="Contacts" sub={SUB} />
      <ContactsPage initial={initial} igConnected={Boolean(ig && ig.followers_count != null)} brand={ctx.workspace?.name ?? null} />
    </>
  );
}
