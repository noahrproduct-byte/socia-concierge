import { describe, expect, it } from "vitest";
import { alreadyRegistered, cleanCode, codeProblem, codeReady, confirmNext, isConfirmType, isUnconfirmed, linkProblem, sendProblem } from "./authEmail";

describe("email confirmation", () => {
  it("knows an unconfirmed log-in", () => {
    expect(isUnconfirmed({ code: "email_not_confirmed" })).toBe(true);
    expect(isUnconfirmed({ message: "Email not confirmed" })).toBe(true);
    expect(isUnconfirmed({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(false);
    expect(isUnconfirmed(null)).toBe(false);
  });
  it("says why an email couldn't be sent", () => {
    expect(sendProblem({ code: "over_email_send_rate_limit" })).toContain("Wait a minute");
    expect(sendProblem({ message: "For security purposes, you can only request this after 42 seconds." })).toContain("Wait a minute");
    expect(sendProblem({ code: "email_address_not_authorized" })).toContain("couldn't send email");
    expect(sendProblem({ code: "weak_password", message: "Password is too weak" })).toBeNull();
  });
  it("spots a sign-up for an address that already has an account", () => {
    expect(alreadyRegistered({ identities: [] })).toBe(true);
    expect(alreadyRegistered({ identities: [{}] })).toBe(false);
    expect(alreadyRegistered({})).toBe(false);
    expect(alreadyRegistered(null)).toBe(false);
  });
  it("only accepts Supabase's own link kinds", () => {
    expect(isConfirmType("email")).toBe(true);
    expect(isConfirmType("recovery")).toBe(true);
    expect(isConfirmType("sms")).toBe(false);
    expect(isConfirmType(null)).toBe(false);
  });
  it("never sends a confirmed link off the site or back into the auth routes", () => {
    const o = "https://sociaos.com";
    expect(confirmNext(null, o, "email")).toBe("/dashboard");
    expect(confirmNext(null, o, "recovery")).toBe("/reset-password");
    expect(confirmNext("/settings#plan", o, "email")).toBe("/settings#plan");
    expect(confirmNext("https://sociaos.com/oauth/consent?x=1", o, "email")).toBe("/oauth/consent?x=1");
    expect(confirmNext("https://sociaos.com/auth/callback", o, "email")).toBe("/dashboard");
    expect(confirmNext("https://evil.example/steal", o, "email")).toBe("/dashboard");
    expect(confirmNext("//evil.example", o, "email")).toBe("/dashboard");
    expect(confirmNext("https://sociaos.com.evil.example/x", o, "email")).toBe("/dashboard");
  });
  it("explains a link that didn't work", () => {
    expect(linkProblem("link")).toContain("expired");
    expect(linkProblem("auth")).toContain("log in with your password");
    expect(linkProblem("other")).toBeNull();
  });
});

describe("the code in the confirmation email", () => {
  it("keeps only the digits, however it was typed or pasted", () => {
    expect(cleanCode("123456")).toBe("123456");
    expect(cleanCode("123 456")).toBe("123456");
    expect(cleanCode(" 12-34-56\n")).toBe("123456");
    expect(cleanCode("abc")).toBe("");
    expect(cleanCode("1234567890123")).toBe("1234567890");
  });
  it("is ready from six digits", () => {
    expect(codeReady("12345")).toBe(false);
    expect(codeReady("123456")).toBe(true);
    expect(codeReady("12345678")).toBe(true);
    expect(codeReady("")).toBe(false);
  });
  it("says why a code was refused", () => {
    expect(codeProblem({ code: "otp_expired" })).toContain("expired");
    expect(codeProblem({ message: "Token has expired or is invalid" })).toContain("expired");
    expect(codeProblem({ code: "over_request_rate_limit", status: 429 })).toContain("Wait a minute");
    expect(codeProblem({ message: "Token is invalid" })).toContain("isn't right");
    expect(codeProblem(null)).toContain("isn't right");
  });
});

