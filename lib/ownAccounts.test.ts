import { describe, expect, it } from "vitest";
import { isOwnAccount, looseKey, type OwnAccounts } from "./ownAccounts";

const own = (handles: string[], ids: string[] = [], names: string[] = []): OwnAccounts => ({
  keys: new Set([...handles, ...names].map(looseKey)),
  ids: new Set(ids),
  handles,
});

describe("ownAccounts", () => {
  it("normalises handles loosely", () => {
    expect(looseKey("@Joes.Pizza_NYC")).toBe("joespizzanyc");
    expect(looseKey(null)).toBe("");
  });

  it("recognises the user's own account however the handle is written", () => {
    const me = own(["salvoshermitage"]);
    expect(isOwnAccount(me, { handle: "salvoshermitage" })).toBe(true);
    expect(isOwnAccount(me, { handle: "@SalvosHermitage" })).toBe(true);
    expect(isOwnAccount(me, { handle: "salvos.hermitage" })).toBe(true);
    expect(isOwnAccount(me, { handle: "salvos_hermitage" })).toBe(true);
  });

  it("recognises own platform ids", () => {
    const me = own([], ["17841400000000000", "UCabc"]);
    expect(isOwnAccount(me, { id: "17841400000000000" })).toBe(true);
    expect(isOwnAccount(me, { id: "UCabc", handle: "somethingelse" })).toBe(true);
  });

  it("matches a distinctive display name, not a short one", () => {
    const me = own(["salvoshermitage"], [], ["Salvo's Hermitage"]);
    expect(isOwnAccount(me, { handle: "other", name: "Salvo's Hermitage" })).toBe(true);
    expect(isOwnAccount(me, { handle: "other", name: "Cafe" })).toBe(false);
  });

  it("leaves other accounts alone", () => {
    const me = own(["salvoshermitage"], ["1"]);
    expect(isOwnAccount(me, { handle: "harborstreetcoffee", id: "2", name: "Harbor Street Coffee" })).toBe(false);
    expect(isOwnAccount(own([]), { handle: "anyone" })).toBe(false);
  });
});
