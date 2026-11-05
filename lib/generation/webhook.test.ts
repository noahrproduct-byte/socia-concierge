import { describe, it, expect } from "vitest";
import { signStandardWebhook, verifyStandardWebhook } from "./webhook";

const secret = `whsec_${Buffer.from("a-32-byte-long-secret-for-tests!").toString("base64")}`;
const body = JSON.stringify({ request_id: "r1", status: "completed" });
const now = 1_762_300_000_000;
const ts = String(Math.floor(now / 1000));

describe("standard webhook signatures", () => {
  it("accepts a correct signature within the window", () => {
    const sig = signStandardWebhook(secret, "msg_1", ts, body);
    expect(verifyStandardWebhook(secret, { id: "msg_1", timestamp: ts, signature: sig }, body, now)).toEqual({ ok: true });
  });
  it("accepts when one of several signatures matches (secret rotation)", () => {
    const sig = signStandardWebhook(secret, "msg_1", ts, body);
    expect(verifyStandardWebhook(secret, { id: "msg_1", timestamp: ts, signature: `v1,AAAA ${sig}` }, body, now).ok).toBe(true);
  });
  it("refuses a changed body, a wrong id, a stale timestamp and missing headers", () => {
    const sig = signStandardWebhook(secret, "msg_1", ts, body);
    expect(verifyStandardWebhook(secret, { id: "msg_1", timestamp: ts, signature: sig }, body + " ", now).ok).toBe(false);
    expect(verifyStandardWebhook(secret, { id: "msg_2", timestamp: ts, signature: sig }, body, now).ok).toBe(false);
    expect(verifyStandardWebhook(secret, { id: "msg_1", timestamp: ts, signature: sig }, body, now + 10 * 60_000)).toMatchObject({ ok: false, reason: "stale timestamp" });
    expect(verifyStandardWebhook(secret, { id: null, timestamp: ts, signature: sig }, body, now).ok).toBe(false);
    expect(verifyStandardWebhook("", { id: "msg_1", timestamp: ts, signature: sig }, body, now).ok).toBe(false);
  });
});
