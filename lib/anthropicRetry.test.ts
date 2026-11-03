import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { retryOnMaxTokens, RETRY_MAX_TOKENS } from "./anthropic";

const reply = (stop: string, out = 10) => ({ stop_reason: stop, content: [{ type: "text", text: "{}" }], usage: { input_tokens: 100, output_tokens: out } });

function fakeClient(create: ReturnType<typeof vi.fn>) {
  const c = { messages: { create } } as unknown as Anthropic;
  retryOnMaxTokens(c);
  return c;
}

describe("an answer cut off at max_tokens", () => {
  beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => undefined); });

  it("is asked for once more with 2.5x the room, and both calls count in the usage", async () => {
    const create = vi.fn().mockResolvedValueOnce(reply("max_tokens", 6000)).mockResolvedValueOnce(reply("end_turn", 9000));
    const c = fakeClient(create);
    const res = await c.messages.create({ model: "m", max_tokens: 6000, messages: [] } as never);
    expect(create.mock.calls.map((x) => (x[0] as { max_tokens: number }).max_tokens)).toEqual([6000, 15000]);
    expect((res as unknown as { stop_reason: string; usage: { input_tokens: number; output_tokens: number } })).toMatchObject({ stop_reason: "end_turn", usage: { input_tokens: 200, output_tokens: 15000 } });
  });

  it("is left alone when it finished, when streaming, or when already at the ceiling", async () => {
    const done = vi.fn().mockResolvedValue(reply("end_turn"));
    await fakeClient(done).messages.create({ model: "m", max_tokens: 100, messages: [] } as never);
    expect(done).toHaveBeenCalledTimes(1);
    const streaming = vi.fn().mockResolvedValue(reply("max_tokens"));
    await fakeClient(streaming).messages.create({ model: "m", max_tokens: 100, stream: true, messages: [] } as never);
    expect(streaming).toHaveBeenCalledTimes(1);
    const capped = vi.fn().mockResolvedValue(reply("max_tokens"));
    await fakeClient(capped).messages.create({ model: "m", max_tokens: RETRY_MAX_TOKENS, messages: [] } as never);
    expect(capped).toHaveBeenCalledTimes(1);
  });

  it("asks only once more, never in a loop", async () => {
    const create = vi.fn().mockResolvedValue(reply("max_tokens"));
    const res = await fakeClient(create).messages.create({ model: "m", max_tokens: 1000, messages: [] } as never);
    expect(create).toHaveBeenCalledTimes(2);
    expect((res as unknown as { stop_reason: string }).stop_reason).toBe("max_tokens");
  });
});

describe("a streaming call", () => {
  it("gets the SDK's own reply object back, so messages.stream() can call .withResponse()", () => {
    const apiPromise = { withResponse: () => Promise.resolve({}) };
    const create = vi.fn().mockReturnValue(apiPromise);
    const out = fakeClient(create).messages.create({ model: "m", max_tokens: 100, stream: true, messages: [] } as never);
    expect(out).toBe(apiPromise);
    expect(typeof (out as unknown as { withResponse: unknown }).withResponse).toBe("function");
  });

  it("works through the real SDK's messages.stream()", async () => {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const sse = [
      ["message_start", { type: "message_start", message: { id: "m1", type: "message", role: "assistant", model: "m", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }],
      ["message_stop", { type: "message_stop" }],
    ].map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
    const fetch = vi.fn(async () => new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } }));
    const client = new Anthropic({ apiKey: "test", fetch: fetch as never });
    retryOnMaxTokens(client);
    const msg = await client.messages.stream({ model: "m", max_tokens: 100, messages: [{ role: "user", content: "x" }] }).finalMessage();
    expect(msg.content[0]).toMatchObject({ type: "text", text: "hi" });
  });
});
