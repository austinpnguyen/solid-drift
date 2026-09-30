# Social

[Back to README](https://github.com/austinpnguyen/solid-drift#readme)


Use when validating posts or normalizing analytics across platforms.

### Social posting helpers

```tsx
import { validatePost, normalizeAnalytics } from "solid-drift";

const check = validatePost(
  { text: draft, media: [{ type: "image" }] },
  ["x", "threads", "linkedin"],
);
if (!check.valid) {
  // check.issues: [{ platform, code, message }]: show what to fix
  // before the network silently truncates or rejects the post.
}

const report = normalizeAnalytics([
  { platform: "x", impressions: 1200, favorites: 40, reposts: 6 },
  { platform: "threads", views: 800, likes: 30, replies: 4 },
]);
// report: { followers, views, likes, shares, comments, clicks,
//           posts, engagementRate, platforms: [...] }
```

`validatePost(draft, platforms, options?)`: pure function that checks a post draft (`{ text, media?, link? }`) against documented platform limits: X 280 chars / 4 attachments / 140s video, Threads 500 chars / 10 media / 300s video, LinkedIn 3000 chars, Facebook 63206 chars, Instagram 2200 chars / 10 carousel items, TikTok 4000 chars (video required), Bluesky 300 chars / 4 images, Mastodon 500 chars / 4 media. Returns `{ valid, issues }` with machine-readable issue codes (`empty_post`, `text_too_long`, `too_many_media`, `video_too_long`, `video_required`). Character counts use code points so emoji count as one. Limits that vary by post type or are unverified are not checked; pass `limits` overrides to adjust any platform. Never posts anything. [Try it](https://austinpnguyen.github.io/solid-drift/#/social/validatePost)

`normalizeAnalytics(entries)`: pure function that takes one entry per platform using native field names (impressions, favorites, reposts, retweets, replies, urlClicks) and returns canonical totals plus a per-platform breakdown. `engagementRate` is `(likes + shares + comments) / views`, 0 when views is 0. Missing, negative, or non-finite values count as 0. Followers are summed across platforms (total audience, not unique people).
