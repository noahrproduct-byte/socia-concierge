import { redirect } from "next/navigation";

// SOCIA AI is no longer a destination. Old links (and bookmarks) land on the
// Dashboard with the contextual drawer open and the question carried over.
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(`/dashboard?ask=${encodeURIComponent(q ?? "")}`);
}
