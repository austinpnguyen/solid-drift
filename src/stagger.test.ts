import { describe, expect, it } from "vitest"
import { createStagger } from "./stagger.js"

describe("createStagger", () => {
  it("returns index * delayMs", () => {
    const at = createStagger(5, 80)
    expect(at(0)).toBe(0)
    expect(at(1)).toBe(80)
    expect(at(2)).toBe(160)
    expect(at(4)).toBe(320)
  })

  it("supports a zero delay", () => {
    expect(createStagger(3, 0)(2)).toBe(0)
  })
})
