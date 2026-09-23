# skill-library

Product skills for the DevDigest app itself — not Claude Code's own
`.claude/skills/` (which configures this CLI session). These `.md` files are
meant to be imported through the DevDigest UI (**Skills → Add → Import**,
either pasting/uploading the `.md` directly or uploading a `.zip` containing a
`SKILL.md`), where they become rows in the `skills` table with `type` set from
the frontmatter, get linked to an agent via the agent's Skills tab, and are
injected into that agent's system prompt at review time. They are not consumed
by this Claude Code session and have no effect until imported.

- `api-contract/` — four skills (`breaking-change`, `response-schema`,
  `semver-discipline`, `deprecation-policy`) for the **API Contract Reviewer**
  agent (see `docs/agent-prompts/api-contract-reviewer.md`).
  `breaking-change.zip` packages `breaking-change.md` as `SKILL.md` to
  exercise the app's `.zip` import path.
- `test-quality/test-quality.md` — a skill for a **Test Quality Reviewer**
  agent: flags happy-path-only test coverage.

## Install as a Claude Code plugin (optional)

The same four API Contract skills are also mirrored at the repo root as
`skills/<name>/SKILL.md` (`breaking-change`, `response-schema`,
`semver-discipline`, `deprecation-policy`) — Claude Code's actual plugin
skill-discovery layout — with `.claude-plugin/plugin.json`
(`version: "1.0.0"`) and `.claude-plugin/marketplace.json` describing the
plugin. This lets the same rules be pulled into a Claude Code session via the
plugin marketplace flow. It's a convenience mirror, not the primary
distribution path — the primary path for DevDigest itself is the in-app
import above, and the `skill-library/api-contract/*.md` files (plus the
`.zip`) remain the source of truth; the `skills/` copies are generated from
them.
