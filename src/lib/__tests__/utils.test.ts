import { describe, it, expect } from "vitest";
import { cn } from "../utils";

describe("cn()", () => {
  it("merges class strings", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("handles undefined/falsy values", () => {
    expect(cn("a", undefined, false, "b")).toBe("a b");
  });

  it("deduplicates conflicting Tailwind classes (last wins)", () => {
    // tailwind-merge: bg-red-500 is overridden by bg-blue-500
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });

  it("handles conditional classes", () => {
    const active = true;
    const hidden = false;
    expect(cn(active && "text-blue-500", hidden && "hidden")).toBe(
      "text-blue-500"
    );
  });
});
