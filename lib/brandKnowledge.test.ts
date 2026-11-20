import { describe, expect, it } from "vitest";
import { knowledgeLines, pageText, pagesToRead, sanitizeKnowledge, websiteUrl, MAX_OFFERINGS } from "./brandKnowledge";
import { brandContext } from "./prompt";

describe("website address", () => {
  it("becomes https and drops the fragment", () => {
    expect(websiteUrl("sociaos.com")).toBe("https://sociaos.com/");
    expect(websiteUrl("http://salvospizza.com/menu#top")).toBe("https://salvospizza.com/menu");
    expect(websiteUrl("  ")).toBeNull();
    expect(websiteUrl("localhost")).toBeNull();
  });
});

describe("pages worth reading", () => {
  const html = `
    <a href="/features">Features</a><a href="/pricing">Pricing</a><a href="https://www.acme.com/menu/">Our menu</a>
    <a href="/blog/post-1">Blog post</a><a href="/login">Log in</a><a href="https://other.com/features">Elsewhere</a>
    <a href="/logo.png">Logo</a><a href="mailto:hi@acme.com">Email</a><a href="/features#more">Features again</a>`;
  it("keeps same-site pages about what it offers, never logins, files, mail or other sites", () => {
    const pages = pagesToRead(html, "https://acme.com/");
    expect(pages).toEqual(expect.arrayContaining(["https://acme.com/features", "https://acme.com/pricing", "https://www.acme.com/menu"]));
    expect(pages.some((p) => /login|blog|png|other\.com|mailto/.test(p))).toBe(false);
    expect(pages.filter((p) => p.endsWith("/features"))).toHaveLength(1);
  });
});

describe("page text", () => {
  it("drops scripts and tags and keeps the title, description and words", () => {
    const t = pageText(`<html><head><title>Salvo&#39;s Pizza</title><meta name="description" content="Pizza in Hermitage"><style>.x{}</style></head><body><script>alert(1)</script><h1>Menu &mdash; Joe&rsquo;s</h1><p>Margherita &amp; Pepperoni</p></body></html>`);
    expect(t).toContain("Salvo's Pizza");
    expect(t).toContain("Pizza in Hermitage");
    expect(t).toContain("Margherita & Pepperoni");
    expect(t).toContain("Menu , Joe's");
    expect(t).not.toContain("alert");
    expect(t).not.toContain("<");
  });
});

describe("stored knowledge", () => {
  it("is cleaned, deduplicated and bounded, and empty is null", () => {
    const k = sanitizeKnowledge({
      summary: "An AI app — for creators",
      offerings: [{ name: "Video editor", detail: "Cuts Reels" }, { name: "video editor", detail: "dupe" }, { name: "", detail: "x" }, ...Array.from({ length: 50 }, (_, i) => ({ name: `F${i}`, detail: null }))],
      facts: ["Free plan", "Free plan", ""],
      source: { url: "javascript:alert(1)", pages: [], at: "2026-11-18T00:00:00Z" },
    });
    expect(k?.summary).toBe("An AI app, for creators");
    expect(k?.offerings[0]).toEqual({ name: "Video editor", detail: "Cuts Reels" });
    expect(k?.offerings.filter((o) => o.name.toLowerCase() === "video editor")).toHaveLength(1);
    expect(k?.offerings.length).toBe(MAX_OFFERINGS);
    expect(k?.facts).toEqual(["Free plan"]);
    expect(k?.source).toBeNull();
    expect(sanitizeKnowledge({ summary: "", offerings: [], facts: [] })).toBeNull();
  });
});

describe("in every prompt", () => {
  it("lists what the brand offers with the rule to name only these", () => {
    const k = sanitizeKnowledge({ summary: "Pizza place", offerings: [{ name: "Margherita", detail: null }], facts: ["Open 11 to 9"] });
    const lines = knowledgeLines(k).join("\n");
    expect(lines).toContain("- Margherita");
    expect(lines).toContain("never invent others");
    expect(brandContext({ knowledge: k! })).toContain("- Margherita");
    expect(brandContext({ knowledge: k! })).toContain("Open 11 to 9");
  });
});
