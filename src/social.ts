/**
 * Social posting helpers.
 *
 * Cross-posting fails silently in the worst ways: text over a platform limit
 * gets truncated or rejected, media counts get capped, and analytics numbers
 * arrive in a different shape from every network. These are pure functions
 * that validate a draft against documented platform limits and normalize
 * per-platform analytics into one shape. They never post anything.
 */

export type SocialPlatform =
  | "x"
  | "threads"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "bluesky"
  | "mastodon";

export interface PostMedia {
  /** "image" or "video". */
  type: "image" | "video";
  /** Size in bytes, when known. Currently informational; not validated. */
  bytes?: number;
  /** Duration in seconds, for video. */
  durationSec?: number;
}

export interface PostDraft {
  text: string;
  media?: PostMedia[];
  /** Optional link attached to the post. Informational; not validated. */
  link?: string;
}

export interface PostIssue {
  platform: SocialPlatform;
  /** Machine-readable code: "empty_post", "text_too_long", "too_many_media",
   * "video_too_long", or "video_required". */
  code: string;
  message: string;
}

export interface PostValidation {
  valid: boolean;
  issues: PostIssue[];
}

interface PlatformLimits {
  maxChars: number;
  /** Max total attachments. Undefined means the limit varies or is
   * unverified for that platform, so it is not checked. */
  maxMedia?: number;
  /** Max video length in seconds. Undefined means not checked. */
  maxVideoSec?: number;
  /** When true, the draft must include at least one video. */
  requiresVideo?: boolean;
}

/**
 * Documented platform limits as of 2026. Limits change; pass `limits` to
 * validatePost to override any platform, and treat this table as a sane
 * default rather than a contract with the networks.
 */
const PLATFORM_LIMITS: Record<SocialPlatform, PlatformLimits> = {
  // 280 chars standard. 4 images or 1 video per post, 140s max video.
  x: { maxChars: 280, maxMedia: 4, maxVideoSec: 140 },
  // 500 chars, up to 10 media items, 5 min max video.
  threads: { maxChars: 500, maxMedia: 10, maxVideoSec: 300 },
  // 3000 chars. Media caps vary by post type, so they are not checked.
  linkedin: { maxChars: 3000 },
  // 63206 chars. Video and media caps differ between the API and the
  // native app, so they are not checked.
  facebook: { maxChars: 63206 },
  // 2200 chars, 10 items per carousel. Video length caps vary, not checked.
  instagram: { maxChars: 2200, maxMedia: 10 },
  // 4000 chars in the native app (the API enforces 2200). TikTok rejects
  // posts without a video.
  tiktok: { maxChars: 4000, requiresVideo: true },
  // 300 chars, 4 images per post.
  bluesky: { maxChars: 300, maxMedia: 4 },
  // 500 chars default; instances can configure a different limit.
  mastodon: { maxChars: 500, maxMedia: 4 },
};

export interface ValidatePostOptions {
  /** Per-platform overrides merged over the built-in limits table. */
  limits?: Partial<Record<SocialPlatform, Partial<PlatformLimits>>>;
}

/** Count characters as code points so emoji count as one, not two. */
function charCount(text: string): number {
  return Array.from(text).length;
}

/**
 * Validate a draft post against the limits of one or more platforms.
 *
 * Returns `{ valid, issues }`. An issue carries the platform, a
 * machine-readable `code`, and a human-readable `message`, so the UI can
 * show exactly what to fix before the network silently truncates or
 * rejects the post.
 */
export function validatePost(
  draft: PostDraft,
  platforms: SocialPlatform | SocialPlatform[],
  options: ValidatePostOptions = {},
): PostValidation {
  const list = Array.isArray(platforms) ? platforms : [platforms];
  const media = draft.media ?? [];
  const issues: PostIssue[] = [];

  for (const platform of list) {
    const limits: PlatformLimits = {
      ...PLATFORM_LIMITS[platform],
      ...(options.limits?.[platform] ?? {}),
    };
    const textLen = charCount(draft.text);
    const hasText = textLen > 0;
    const hasMedia = media.length > 0;

    if (!hasText && !hasMedia) {
      issues.push({
        platform,
        code: "empty_post",
        message: `${platform}: post has no text and no media.`,
      });
      continue;
    }

    if (textLen > limits.maxChars) {
      issues.push({
        platform,
        code: "text_too_long",
        message: `${platform}: text is ${textLen} characters, the limit is ${limits.maxChars}.`,
      });
    }

    if (limits.maxMedia !== undefined && media.length > limits.maxMedia) {
      issues.push({
        platform,
        code: "too_many_media",
        message: `${platform}: ${media.length} attachments exceed the limit of ${limits.maxMedia}.`,
      });
    }

    if (limits.maxVideoSec !== undefined) {
      for (const item of media) {
        if (
          item.type === "video" &&
          item.durationSec !== undefined &&
          item.durationSec > limits.maxVideoSec
        ) {
          issues.push({
            platform,
            code: "video_too_long",
            message: `${platform}: video is ${item.durationSec}s, the limit is ${limits.maxVideoSec}s.`,
          });
          break;
        }
      }
    }

    if (limits.requiresVideo && !media.some((m) => m.type === "video")) {
      issues.push({
        platform,
        code: "video_required",
        message: `${platform}: posts require at least one video.`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

/** One platform's numbers for a period, using native field names. */
export interface AnalyticsEntry {
  platform: string;
  followers?: number;
  /** Canonical view count. Aliases: impressions, reach. */
  views?: number;
  impressions?: number;
  reach?: number;
  /** Canonical likes. Alias: favorites. */
  likes?: number;
  favorites?: number;
  /** Canonical shares. Aliases: reposts, retweets. */
  shares?: number;
  reposts?: number;
  retweets?: number;
  /** Canonical comments. Alias: replies. */
  comments?: number;
  replies?: number;
  /** Canonical link clicks. Alias: urlClicks. */
  clicks?: number;
  urlClicks?: number;
  /** Number of posts published in the period. */
  posts?: number;
}

export interface NormalizedPlatformAnalytics {
  platform: string;
  followers: number;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  clicks: number;
  posts: number;
  /** (likes + shares + comments) / views, or 0 when views is 0. */
  engagementRate: number;
}

export interface NormalizedAnalytics {
  /** Summed across platforms. The same person may follow on more than one
   * platform, so this is total audience, not unique people. */
  followers: number;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  clicks: number;
  posts: number;
  /** (likes + shares + comments) / views, or 0 when views is 0. */
  engagementRate: number;
  platforms: NormalizedPlatformAnalytics[];
}

function num(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function engagementRate(likes: number, shares: number, comments: number, views: number): number {
  return views > 0 ? (likes + shares + comments) / views : 0;
}

/**
 * Normalize per-platform analytics into one shape.
 *
 * Accepts each network's native field names (impressions, favorites,
 * reposts, replies, urlClicks) and resolves them to canonical fields,
 * then sums across platforms and computes engagement rate. Missing,
 * negative, or non-finite values count as 0.
 */
export function normalizeAnalytics(entries: AnalyticsEntry[]): NormalizedAnalytics {
  const platforms: NormalizedPlatformAnalytics[] = entries.map((entry) => {
    const views = num(entry.views ?? entry.impressions ?? entry.reach);
    const likes = num(entry.likes ?? entry.favorites);
    const shares = num(entry.shares ?? entry.reposts ?? entry.retweets);
    const comments = num(entry.comments ?? entry.replies);
    const clicks = num(entry.clicks ?? entry.urlClicks);
    return {
      platform: entry.platform,
      followers: num(entry.followers),
      views,
      likes,
      shares,
      comments,
      clicks,
      posts: num(entry.posts),
      engagementRate: engagementRate(likes, shares, comments, views),
    };
  });

  const total = (
    pick: (p: NormalizedPlatformAnalytics) => number,
  ): number => platforms.reduce((sum, p) => sum + pick(p), 0);

  const views = total((p) => p.views);
  const likes = total((p) => p.likes);
  const shares = total((p) => p.shares);
  const comments = total((p) => p.comments);

  return {
    followers: total((p) => p.followers),
    views,
    likes,
    shares,
    comments,
    clicks: total((p) => p.clicks),
    posts: total((p) => p.posts),
    engagementRate: engagementRate(likes, shares, comments, views),
    platforms,
  };
}
