import { describe, expect, it } from "vitest";
import { springPresets } from "./spring.js";

describe("springPresets", () => {
  it("exposes named configs with positive physics values", () => {
    for (const [name, preset] of Object.entries(springPresets)) {
      expect(preset.stiffness, `${name}.stiffness`).toBeGreaterThan(0);
      expect(preset.damping, `${name}.damping`).toBeGreaterThan(0);
    }
  });

  it("matches the documented library default", () => {
    expect(springPresets.default).toEqual({ stiffness: 170, damping: 26 });
  });

  it("spreads cleanly into spring options", () => {
    const merged = { ...springPresets.wobbly, mass: 2 };
    expect(merged).toEqual({ stiffness: 180, damping: 11, mass: 2 });
  });
});
