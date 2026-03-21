import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("joins plain class names", () => {
    expect(cn("p-2", "text-sm")).toBe("p-2 text-sm");
  });

  it("supports conditional classes", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });

  it("resolves Tailwind conflicts with last class winning", () => {
    expect(cn("p-2 p-4", "text-sm", "text-lg")).toBe("p-4 text-lg");
  });
});
