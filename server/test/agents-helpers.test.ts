import { describe, it, expect } from 'vitest';
import { toAgentVersionDto } from '../src/modules/agents/helpers.js';
import { ValidationError } from '../src/platform/errors.js';

/**
 * Unit coverage for the one manual `.parse` left in `server/` after Wave 1
 * (contracts): `toAgentVersionDto` runs the persisted `config_json` jsonb
 * through `AgentVersionConfig` because a snapshot from an older config shape
 * could have drifted. Wave 1.4 switched it from a raw `AgentVersionConfig.parse`
 * (a bare ZodError, caught only by app.ts's shape-based duck-typing branch) to
 * an explicit `ValidationError` (422, `validation_error`) — this locks that in.
 */
describe('toAgentVersionDto', () => {
  const validRow = {
    agentId: 'a1',
    version: 1,
    configJson: {
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'Review the diff.',
      strategy: 'single-pass',
      ci_fail_on: 'critical',
      repo_intel: true,
      skills: [],
    },
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as never;

  it('parses a well-formed snapshot into the AgentVersion DTO', () => {
    const dto = toAgentVersionDto(validRow);
    expect(dto.agent_id).toBe('a1');
    expect(dto.version).toBe(1);
    expect(dto.config.model).toBe('gpt-4.1');
    expect(dto.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('throws ValidationError (not a bare ZodError) on a malformed snapshot', () => {
    const malformedRow = { ...validRow, configJson: { provider: 'openai' } } as never; // missing required fields
    expect(() => toAgentVersionDto(malformedRow)).toThrow(ValidationError);
    try {
      toAgentVersionDto(malformedRow);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).code).toBe('validation_error');
      expect((err as ValidationError).statusCode).toBe(422);
      expect((err as ValidationError).details).toBeDefined();
    }
  });
});
