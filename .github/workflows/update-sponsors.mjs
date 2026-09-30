// Refreshes the sponsor section in README.md from the GitHub Sponsors API.
// The whole "## Sponsors" section is managed here: it is created when the
// first sponsor appears and removed again if the list ever becomes empty,
// so the README never shows an empty Sponsors section.
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

// Matches the entire Sponsors section, from its heading through the
// closing marker, including the newline that precedes the heading.
const SECTION_RE = /\n## Sponsors\n[\s\S]*?<!-- sponsors:end -->\n/;

function buildSection(sponsors) {
  const cards = sponsors
    .map((s) => {
      const label = String(s.name || s.login).replace(/"/g, "");
      return `<a href="${s.url}"><img src="${s.avatarUrl}&s=96" width="48" height="48" alt="${label}" title="${label}" /></a>`;
    })
    .join("\n");
  return (
    "\n## Sponsors\n" +
    "\n" +
    "Thanks to everyone who keeps this project going.\n" +
    "\n" +
    "<!-- sponsors:start -->\n" +
    "<!-- This list is refreshed automatically by .github/workflows/sponsors.yml. -->\n" +
    cards +
    "\n" +
    "<!-- sponsors:end -->\n"
  );
}

const path = "README.md";
const readme = readFileSync(path, "utf8");
let next;
if (sponsors.length > 0) {
  const section = buildSection(sponsors);
  next = SECTION_RE.test(readme)
    ? readme.replace(SECTION_RE, section)
    : readme.replace("\n## Support the project", section + "\n## Support the project");
  console.log(`Sponsor section written: ${sponsors.length} sponsor(s).`);
} else if (SECTION_RE.test(readme)) {
  next = readme.replace(SECTION_RE, "\n").replace(/\n{3,}/g, "\n\n");
  console.log("No sponsors: removed the Sponsors section.");
} else {
  console.log("No sponsors and no Sponsors section: nothing to do.");
  process.exit(0);
}

if (next !== readme) {
  writeFileSync(path, next);
  console.log("README.md updated.");
} else {
  console.log("Sponsor section is already up to date.");
}
