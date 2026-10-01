#!/usr/bin/env python3
"""
Generate llms.txt from SKILL.md.

SKILL.md is the single source of truth. This script extracts the
overview, install/import, API cheat sheet (names only, grouped), and
the hard rules, then writes a condensed llms.txt for AI coding tools.

Run: python3 scripts/generate-llms.py
"""
import re
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL = os.path.join(BASE, "SKILL.md")
OUT = os.path.join(BASE, "llms.txt")

with open(SKILL) as f:
    skill = f.read()

# Extract the overview paragraph (first paragraph after "## 1. Overview")
overview_match = re.search(
    r"## 1\. Overview\n\n(.+?)\n\n", skill, re.DOTALL
)
overview = overview_match.group(1).strip() if overview_match else ""

# Extract API cheat sheet section
cheat_match = re.search(
    r"## 3\. API cheat sheet\n\n(.+?)(?=\n## 4\. Recipes)",
    skill,
    re.DOTALL,
)
cheat = cheat_match.group(1) if cheat_match else ""

# Parse the cheat sheet into groups: **Group** followed by - `name` - desc lines
groups = []
current_group = None
current_items = []
for line in cheat.split("\n"):
    group_match = re.match(r"\*\*(.+?)\*\*", line)
    if group_match:
        if current_group:
            groups.append((current_group, current_items))
        current_group = group_match.group(1)
        current_items = []
    else:
        item_match = re.match(r"- `([^`]+)`", line)
        if item_match and current_group:
            # Take just the name, strip args: createSpring(source, options?) -> createSpring
            name = item_match.group(1).split("(")[0]
            current_items.append(name)
if current_group:
    groups.append((current_group, current_items))

# Extract hard rules from sections 5 and 6 (first bullet of each)
rules = []
for section in ["## 5. SSR and reduced-motion rules", "## 6. Anti-patterns"]:
    sec_match = re.search(
        re.escape(section) + r"\n\n(.+?)(?=\n## |\Z)", skill, re.DOTALL
    )
    if sec_match:
        for line in sec_match.group(1).split("\n"):
            if line.startswith("- "):
                # Take first sentence only for brevity
                text = line[2:].split(". ")[0] + "."
                rules.append(text)

lines = []
lines.append("# solid-drift")
lines.append("")
lines.append("> " + overview)
lines.append("")
lines.append("## Install")
lines.append("")
lines.append("```bash")
lines.append("npm install solid-drift")
lines.append("```")
lines.append("")
lines.append("```ts")
lines.append('import { createSpring } from "solid-drift";')
lines.append("```")
lines.append("")
lines.append(
    "Import from the package root only. Never deep-import from `solid-drift/dist`."
)
lines.append("")
lines.append("## API")
lines.append("")
lines.append(
    "Signal-native: primitives return signals you bind with `style={{ transform: x() }}`. "
    "One shared requestAnimationFrame clock drives everything. SSR-safe. "
    "Respects `prefers-reduced-motion`."
)
lines.append("")

for group, items in groups:
    lines.append(f"### {group}")
    lines.append("")
    # Comma-separated names, wrapped for readability
    lines.append(", ".join(f"`{name}`" for name in items))
    lines.append("")

lines.append("## Rules")
lines.append("")
for rule in rules:
    lines.append(f"- {rule}")
lines.append("")
lines.append("## Full docs")
lines.append("")
lines.append(
    "- SKILL.md in this repo: full API descriptions, recipes, DriftSpec format."
)
lines.append("- README.md: per-primitive docs with examples.")
lines.append("- docs/: family guides, recipes, migration, comparison.")

with open(OUT, "w") as f:
    f.write("\n".join(lines))

print(f"Generated {OUT} ({len(lines)} lines, {len(groups)} API groups)")

# Also copy to the playground's public dir so it ships on GitHub Pages
# at https://austinpnguyen.github.io/solid-drift/llms.txt
playground_public = os.path.join(BASE, "playground", "public")
os.makedirs(playground_public, exist_ok=True)
playground_llms = os.path.join(playground_public, "llms.txt")
with open(OUT) as src, open(playground_llms, "w") as dst:
    dst.write(src.read())
print(f"Copied to {playground_llms}")
