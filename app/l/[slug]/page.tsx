import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { publicSignupPage } from "@/lib/contacts/server";
import SignupForm from "@/components/contacts/SignupForm";
import "@/components/contacts/contacts.css";

// A brand's public sign-up page (lib/contacts): an email with consent and,
// when the brand asks, an Instagram name. Anyone can open it; nothing about the
// brand's other contacts is shown. Not indexed by search engines.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await publicSignupPage(slug);
  return { title: page ? page.title : "Page not found | SOCIA", robots: { index: false, follow: false } };
}

export default async function SignupPagePublic({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await publicSignupPage(slug);
  if (!page) notFound();
  return (
    <main className="su">
      <div className="su-card">
        {page.brand && <p className="su-brand">{page.brand}</p>}
        <h1>{page.title}</h1>
        {page.intro && <p className="su-intro">{page.intro}</p>}
        <SignupForm slug={page.slug} button={page.button} askHandle={page.askHandle} brand={page.brand} />
      </div>
    </main>
  );
}
