import { afterEach, describe, expect, it, vi } from "vitest"
import { createRoot, createSignal } from "solid-js"
import { createScrub } from "./scrub.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createScrub", () => {
  it("interpolates linearly between two keyframes", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0)
      const v = createScrub(p, [
        { at: 0, value: 0 },
        { at: 1, value: 100 },
      ])
      setP(0)
      expect(v()).toBe(0)
      setP(0.25)
      expect(v()).toBe(25)
      setP(0.5)
      expect(v()).toBe(50)
      setP(1)
      expect(v()).toBe(100)
      dispose()
    })
  })

  it("clamps progress outside the keyframe range", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0)
      const v = createScrub(p, [
        { at: 0.2, value: 10 },
        { at: 0.8, value: 90 },
      ])
      setP(0)
      expect(v()).toBe(10)
      setP(1)
      expect(v()).toBe(90)
      setP(-5)
      expect(v()).toBe(10)
      setP(42)
      expect(v()).toBe(90)
      dispose()
    })
  })

  it("sorts keyframes by position", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.5)
      const v = createScrub(p, [
        { at: 1, value: 100 },
        { at: 0, value: 0 },
      ])
      expect(v()).toBe(50)
      dispose()
    })
  })

  it("supports multi-keyframe sequences with holds", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0)
      // Fade in, hold, fade out.
      const v = createScrub(p, [
        { at: 0, value: 0 },
        { at: 0.3, value: 1 },
        { at: 0.7, value: 1 },
        { at: 1, value: 0 },
      ])
      setP(0.15)
      expect(v()).toBeCloseTo(0.5, 5)
      setP(0.5)
      expect(v()).toBe(1)
      setP(0.85)
      expect(v()).toBeCloseTo(0.5, 5)
      dispose()
    })
  })

  it("applies per-segment easing from the later keyframe", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.5)
      const eased = createScrub(p, [
        { at: 0, value: 0 },
        { at: 1, value: 100, easing: "easeOutCubic" },
      ])
      // easeOutCubic(0.5) = 0.875, well above the linear 50.
      expect(eased()).toBeCloseTo(87.5, 5)

      const plain = createScrub(p, [
        { at: 0, value: 0 },
        { at: 1, value: 100 },
      ])
      expect(plain()).toBe(50)
      dispose()
    })
  })

  it("uses the fallback easing option for plain segments", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.5)
      const v = createScrub(
        p,
        [
          { at: 0, value: 0 },
          { at: 1, value: 100 },
        ],
        { easing: "easeOutCubic" },
      )
      expect(v()).toBeCloseTo(87.5, 5)
      dispose()
    })
  })

  it("returns a constant for a single keyframe", () => {
    createRoot((dispose) => {
      const [p, setP] = createSignal(0.7)
      const v = createScrub(p, [{ at: 0.3, value: 42 }])
      expect(v()).toBe(42)
      dispose()
    })
  })

  it("throws on an empty keyframe list", () => {
    expect(() => createScrub(() => 0, [])).toThrow()
  })

  it("holds the final keyframe value under reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    })
    createRoot((dispose) => {
      const [p, setP] = createSignal(0)
      const v = createScrub(p, [
        { at: 0, value: 0 },
        { at: 0.5, value: 50 },
        { at: 1, value: 100 },
      ])
      expect(v()).toBe(100)
      setP(0.5)
      expect(v()).toBe(100)
      setP(1)
      expect(v()).toBe(100)
      dispose()
    })
  })
})
