import { describe, expect, it } from "vitest";
import { shotProps, statedAmount } from "./shotProps";

describe("what is in a storyboard shot", () => {
  it("reads the things a beat names, in its order, from Noah's SOCIA post", () => {
    expect(shotProps("Selfie at chest height, walking from the doorway to your desk, face in frame from the first frame.")).toEqual(["door", "desk"]);
    expect(shotProps("Screen recording of a real agency price page, then a real freelancer listing, with the price circled on screen.")).toEqual(["price", "app"]);
    expect(shotProps("Screen recording of SOCIA reading your Instagram and producing the week's plan, sped up.")).toEqual(["app", "feed", "calendar"]);
    expect(shotProps("Back on your face at the desk, phone propped at eye level, laptop showing the finished plan behind you.")).toEqual(["desk", "laptop", "calendar"]);
  });

  it("never counts the phone that films the shot as something in it", () => {
    expect(shotProps("You walk into frame toward the phone at chest height and stop.")).toEqual([]);
    expect(shotProps("Show the new menu on your phone screen")).toEqual(["menu", "phone"]);
  });

  it("states only an amount the beat itself gives", () => {
    expect(statedAmount("Option one, an agency at $2,000/mo before a single post")).toBe("$2,000/mo");
    expect(statedAmount("Freelancers charge $450 a week")).toBe("$450 a week");
    expect(statedAmount("the price circled on screen")).toBeNull();
  });
});
