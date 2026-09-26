import { afterEach, describe, expect, it, vi } from "vitest"
import { createRoot, createSignal, type Accessor } from "solid-js"
import {
  prefersReducedMotion,
  usePrefersReducedMotion,
} from "./reduced-motion.js"
import { createSpring } from "./spring.js"
import { createTween } from "./tween.js"
import { animate } from "./animate.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

interface MediaStub {
  setMatches: (v: boolean) => void
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

/** Stub window.matchMedia with a controllable `matches` value. */
function mockMatchMedia(matches: boolean): MediaStub {
  const listeners = new Set<() => void>()
  const state = { matches }
  const mql = {
    // Getter: always reflects the current preference, like a real
    // MediaQueryList whose `matches` is live.
    get matches() {
      return state.matches
    },
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn((_type: string, fn: () => void) => {
      listeners.add(fn)
    }),
    removeEventListener: vi.fn((_type: string, fn: () => void) => {
      listeners.delete(fn)
    }),
  }
  vi.stubGlobal("window", { matchMedia: vi.fn(() => mql) })
  return {
    addEventListener: mql.addEventListener,
    removeEventListener: mql.removeEventListener,
    setMatches: (v: boolean) => {
      state.matches = v
      listeners.forEach((fn) => fn())
    },
  }
}

/** Fake clock driving both performance.now and rAF. */
function useFakeClock() {
  let fakeNow = 1000
  const queue: (() => void)[] = []
  let id = 0
  vi.stubGlobal("performance", { now: () => fakeNow })
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.push(() => {
      fakeNow += 16
      cb(fakeNow)
    })
    return ++id
  })
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  return {
    frames(n: number) {
      for (let i = 0; i < n; i++) queue.splice(0).forEach((run) => run())
    },
  }
}

describe("usePrefersReducedMotion", () => {
  it("returns false on the server", () => {
    createRoot(() => {
      expect(prefersReducedMotion()).toBe(false)
      expect(usePrefersReducedMotion()()).toBe(false)
    })
  })

  it("reflects the media query", () => {
    mockMatchMedia(true)
    let reduced!: Accessor<boolean>
    createRoot(() => {
      reduced = usePrefersReducedMotion()
    })
    expect(reduced()).toBe(true)

    mockMatchMedia(false)
    createRoot(() => {
      reduced = usePrefersReducedMotion()
    })
    expect(reduced()).toBe(false)
  })

  it("updates when the OS preference changes", () => {
    const media = mockMatchMedia(false)
    let reduced!: Accessor<boolean>
    createRoot(() => {
      reduced = usePrefersReducedMotion()
    })
    expect(reduced()).toBe(false)
    media.setMatches(true)
    expect(reduced()).toBe(true)
    media.setMatches(false)
    expect(reduced()).toBe(false)
  })

  it("removes the change listener on cleanup", () => {
    const media = mockMatchMedia(false)
    let dispose!: () => void
    createRoot((d) => {
      usePrefersReducedMotion()
      dispose = d
    })
    dispose()
    expect(media.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    )
  })
})

describe("reduced motion honoring", () => {
  it("createSpring jumps to the target immediately", () => {
    mockMatchMedia(true)
    let value!: Accessor<number>
    let setTarget!: (v: number) => void
    createRoot(() => {
      const [target, set] = createSignal(0)
      setTarget = set
      value = createSpring(target)
    })
    expect(value()).toBe(0)
    setTarget(100)
    // No frames needed. Already there.
    expect(value()).toBe(100)
  })

  it("createTween jumps to the target immediately", () => {
    mockMatchMedia(true)
    let completed = false
    let value!: Accessor<number>
    let setTarget!: (v: number) => void
    createRoot(() => {
      const [target, set] = createSignal(0)
      setTarget = set
      value = createTween(target, {
        duration: 5000,
        onComplete: () => {
          completed = true
        },
      })
    })
    setTarget(100)
    expect(value()).toBe(100)
    expect(completed).toBe(true)
  })

  it("animate delivers the end value without frames", async () => {
    mockMatchMedia(true)
    const seen: number[] = []
    let completed = false
    const ctl = animate(0, 100, {
      duration: 5000,
      onUpdate: (v) => seen.push(v),
      onComplete: () => {
        completed = true
      },
    })
    expect(seen).toEqual([100])
    expect(completed).toBe(true)
    await ctl.finished
    ctl.stop() // no-op after completion
  })

  it("createSpring still animates when reduced motion is off", () => {
    mockMatchMedia(false)
    const clock = useFakeClock()
    let value!: Accessor<number>
    let setTarget!: (v: number) => void
    createRoot(() => {
      const [target, set] = createSignal(0)
      setTarget = set
      value = createSpring(target, { stiffness: 170, damping: 26 })
    })
    setTarget(100)
    // Not instant. The spring needs frames to travel.
    expect(value()).toBe(0)
    clock.frames(300)
    expect(value()).toBeGreaterThan(99)
    expect(value()).toBeLessThanOrEqual(100)
  })

  it("createTween still animates when reduced motion is off", () => {
    mockMatchMedia(false)
    const clock = useFakeClock()
    let value!: Accessor<number>
    let setTarget!: (v: number) => void
    createRoot(() => {
      const [target, set] = createSignal(0)
      setTarget = set
      value = createTween(target, { duration: 160 })
    })
    setTarget(100)
    expect(value()).toBe(0)
    clock.frames(5) // 80ms, mid-tween
    expect(value()).toBeGreaterThan(0)
    expect(value()).toBeLessThan(100)
    clock.frames(20) // well past the duration
    expect(value()).toBe(100)
  })
})
