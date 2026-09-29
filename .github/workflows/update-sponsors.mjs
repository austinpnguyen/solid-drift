// Refreshes the sponsor list in README.md between the sponsors markers.
// Reads sponsorships through the GitHub GraphQL API.
// Requires SPONSORS_TOKEN (a classic personal access token with the
// read:user scope) in the environment. Exits quietly when the token is
// missing or the API call fails, so the scheduled run never breaks
// before GitHub Sponsors is wired up.

import { readFileSync, writeFileSync } from "node:fs";

const TOKEN = process.env.SPONSORS_TOKEN;
if (!TOKEN) {
  console.log("SPONSORS_TOKEN is not set, skipping sponsor refresh.");
  process.exit(0);
}

const QUERY = `
  query ($login: String!, $after: String) {
    user(login: $login) {
      sponsors(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { login name avatarUrl url }
      }
    }
  }
`;

async function fetchSponsors() {
  const sponsors = [];
  let after = null;
  for (;;) {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "solid-drift-sponsors-workflow",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { login: "austinpnguyen", after },
      }),
    });
    if (!res.ok) {
      console.log(`GitHub API returned ${res.status}, skipping sponsor refresh.`);
      process.exit(0);
    }
    const data = await res.json();
    const connection = data && data.data && data.data.user && data.data.user.sponsors;
    if (!connection) {
      console.log("Unexpected API response, skipping sponsor refresh.");
      process.exit(0);
    }
    sponsors.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }
  return sponsors;
}

const sponsors = await fetchSponsors();

const cards = sponsors
  .map((s) => {
    const label = String(s.name || s.login).replace(/"/g, "");
    return `<a href="${s.url}"><img src="${s.avatarUrl}&s=96" width="48" height="48" alt="${label}" title="${label}" /></a>`;
  })
  .join("\n");

const start = "<!-- sponsors:start -->";
const end = "<!-- sponsors:end -->";
const path = "README.md";
const readme = readFileSync(path, "utf8");
const startIndex = readme.indexOf(start);
const endIndex = readme.indexOf(end);
if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
  console.log("Sponsor markers not found in README.md.");
  process.exit(1);
}
const next = readme.slice(0, startIndex + start.length) + "\n" + cards + "\n" + readme.slice(endIndex);
if (next !== readme) {
  writeFileSync(path, next);
  console.log(`Updated sponsor list: ${sponsors.length} sponsor(s).`);
} else {
  console.log("Sponsor list is already up to date.");
}
