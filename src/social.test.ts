import { describe, it, expect } from "vitest";
import {
  validatePost,
  normalizeAnalytics,
  type PostDraft,
} from "./social.js";

describe("validatePost", () => {
  const short: PostDraft = { text: "Hello world" };

  it("passes a short draft on strict and lenient platforms", () => {
    const result = validatePost(short, ["x", "threads", "linkedin"]);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("accepts a single platform string", () => {
    expect(validatePost(short, "x").valid).toBe(true);
  });

  it("flags text over the X limit but passes Threads", () => {
    const draft: PostDraft = { text: "a".repeat(281) };
    const result = validatePost(draft, ["x", "threads"]);
    expect(result.valid).toBe(false);
    const xIssue = result.issues.find((i) => i.platform === "x");
    expect(xIssue?.code).toBe("text_too_long");
    expect(xIssue?.message).toContain("280");
    expect(result.issues.some((i) => i.platform === "threads")).toBe(false);
  });

  it("flags an empty post per platform", () => {
    const result = validatePost({ text: "" }, ["x", "bluesky"]);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].code).toBe("empty_post");
  });

  it("treats a media-only draft as non-empty", () => {
    const draft: PostDraft = {
      text: "",
      media: [{ type: "image" }],
    };
    expect(validatePost(draft, "instagram").valid).toBe(true);
  });

  it("flags too many attachments for X", () => {
    const draft: PostDraft = {
      text: "photos",
      media: [
        { type: "image" },
        { type: "image" },
        { type: "image" },
        { type: "image" },
        { type: "image" },
      ],
    };
    const result = validatePost(draft, "x");
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe("too_many_media");
  });

  it("flags a video over the Threads limit", () => {
    const draft: PostDraft = {
      text: "watch",
      media: [{ type: "video", durationSec: 400 }],
    };
    const result = validatePost(draft, "threads");
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe("video_too_long");
  });

  it("ignores video duration when unknown", () => {
    const draft: PostDraft = {
      text: "watch",
      media: [{ type: "video" }],
    };
    expect(validatePost(draft, "threads").valid).toBe(true);
  });

  it("requires a video on TikTok", () => {
    const result = validatePost(
      { text: "no video here", media: [{ type: "image" }] },
      "tiktok",
    );
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe("video_required");
  });

  it("counts emoji as one character", () => {
    // 280 emoji: fine for X by code points, over by UTF-16 units.
    const draft: PostDraft = { text: "😀".repeat(280) };
    expect(validatePost(draft, "x").valid).toBe(true);
    expect(validatePost({ text: "😀".repeat(281) }, "x").valid).toBe(false);
  });

  it("respects per-platform limit overrides", () => {
    const draft: PostDraft = { text: "a".repeat(300) };
    const strict = validatePost(draft, "x");
    expect(strict.valid).toBe(false);
    const overridden = validatePost(draft, "x", {
      limits: { x: { maxChars: 500 } },
    });
    expect(overridden.valid).toBe(true);
  });
});

describe("normalizeAnalytics", () => {
  it("sums metrics across platforms", () => {
    const result = normalizeAnalytics([
      { platform: "x", followers: 100, views: 1000, likes: 50, shares: 10, comments: 5 },
      { platform: "threads", followers: 200, views: 2000, likes: 100, shares: 20, comments: 10 },
    ]);
    expect(result.followers).toBe(300);
    expect(result.views).toBe(3000);
    expect(result.likes).toBe(150);
    expect(result.shares).toBe(30);
    expect(result.comments).toBe(15);
    expect(result.engagementRate).toBeCloseTo(195 / 3000);
  });

  it("resolves native field aliases", () => {
    const result = normalizeAnalytics([
      {
        platform: "x",
        impressions: 500,
        favorites: 25,
        reposts: 5,
        replies: 2,
        urlClicks: 7,
        posts: 3,
      },
    ]);
    expect(result.views).toBe(500);
    expect(result.likes).toBe(25);
    expect(result.shares).toBe(5);
    expect(result.comments).toBe(2);
    expect(result.clicks).toBe(7);
    expect(result.posts).toBe(3);
  });

  it("prefers canonical fields over aliases", () => {
    const result = normalizeAnalytics([
      { platform: "x", views: 100, impressions: 999 },
    ]);
    expect(result.views).toBe(100);
  });

  it("returns 0 engagement rate when there are no views", () => {
    const result = normalizeAnalytics([{ platform: "x", likes: 10 }]);
    expect(result.engagementRate).toBe(0);
    expect(result.platforms[0].engagementRate).toBe(0);
  });

  it("includes a per-platform breakdown", () => {
    const result = normalizeAnalytics([
      { platform: "threads", views: 100, likes: 10 },
    ]);
    expect(result.platforms).toHaveLength(1);
    expect(result.platforms[0]).toMatchObject({
      platform: "threads",
      views: 100,
      likes: 10,
      engagementRate: 0.1,
    });
  });

  it("treats missing, negative, and non-finite values as 0", () => {
    const result = normalizeAnalytics([
      { platform: "x", views: -5, likes: Number.NaN, shares: Infinity },
    ]);
    expect(result.views).toBe(0);
    expect(result.likes).toBe(0);
    expect(result.shares).toBe(0);
  });

  it("normalizes an empty input to zeros", () => {
    const result = normalizeAnalytics([]);
    expect(result).toMatchObject({
      followers: 0,
      views: 0,
      engagementRate: 0,
      platforms: [],
    });
  });
});
