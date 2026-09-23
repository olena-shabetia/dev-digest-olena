# L02 — Skills (client)

Package-local UI contract. See the cross-package spec `../../specs/L02-skills.md`
for the feature's full scope, the trust rule, and the byte-identical-prompt
invariant; this file covers implementation decisions specific to the client
that a future change to this area needs to preserve.

## `/skills` mirrors the agent editor's master-detail shell

`client/src/app/skills/page.tsx` is a thin Server Component rendering
`SkillsListView`, the same shape as `/agents`: a fixed left rail (the skill
list, `SkillCard` per row with type/source badges and an agent-count line) and
a `flex: 1` right pane at `height: calc(100vh - 52px)`, using the same `Tabs`
primitive as the agent editor's own header (icon, name, type badge, `v{n}`
chip, Enabled toggle). No CSS modules, no Tailwind — colocated `styles.ts` of
`CSSProperties` over `var(--token)`s, primitives from `@devdigest/ui` only
(there is no `Table` or `Tooltip` primitive in this client; don't add one for
this feature).

## The 5-tab skill editor, and which tab is a placeholder

`SkillEditor` renders five tabs: **Config · Preview · Evals · Stats ·
Versions**.

- **Config** — name, description (with the directive-interface hint, see
  below), type (`SelectInput` over `SkillType`), and the body editor.
- **Preview** — `<Markdown>{body}</Markdown>` plus the untrusted-source notice
  (`skills.json`'s `preview.untrustedNotice`/`untrustedBadge`) shown when
  `source !== 'manual'`.
- **Evals — a placeholder.** L06 (the eval pipeline) isn't built, so this tab
  renders the app's existing not-yet-built-screen pattern
  (`shell.featurePlaceholder.defaultBody`, "This screen is owned by
  {owner}…"), matching the agent editor's own placeholder Evals tab. The
  header's "Run on evals" button is **not rendered** on this tab for the same
  reason — there is nothing to run it against yet. `eval_cases.owner_kind =
  'skill'` already exists in the schema but has no consuming pipeline.
- **Stats** — real-data-only; see the dedicated section below.
- **Versions** — list + Diff + Restore; see below.

## The drag-and-drop reorder contract (agent editor's Skills tab)

The agent editor's `SkillsTab` (`_components/AgentEditor/_components/SkillsTab/`)
lists every workspace skill with a checkbox for attached/detached, a filter
input, and linked skills ordered first, using `agents.skills.*` copy including
`orderHint` ("Order matters — earlier skills appear earlier in the assembled
prompt").

Reordering uses real drag-and-drop, **`@dnd-kit/core` + `@dnd-kit/sortable`**,
not up/down buttons. This replaced an earlier up/down-button plan: the revised
mockup shows a drag handle (`☰`, "Drag to reorder") per row, and up/down
buttons don't match that affordance — `@dnd-kit` was added specifically to
implement the handle-driven drag the mockup calls for, not the reverse (the
mockup wasn't redesigned around a library choice).

- `DndContext` + `SortableContext` wrap the row list; each row is a
  `useSortable` item with the **handle**, not the row, as the drag listener
  target — clicking the row's own checkbox must not start a drag.
- On `onDragEnd`, the local array is reordered and the tab fires the existing
  `POST /agents/:id/skills { skill_ids: [...] }` — **the same request shape
  the feature already had before drag-and-drop existed.** No server change:
  the endpoint already assigns `order = index` from the array's position
  (`agents/repository.ts`). Drag-and-drop only changes how the client produces
  that array, not the wire contract.
- The mutation reorders optimistically (`onMutate` applies the new order
  immediately, rolled back on error) so the drag feels instant instead of
  waiting on the round trip.
- Reads are unchanged: `GET /agents/:id/skills` returns `AgentSkillLink[]`
  (ids + order only); the tab joins it against `useSkills()` client-side.

`AgentCard`'s `skillCount` prop (previously dead, only ever passed by its own
test) is wired from these links so the Agents grid shows "N skills."

**Promotion rule:** the skill list-item and markdown-preview pieces are shared
between `/skills` and this tab. Per the existing "promote on second consumer"
convention (`client/INSIGHTS.md`, 2026-09-18 — `findings-popover`,
`run-cost-badge`, `severity-filter-bar` were all promoted at this same
trigger point, not preemptively), they move to `client/src/components/skill-*/`
in the change that adds this tab (the second caller), not speculatively when
`/skills` was first built.

## The body editor widget — plain textarea, not a code editor

The mockup shows a code-editor-style box (filename header, an "unsaved" badge,
line numbers, a live token count), but this client has no syntax-highlighting
dependency anywhere (no CodeMirror/Monaco). This is a deliberate scope cut:
the body editor is built as a plain, dependency-free component, not a real
code editor.

- New component `client/src/components/line-numbered-editor/` (first caller is
  the skill body editor; promote-on-second-caller still applies if the agent
  Config tab's system-prompt `Textarea` ever wants the same chrome).
- A bordered container: header row (`{slug}.md` + a conditional "unsaved"
  `Badge` when `draftBody !== skill.body`), footer-corner token count
  (`Math.ceil(draftBody.length / 4)`, the same rough per-4-chars estimate used
  elsewhere in this client — a plain count here, not "N / M", since the body
  editor has no fixed budget denominator the way the agent Config tab's system
  prompt does).
- Line numbers: a `<pre>` gutter (`Array.from({length: lineCount})`) next to a
  plain `<textarea>`, kept in sync by mirroring the textarea's `onScroll`
  `scrollTop` onto the gutter. Monospace font throughout. No syntax
  highlighting — headings and bullets render as plain text, unlike the
  mockup's colored markdown preview.
- An optional "What changed? (optional)" `TextInput` next to Save, feeding
  `change_note` on the `PUT /skills/:id` call (`server/specs/L02-skills.api.md`).

## The description-as-interface authoring hint

The Config tab's description field carries a `FormField` hint written as an
instruction to the author, not documentation about the field: e.g. *"Write it
as an instruction to the reviewer: 'Flag tests that assert only the happy
path.' This line is what an agent sees first."* This mirrors the cross-package
spec's framing that a skill's `description` doubles as the interface the
reviewing agent reads, not human-facing documentation about the skill.

## Config-tab token-budget note (agent editor, not the skill editor)

The agent editor's Config tab renders a live token counter next to "System
prompt" (`412 / 8,000 tokens`) and the already-written
`agents.config.systemPromptHint` caption ("Loaded as the static system
message. Skills are appended below it.") — previously written but never
rendered by `ConfigTab.tsx`. The counter is a rough client-side estimate
(`Math.ceil(text.length / 4)`, labeled as approximate) against a fixed
`SYSTEM_PROMPT_TOKEN_BUDGET = 8000` constant in `ConfigTab/constants.ts`.

**`8,000` is a soft authoring budget for the prompt text itself, not the
model's context window.** `ModelInfo.contextLength` (`model-label.ts`) is a
separate, much larger number describing what the selected model actually
accepts — the two must not be confused or wired to the same constant. No new
dependency: `js-tiktoken` is server-only, and pulling it into the client
bundle for a cosmetic counter isn't proportionate to the estimate's accuracy
needs. This addition is purely additive to the existing Config form — no new
route, no new hook.

## StatsTab (skill editor) — real data only, a narrower cut than `AgentStats`

Same "real data only" principle as the agent editor's own Stats tab, but a
**different and smaller** real-data boundary — see
`server/specs/L02-skills.api.md` for why: nothing records which skill was
active on a given run, so per-skill pull frequency, accept rate, and findings
can't be computed at all, not even approximately.

- **Used by** — a plain count from `agent_skills`.
- **Agents using this skill** — the list, each with an "Open" link to
  `/agents/:id`, from the same join.
- Pull frequency, accept rate, findings (30D), and the findings-by-category
  donut the mockup shows are **not rendered** — not stubbed as zero, simply
  absent, matching the "if there's nothing to show, don't add it" rule.
- `SkillCard`'s list-row summary line is cut the same way: only **"N agents"**
  renders, not the mockup's "N agents · X% pull · Y% accept."

Do not confuse this with the agent editor's Stats tab (`_components/AgentEditor/_components/StatsTab/`),
which implements the full, already-specified `AgentStats` contract — runs,
cost, duration, accept rate, findings-by-severity, findings-by-category, and a
run-history table, all real. That tab is not a placeholder and is not
cut down; this skill-level tab is the one that's deliberately small.

## VersionsTab

Reads `GET /skills/:id/versions` (newest first), renders each row's `version`,
`created_at`, and `change_note` (omitted, not blanked with a placeholder, when
null), tagging the highest version "Current."

- **Restore** calls the existing `PUT /skills/:id { body }` with that version's
  body — this creates a *new* version with the old content, consistent with
  the versioning rule (`server/specs/L02-skills.api.md`); it never rewrites
  history in place, the same semantics as `git revert`.
- **Diff** renders a line-level diff between two version bodies using the
  small `diff` npm package's `diffLines`, rather than hand-rolling an LCS. The
  existing `DiffViewer` in this client is a git-hunk renderer built for PR code
  diffs — a different shape, not reusable here.

## Data layer

`client/src/lib/hooks/skills.ts` copies `hooks/agents.ts` verbatim in shape:
`useSkills()` → `["skills"]`, `useSkill(id)` → `["skill", id]` with
`enabled: !!id`, `useCreateSkill`, `useUpdateSkill` (invalidates the list and
`setQueryData(["skill", id])`), `useDeleteSkill` (`removeQueries`),
`useImportSkillPreview`, `useSkillVersions(id)`, `useSkillStats(id)`. All
strings render through `next-intl`; domain types come from `@devdigest/shared`.

## The multipart upload escape hatch — `api.upload`

`apiFetch` (`client/src/lib/api.ts`) always sets a JSON content-type when a
body exists, and this client has zero bare `fetch()` calls anywhere. The
import-preview flow needs to send a real file as `multipart/form-data`, which
a JSON-only path cannot express. `api.upload(path, file)` is added as **the
one deliberate exception**: it sends a `FormData` body and deliberately omits
a `Content-Type` header so the browser sets its own `multipart/form-data;
boundary=...` value — a header `apiFetch` would otherwise force to `application/json`.

This is a narrow, documented addition to `api.ts`, not a bare `fetch` call in
a component — the import drawer (`ImportSkillDrawer`) still goes through
`useImportSkillPreview`, which calls `api.upload` internally, keeping "every
request goes through `src/lib/api.ts`" true even though this one request isn't
JSON.
