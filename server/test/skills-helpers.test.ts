import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  parseSkillMarkdown,
  parseSkillArchive,
  pickSkillFromArchive,
  isBodyChange,
  resolveSkillBodies,
} from '../src/modules/skills/helpers.js';
import { ValidationError } from '../src/platform/errors.js';

/**
 * Hermetic (no DB) coverage for the skills module's pure helpers: markdown
 * frontmatter/heading/filename fallbacks, the zip skill-core selection policy
 * (SKILL.md wins, ambiguity throws, empty throws), the trust-rule wrapping,
 * and the body-change-bump predicate.
 */
describe('parseSkillMarkdown', () => {
  it('takes name/description/type from frontmatter when present', () => {
    const text = `---
name: No Secrets
description: Never commit a live key.
type: security
---
# No secrets

Flag any hardcoded secret.`;
    const preview = parseSkillMarkdown('no-secrets.md', text);
    expect(preview.name).toBe('No Secrets');
    expect(preview.description).toBe('Never commit a live key.');
    expect(preview.type).toBe('security');
    expect(preview.body).toBe(text);
    expect(preview.source_filename).toBe('no-secrets.md');
    expect(preview.ignored_entries).toEqual([]);
    expect(preview.executable_entries).toEqual([]);
  });

  it('falls back to the first # heading and first paragraph when no frontmatter', () => {
    const text = `# Uncovered branches

Flag every conditional branch touched by this diff that has no test.

## How to report
Cite the file:line.`;
    const preview = parseSkillMarkdown('uncovered-branches.md', text);
    expect(preview.name).toBe('Uncovered branches');
    expect(preview.description).toBe(
      'Flag every conditional branch touched by this diff that has no test.',
    );
    expect(preview.type).toBe('custom');
  });

  it('falls back to the filename stem when there is no frontmatter and no heading', () => {
    const text = 'Just a plain paragraph of instructions, no heading at all.';
    const preview = parseSkillMarkdown('plain-notes.md', text);
    expect(preview.name).toBe('plain-notes');
    expect(preview.description).toBe(text);
  });

  it('defaults type to custom when frontmatter type is invalid', () => {
    const text = `---
name: Weird
type: not-a-real-type
---
Body text.`;
    const preview = parseSkillMarkdown('weird.md', text);
    expect(preview.type).toBe('custom');
  });
});

describe('pickSkillFromArchive', () => {
  it('prefers SKILL.md at any depth over other markdown candidates', () => {
    const entries = [
      { path: 'notes.md', text: 'not the one' },
      { path: 'nested/deep/SKILL.md', text: 'the real skill' },
    ];
    const chosen = pickSkillFromArchive(entries);
    expect(chosen.path).toBe('nested/deep/SKILL.md');
    expect(chosen.text).toBe('the real skill');
  });

  it('throws ValidationError when multiple equally-shallow candidates exist and no SKILL.md', () => {
    const entries = [
      { path: 'a.md', text: 'a' },
      { path: 'b.md', text: 'b' },
    ];
    expect(() => pickSkillFromArchive(entries)).toThrow(ValidationError);
  });

  it('throws ValidationError when there are no markdown entries at all', () => {
    expect(() => pickSkillFromArchive([])).toThrow(ValidationError);
  });

  it('picks the single shallowest markdown file when there is no SKILL.md', () => {
    const entries = [
      { path: 'deep/nested/notes.md', text: 'deep' },
      { path: 'core.md', text: 'shallow' },
    ];
    const chosen = pickSkillFromArchive(entries);
    expect(chosen.path).toBe('core.md');
  });
});

describe('parseSkillArchive', () => {
  it('picks SKILL.md, ignores everything else, and flags executable entries', () => {
    const zipped = zipSync({
      'SKILL.md': strToU8('# API contract gate\n\nFlag breaking changes.'),
      'install.sh': strToU8('# harmless comment, never executed'),
      'notes.txt': strToU8('some notes'),
    });
    const preview = parseSkillArchive('api-contract-gate.zip', zipped);
    expect(preview.name).toBe('API contract gate');
    expect(preview.body).toContain('Flag breaking changes.');
    expect(preview.source_filename).toBe('api-contract-gate.zip');
    expect(preview.ignored_entries.sort()).toEqual(['install.sh', 'notes.txt'].sort());
    expect(preview.executable_entries).toEqual(['install.sh']);
  });

  it('throws ValidationError for an archive with no markdown at all', () => {
    const zipped = zipSync({ 'install.sh': strToU8('# nope') });
    expect(() => parseSkillArchive('empty.zip', zipped)).toThrow(ValidationError);
  });

  it('throws ValidationError when ambiguous (two non-SKILL.md candidates at the same depth)', () => {
    const zipped = zipSync({
      'a.md': strToU8('# A'),
      'b.md': strToU8('# B'),
    });
    expect(() => parseSkillArchive('ambiguous.zip', zipped)).toThrow(ValidationError);
  });
});

describe('resolveSkillBodies', () => {
  it('passes a manual skill body through raw', () => {
    const [body] = resolveSkillBodies([
      { skill: { name: 'no-secrets', body: 'Flag any hardcoded secret.', source: 'manual' } },
    ]);
    expect(body).toBe('Flag any hardcoded secret.');
  });

  it('wraps an imported_url skill body with <untrusted>, preserving the original text', () => {
    const [body] = resolveSkillBodies([
      {
        skill: {
          name: 'api-contract-gate',
          body: 'Flag breaking route changes.',
          source: 'imported_url',
        },
      },
    ]);
    expect(body).toContain('<untrusted');
    expect(body).toContain('Flag breaking route changes.');
  });

  it('wraps a community skill body the same way', () => {
    const [body] = resolveSkillBodies([
      { skill: { name: 'community-thing', body: 'Some rule.', source: 'community' } },
    ]);
    expect(body).toContain('<untrusted');
    expect(body).toContain('Some rule.');
  });

  it('applies the trust rule per-item, in the given order', () => {
    const bodies = resolveSkillBodies([
      { skill: { name: 'a', body: 'raw body', source: 'manual' } },
      { skill: { name: 'b', body: 'untrusted body', source: 'imported_url' } },
    ]);
    expect(bodies[0]).toBe('raw body');
    expect(bodies[1]).toContain('<untrusted');
    expect(bodies[1]).toContain('untrusted body');
  });
});

describe('isBodyChange', () => {
  const existing = { body: 'Original body.' };

  it('is true when the patch changes body', () => {
    expect(isBodyChange(existing, { body: 'New body.' })).toBe(true);
  });

  it('is false when the patch body equals the existing body', () => {
    expect(isBodyChange(existing, { body: 'Original body.' })).toBe(false);
  });

  it('is false when body is not present on the patch at all', () => {
    expect(isBodyChange(existing, {})).toBe(false);
  });
});
