import { afterEach, describe, expect, it, vi } from "vitest"
import { createRoot, type Accessor } from "solid-js"
import { createHorizontalScroll } from "./horizontal.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

interface RectStub {
  top: number
  height: number
}

interface EnvStub {
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  setReduced: (v: boolean) => void
  fire: (type: string) => void
  triggerResize: () => void
  frames: (n: number) => void
  queueLength: () => number
}

interface ElStubs {
  pin: { el: unknown; rect: RectStub }
  track: { el: unknown; style: Record<string, string> }
  stage: { el: unknown; style: Record<string, string> }
  setTrackWidth: (w: number) => void
}

function makeEls(
  pinTop: number,
  pinHeight: number,
  trackWidth: number,
): ElStubs {
  const rect: RectStub = { top: pinTop, height: pinHeight }
  const dims = { trackWidth }
  const trackStyle: Record<string, string> = {}
  const stageStyle: Record<string, string> = {}
  return {
    pin: {
      el: { getBoundingClientRect: () => rect },
      rect,
    },
    track: {
      el: {
        get scrollWidth() {
          return dims.trackWidth
        },
        style: trackStyle,
        parentElement: null,
      },
      style: trackStyle,
    },
    stage: {
      el: { clientWidth: 1000, style: stageStyle },
      style: stageStyle,
    },
    setTrackWidth: (w: number) => {
      dims.trackWidth = w
    },
  }
}

/** Full browser-env stub: window, matchMedia, ResizeObserver, rAF. */
function stubEnv(
  opts: {
    reduced?: boolean
    clock?: boolean // queued rAF + fake performance.now, otherwise sync rAF
  } = {},
): EnvStub {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const addEventListener = vi.fn(
    (type: string, fn: (...args: unknown[]) => void) => {
      let set = listeners.get(type)
      if (!set) {
        set = new Set()
        listeners.set(type, set)
      }
      set.add(fn)
    },
  )
  const removeEventListener = vi.fn(
    (type: string, fn: (...args: unknown[]) => void) => {
      listeners.get(type)?.delete(fn)
    },
  )

  // Controllable matchMedia for the reduced-motion path.
  const mqListeners = new Set<() => void>()
  let matches = !!opts.reduced
  const mql = {
    get matches() {
      return matches
    },
    addEventListener: vi.fn((_t: string, fn: () => void) => {
      mqListeners.add(fn)
    }),
    removeEventListener: vi.fn((_t: string, fn: () => void) => {
      mqListeners.delete(fn)
    }),
  }

  vi.stubGlobal("window", {
    innerHeight: 1000,
    innerWidth: 1000,
    addEventListener,
    removeEventListener,
    matchMedia: vi.fn(() => mql),
  })

  // ResizeObserver with manually triggerable callbacks.
  const roCallbacks: (() => void)[] = []
  class FakeRO {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
    constructor(cb: () => void) {
      roCallbacks.push(cb)
    }
  }
  vi.stubGlobal("ResizeObserver", FakeRO)

  const queue: (() => void)[] = []
  if (opts.clock) {
    let fakeNow = 1000
    let id = 0
    vi.stubGlobal("performance", { now: () => fakeNow })
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queue.push(() => {
        fakeNow += 16
        cb(fakeNow)
      })
      return ++id
    })
  } else {
    // Synchronous rAF: only safe in reduced-motion tests, where the
    // spring jumps to its target without scheduling engine frames.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(16)
      return 0
    })
  }
  vi.stubGlobal("cancelAnimationFrame", vi.fn())

  return {
    addEventListener,
    removeEventListener,
    setReduced: (v: boolean) => {
      matches = v
      mqListeners.forEach((fn) => fn())
    },
    fire: (type: string) => {
      listeners.get(type)?.forEach((fn) => fn())
    },
    triggerResize: () => {
      roCallbacks.forEach((cb) => cb())
    },
    frames: (n: number) => {
      for (let i = 0; i < n; i++) queue.splice(0).forEach((run) => run())
    },
    queueLength: () => queue.length,
  }
}

function asEl(v: unknown): HTMLElement {
  return v as unknown as HTMLElement
}

describe("createHorizontalScroll", () => {
  it("SSR: returns zero accessors without touching window", () => {
    expect(typeof window).toBe("undefined")
    createRoot(() => {
      const h = createHorizontalScroll({
        pin: () => null,
        track: () => null,
      })
      expect(h.progress()).toBe(0)
      expect(h.distance()).toBe(0)
      expect(() => h.refresh()).not.toThrow()
    })
  })

  it("progress is 0 at the start of the pin range", () => {
    stubEnv({ reduced: true })
    const els = makeEls(0, 3000, 3000)
    let progress!: Accessor<number>
    createRoot(() => {
      progress = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      }).progress
    })
    // travel = 3000 - 1000 = 2000, scrolled = 0
    expect(progress()).toBe(0)
  })

  it("progress is 1 at the end of the pin range", () => {
    stubEnv({ reduced: true })
    const els = makeEls(-2000, 3000, 3000)
    let progress!: Accessor<number>
    createRoot(() => {
      progress = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      }).progress
    })
    expect(progress()).toBe(1)
  })

  it("progress is 0.5 halfway through", () => {
    stubEnv({ reduced: true })
    const els = makeEls(-1000, 3000, 3000)
    let progress!: Accessor<number>
    createRoot(() => {
      progress = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      }).progress
    })
    expect(progress()).toBeCloseTo(0.5, 5)
  })

  it("clamps progress beyond the range", () => {
    stubEnv({ reduced: true })
    const els = makeEls(400, 3000, 3000)
    let api!: ReturnType<typeof createHorizontalScroll>
    createRoot(() => {
      api = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      })
    })
    expect(api.progress()).toBe(0)
    els.pin.rect.top = -9000
    api.refresh()
    expect(api.progress()).toBe(1)
  })

  it("start/end offsets shift the mapping", () => {
    stubEnv({ reduced: true })
    const els = makeEls(-500, 3000, 3000) // scrolled = 500 = 0.25 * 2000
    let api!: ReturnType<typeof createHorizontalScroll>
    createRoot(() => {
      api = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
        start: 0.25,
        end: 0.75,
      })
    })
    expect(api.progress()).toBe(0)
    els.pin.rect.top = -1500 // scrolled = 1500 = 0.75 * 2000
    api.refresh()
    expect(api.progress()).toBe(1)
    els.pin.rect.top = -1000 // midpoint of the mapped span
    api.refresh()
    expect(api.progress()).toBeCloseTo(0.5, 5)
  })

  it("measures distance as track width minus stage width", () => {
    stubEnv({ reduced: true })
    const els = makeEls(0, 3000, 3400)
    let distance!: Accessor<number>
    createRoot(() => {
      distance = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      }).distance
    })
    expect(distance()).toBe(2400)
  })

  it("never measures a negative distance", () => {
    stubEnv({ reduced: true })
    const els = makeEls(0, 3000, 600) // track narrower than the stage
    let distance!: Accessor<number>
    createRoot(() => {
      distance = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      }).distance
    })
    expect(distance()).toBe(0)
  })

  it("accepts an explicit numeric distance", () => {
    stubEnv({ reduced: true })
    const els = makeEls(0, 3000, 3400)
    let distance!: Accessor<number>
    createRoot(() => {
      distance = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
        distance: 500,
      }).distance
    })
    expect(distance()).toBe(500)
  })

  it("accepts a distance function, re-evaluated on refresh", () => {
    stubEnv({ reduced: true })
    const els = makeEls(0, 3000, 3400)
    let w = 777
    let api!: ReturnType<typeof createHorizontalScroll>
    createRoot(() => {
      api = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
        distance: () => w,
      })
    })
    expect(api.distance()).toBe(777)
    w = 123
    api.refresh()
    expect(api.distance()).toBe(123)
  })

  it("updates progress on scroll events", () => {
    const env = stubEnv({ reduced: true })
    const els = makeEls(0, 3000, 3000)
    let progress!: Accessor<number>
    createRoot(() => {
      progress = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      }).progress
    })
    expect(progress()).toBe(0)
    els.pin.rect.top = -1000
    env.fire("scroll")
    expect(progress()).toBeCloseTo(0.5, 5)
  })

  it("refresh() recomputes immediately without a scroll event", () => {
    stubEnv({ reduced: true })
    const els = makeEls(0, 3000, 3000)
    let api!: ReturnType<typeof createHorizontalScroll>
    createRoot(() => {
      api = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      })
    })
    els.pin.rect.top = -2000
    api.refresh()
    expect(api.progress()).toBe(1)
  })

  it("recomputes distance when ResizeObserver fires", () => {
    const env = stubEnv({ reduced: true })
    const els = makeEls(0, 3000, 3400)
    let distance!: Accessor<number>
    createRoot(() => {
      distance = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      }).distance
    })
    expect(distance()).toBe(2400)
    els.setTrackWidth(4400)
    env.triggerResize()
    expect(distance()).toBe(3400)
  })

  it("throttles rapid scroll events to a single rAF", () => {
    const env = stubEnv({ clock: true })
    const els = makeEls(-1000, 3000, 3000)
    let dispose!: () => void
    createRoot((d) => {
      createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      })
      dispose = d
    })
    const before = env.queueLength()
    env.fire("scroll")
    env.fire("scroll")
    env.fire("scroll")
    expect(env.queueLength()).toBe(before + 1)
    // Teardown: remove the spring from the shared engine and let it
    // observe the empty task set, so the next test starts clean.
    dispose()
    env.frames(1)
  })

  it("smooths progress with a spring when motion is allowed", () => {
    const env = stubEnv({ clock: true })
    const els = makeEls(-1000, 3000, 3000) // raw target 0.5
    let progress!: Accessor<number>
    let dispose!: () => void
    createRoot((d) => {
      progress = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      }).progress
      dispose = d
    })
    env.frames(1)
    const mid = progress()
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(0.5)
    env.frames(400)
    expect(progress()).toBeCloseTo(0.5, 3)
    dispose()
    env.frames(1)
  })

  it("translates the track with translate3d", () => {
    const env = stubEnv({ clock: true })
    const els = makeEls(-1000, 3000, 3000) // progress 0.5, distance 2000
    let dispose!: () => void
    createRoot((d) => {
      createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      })
      dispose = d
    })
    env.frames(400)
    const m = /translate3d\((-?[\d.]+)px, 0, 0\)/.exec(
      els.track.style.transform,
    )
    expect(m).not.toBeNull()
    expect(parseFloat(m![1])).toBeCloseTo(-1000, 0)
    dispose()
    env.frames(1)
  })

  it("clears the transform at rest", () => {
    stubEnv({ clock: true })
    const els = makeEls(0, 3000, 3000)
    let dispose!: () => void
    createRoot((d) => {
      createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      })
      dispose = d
    })
    expect(els.track.style.transform ?? "").toBe("")
    dispose()
  })

  it("calls onProgress with smoothed values", () => {
    const env = stubEnv({ reduced: true })
    const els = makeEls(0, 3000, 3000)
    const seen: number[] = []
    createRoot(() => {
      createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
        onProgress: (p) => seen.push(p),
      })
    })
    expect(seen).toEqual([0])
    els.pin.rect.top = -2000
    env.fire("scroll")
    expect(seen[seen.length - 1]).toBe(1)
  })

  it("reduced motion: unpins the stage and stacks the track", () => {
    stubEnv({ reduced: true })
    const els = makeEls(-1000, 3000, 3000)
    createRoot(() => {
      createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      })
    })
    expect(els.stage.style.position).toBe("static")
    expect(els.track.style.transform ?? "").toBe("")
    expect(els.track.style.flexDirection).toBe("column")
  })

  it("reduced motion: progress is still reported", () => {
    stubEnv({ reduced: true })
    const els = makeEls(-1000, 3000, 3000)
    let progress!: Accessor<number>
    createRoot(() => {
      progress = createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      }).progress
    })
    expect(progress()).toBeCloseTo(0.5, 5)
  })

  it("reduced motion: restores styles when the preference flips off", () => {
    const env = stubEnv({ reduced: true })
    const els = makeEls(0, 3000, 3000)
    createRoot(() => {
      createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      })
    })
    expect(els.stage.style.position).toBe("static")
    env.setReduced(false)
    expect(els.stage.style.position ?? "").toBe("")
    expect(els.track.style.flexDirection ?? "").toBe("")
  })

  it("handles missing elements without crashing", () => {
    stubEnv({ reduced: true })
    createRoot(() => {
      const h = createHorizontalScroll({
        pin: () => null,
        track: () => null,
      })
      expect(h.progress()).toBe(0)
      expect(h.distance()).toBe(0)
      expect(() => h.refresh()).not.toThrow()
    })
  })

  it("cleanup removes listeners and disconnects the observer", () => {
    const env = stubEnv({ reduced: true })
    const els = makeEls(0, 3000, 3000)
    let dispose!: () => void
    createRoot((d) => {
      createHorizontalScroll({
        pin: () => asEl(els.pin.el),
        track: () => asEl(els.track.el),
        stage: () => asEl(els.stage.el),
      })
      dispose = d
    })
    dispose()
    expect(env.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    )
    expect(env.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    )
  })
})
