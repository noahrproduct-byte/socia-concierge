// Client-safe pieces of the Content Plan's evidence (lib/planEvidence.ts is server only):
// one of the account's own posts as a plan post cites it, and its numbers in words.

const n = (x: number) => x.toLocaleString("en-US");

/** One of the account's own posts as the plan cites it: "P3", with its link and the numbers SOCIA read. */
export type OwnPostRef = {
  id: string;
  url: string | null;
  date: string | null;
  title: string;
  format: string;
  likes: number;
  comments: number;
  views: number | null;
  reach: number | null;
  saved: number | null;
  shares: number | null;
};

/** A post's numbers in words: always likes and comments, the rest only where Instagram returned them. */
export function ownPostNumbers(r: OwnPostRef): string {
  return [
    `${n(r.likes)} likes`,
    `${n(r.comments)} comments`,
    r.views != null ? `${n(r.views)} views` : null,
    r.reach != null ? `${n(r.reach)} reached` : null,
    r.saved != null ? `${n(r.saved)} saves` : null,
    r.shares != null ? `${n(r.shares)} shares` : null,
  ].filter(Boolean).join(", ");
}
