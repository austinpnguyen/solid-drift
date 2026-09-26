import { afterEach, describe, expect, it, vi } from "vitest"
import { createRoot, type Accessor } from "solid-js"
import { createScrollProgress } from "./scroll.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

interface PageStub {
  win: { innerHeight: number; scrollY: number }
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  fire: (type: string) => void
}

/** Stub window/document with a controllable rAF (synchronous by default). */
function stubPageEnv(opts: {
  scrollY: number
  innerHeight: number
  scrollHeight: number
  raf?: (cb: FrameRequestCallback) => number
}): PageStub {
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
  const win = {
    innerHeight: opts.innerHeight,
    scrollY: opts.scrollY,
    addEventListener,
    removeEventListener,
  }
  vi.stubGlobal("window", win)
  vi.stubGlobal("document", {
    documentElement: { scrollHeight: opts.scrollHeight },
  })
  // Synchronous rAF: run the callback inline. Returns 0 so the
  // implementation's "one frame queued" flag resets, like a real frame.
  const raf =
    opts.raf ??
    ((cb: FrameRequestCallback) => {
      cb(16)
      return 0
    })
  vi.stubGlobal("requestAnimationFrame", raf)
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  return {
    win,
    addEventListener,
    removeEventListener,
    fire: (type: string) => {
      listeners.get(type)?.forEach((fn) => fn())
    },
  }
}

describe("createScrollProgress", () => {
  it("returns 0 on the server (no window)", () => {
    createRoot(() => {
      expect(createScrollProgress()()).toBe(0)
      expect(createScrollProgress(() => null)()).toBe(0)
    })
  })

  it("measures page progress: 0 at top, 1 at bottom", () => {
    stubPageEnv({ scrollY: 500, innerHeight: 1000, scrollHeight: 3000 })
    let progress!: Accessor<number>
    createRoot(() => {
      progress = createScrollProgress()
    })
    // max scroll = 3000 - 1000 = 2000, so 500 / 2000 = 0.25
    expect(progress()).toBeCloseTo(0.25, 5)
  })

  it("updates on scroll events", () => {
    const { win, fire } = stubPageEnv({
      scrollY: 0,
      innerHeight: 1000,
      scrollHeight: 3000,
    })
    let progress!: Accessor<number>
    createRoot(() => {
      progress = createScrollProgress()
    })
    expect(progress()).toBe(0)
    win.scrollY = 1500
    fire("scroll")
    expect(progress()).toBeCloseTo(0.75, 5)
    win.scrollY = 2000
    fire("scroll")
    expect(progress()).toBe(1)
  })

  it("clamps progress to [0, 1]", () => {
    const { win, fire } = stubPageEnv({
      scrollY: 0,
      innerHeight: 1000,
      scrollHeight: 3000,
    })
    let progress!: Accessor<number>
    createRoot(() => {
      progress = createScrollProgress()
    })
    win.scrollY = 99999
    fire("scroll")
    expect(progress()).toBe(1)
  })

  it("returns 0 when the page is not scrollable", () => {
    stubPageEnv({ scrollY: 0, innerHeight: 1000, scrollHeight: 1000 })
    let progress!: Accessor<number>
    createRoot(() => {
      progress = createScrollProgress()
    })
    expect(progress()).toBe(0)
    expect(Number.isNaN(progress())).toBe(false)
  })

  it("throttles rapid scroll events to a single rAF per frame", () => {
    const queue: FrameRequestCallback[] = []
    let id = 0
    const { fire } = stubPageEnv({
      scrollY: 0,
      innerHeight: 1000,
      scrollHeight: 3000,
      raf: (cb) => {
        queue.push(cb)
        return ++id
      },
    })
    createRoot(() => {
      createScrollProgress()
    })
    expect(queue.length).toBe(0)
    fire("scroll")
    fire("scroll")
    fire("scroll")
    expect(queue.length).toBe(1)
  })

  it("measures element traversal: 0 at viewport bottom, 1 at viewport top", () => {
    const rect = { top: 800, height: 400 }
    const el = { getBoundingClientRect: () => rect } as unknown as Element
    const { fire } = stubPageEnv({
      scrollY: 0,
      innerHeight: 800,
      scrollHeight: 3000,
    })
    let progress!: Accessor<number>
    createRoot(() => {
      progress = createScrollProgress(() => el)
    })
    // top edge at viewport bottom -> 0
    expect(progress()).toBe(0)
    // halfway through -> 0.5
    rect.top = 200
    fire("scroll")
    expect(progress()).toBeCloseTo(0.5, 5)
    // bottom edge at viewport top -> 1
    rect.top = -400
    fire("scroll")
    expect(progress()).toBe(1)
  })

  it("ignores a null element without crashing", () => {
    stubPageEnv({ scrollY: 0, innerHeight: 800, scrollHeight: 3000 })
    let progress!: Accessor<number>
    createRoot(() => {
      progress = createScrollProgress(() => null)
    })
    expect(progress()).toBe(0)
  })

  it("removes listeners on cleanup", () => {
    const { removeEventListener } = stubPageEnv({
      scrollY: 0,
      innerHeight: 1000,
      scrollHeight: 3000,
    })
    let dispose!: () => void
    createRoot((d) => {
      createScrollProgress()
      dispose = d
    })
    dispose()
    expect(removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    )
    expect(removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    )
  })
})
