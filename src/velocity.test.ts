import { afterEach, describe, expect, it, vi } from "vitest"
import { createRoot, createSignal, type Accessor } from "solid-js"
import { createVelocity } from "./velocity.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

interface BrowserStub {
  frames: (n: number, step?: number) => void
  fire: (type: string, event?: unknown) => void
  setScrollY: (y: number) => void
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

/**
 * Minimal browser: window with listeners, controllable clock, rAF queue.
 */
// Module-level on purpose: the animation engine remembers a pending
// rAF id across tests, so the fake rAF queue and clock must outlive
// any single test. Otherwise a stale id would make schedule() skip
// queueing and the next test's animations would never run.
let fakeTime = 0
const rafQueue: Array<(t: number) => void> = []

function stubBrowser(opts: { reduced?: boolean } = {}): BrowserStub {
  const listeners = new Map<string, Set<(event: unknown) => void>>()

  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void): number => {
    rafQueue.push(cb)
    return rafQueue.length
  })
  vi.stubGlobal("cancelAnimationFrame", () => {})
  vi.stubGlobal("performance", { now: () => fakeTime })

  const addEventListener = vi.fn(
    (type: string, fn: (event: unknown) => void) => {
      let set = listeners.get(type)
      if (!set) {
        set = new Set()
        listeners.set(type, set)
      }
      set.add(fn)
    },
  )
  const removeEventListener = vi.fn(
    (type: string, fn: (event: unknown) => void) => {
      listeners.get(type)?.delete(fn)
    },
  )

  const win: Record<string, unknown> = {
    addEventListener,
    removeEventListener,
    matchMedia: () => ({
      matches: opts.reduced ?? false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    scrollY: 0,
  }
  vi.stubGlobal("window", win)

  return {
    frames(n: number, step = 16.7) {
      for (let i = 0; i < n; i++) {
        fakeTime += step
        rafQueue.splice(0).forEach((cb) => cb(fakeTime))
      }
    },
    fire(type: string, event: unknown = {}) {
      listeners.get(type)?.forEach((fn) => fn(event))
    },
    setScrollY(y: number) {
      win.scrollY = y
    },
    addEventListener,
    removeEventListener,
  }
}

/** Setup inside a root, interact and assert outside (effects flush on return). */
function setup(
  source: Accessor<number> | undefined,
  options: Parameters<typeof createVelocity>[1] = {},
) {
  let v!: Accessor<number>
  const dispose = createRoot((d) => {
    v = createVelocity(source, options)
    return d
  })
  return { v, dispose }
}

function setupSignal(options: Parameters<typeof createVelocity>[1] = {}) {
  let v!: Accessor<number>
  let setS!: (n: number) => void
  const dispose = createRoot((d) => {
    const [s, _setS] = createSignal(0)
    setS = _setS
    v = createVelocity(s, options)
    return d
  })
  return { v, setS, dispose }
}

describe("createVelocity", () => {
  it("reports 0 when the source never moves", () => {
    const b = stubBrowser()
    const { v, dispose } = setupSignal()
    b.frames(30)
    expect(v()).toBe(0)
    dispose()
  })

  it("measures units per second without smoothing", () => {
    const b = stubBrowser()
    const { v, setS, dispose } = setupSignal({ smoothing: 0 })
    setS(100) // +100 units in one 16.7ms frame
    b.frames(1)
    expect(v()).toBeCloseTo(100 / 0.0167, 0)
    dispose()
  })

  it("smooths toward the raw value with the default EMA", () => {
    const b = stubBrowser()
    let vRaw!: Accessor<number>
    let vSmooth!: Accessor<number>
    let setS!: (n: number) => void
    const dispose = createRoot((d) => {
      const [s, _setS] = createSignal(0)
      setS = _setS
      vRaw = createVelocity(s, { smoothing: 0 })
      vSmooth = createVelocity(s) // smoothing 0.8
      return d
    })
    setS(100)
    b.frames(1)
    // One EMA step from 0 toward the raw value: 20% of the way.
    expect(vSmooth()).toBeCloseTo(vRaw() * 0.2, 0)
    dispose()
  })

  it("decays back to exactly 0 after motion stops", () => {
    const b = stubBrowser()
    const { v, setS, dispose } = setupSignal({ smoothing: 0 })
    setS(100)
    b.frames(1)
    expect(v()).toBeGreaterThan(0)
    b.frames(30) // well past the 120ms settle window
    expect(v()).toBe(0)
    dispose()
  })

  it("applies the scale option", () => {
    const b = stubBrowser()
    const { v, setS, dispose } = setupSignal({ smoothing: 0, scale: 3 })
    setS(100)
    b.frames(1)
    expect(v()).toBeCloseTo((3 * 100) / 0.0167, -1)
    dispose()
  })

  it("measures page scroll velocity with no source", () => {
    const b = stubBrowser()
    const { v, dispose } = setup(undefined, { smoothing: 0 })
    b.setScrollY(200)
    b.fire("scroll")
    b.frames(1)
    expect(v()).toBeCloseTo(200 / 0.0167, 0)
    b.frames(30)
    expect(v()).toBe(0)
    dispose()
  })

  it("returns constant 0 on the server", () => {
    // No window stubbed: SSR path.
    const v = createVelocity(() => 42)
    expect(v()).toBe(0)
  })

  it("returns constant 0 under reduced motion", () => {
    stubBrowser({ reduced: true })
    let v!: Accessor<number>
    let setS!: (n: number) => void
    const dispose = createRoot((d) => {
      const [s, _setS] = createSignal(0)
      setS = _setS
      v = createVelocity(s)
      return d
    })
    setS(1000)
    expect(v()).toBe(0)
    dispose()
  })

  it("removes its scroll listener on cleanup", () => {
    const b = stubBrowser()
    const dispose = createRoot((d) => {
      createVelocity() // default source attaches a scroll listener
      return d
    })
    dispose()
    expect(b.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    )
  })
})
