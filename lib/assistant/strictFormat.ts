// Anthropic compiles a strict response format (output_config.format) into a grammar with an
// unpublished size limit. A request over it is refused with a 400 before anything is written:
// "The compiled grammar is too large…" (seen on Ask, 2026-11-20) or, as the docs word it,
// "Schema is too complex for compilation". Such a request can be sent again without the strict
// format. Pure.

export function isGrammarTooLarge(err: unknown): boolean {
  const e = err as { status?: number; message?: string; error?: { error?: { message?: string } } } | null;
  if (!e || e.status !== 400) return false;
  const msg = `${e.message ?? ""} ${e.error?.error?.message ?? ""}`;
  return /compiled grammar is too large|too complex for compilation/i.test(msg);
}
