import { describe, expect, it } from 'vitest';
import { resizeCommandSchema, userCommandSchema } from '../../src/shared/contracts';

const token = '11111111-1111-4111-8111-111111111111';

describe('resize command contract', () => {
  it.each(['nw', 'ne', 'sw', 'se'] as const)('accepts a start command for the %s edge', edge => {
    expect(resizeCommandSchema.parse({ phase: 'start', edge })).toEqual({ phase: 'start', edge });
  });

  it.each(['update', 'end', 'cancel'] as const)('accepts a %s command with a UUID token', phase => {
    expect(resizeCommandSchema.parse({ phase, token })).toEqual({ phase, token });
  });

  it.each([
    { phase: 'start', edge: 'se', token },
    { phase: 'update', token, edge: 'se' },
    { phase: 'end', token, unexpected: true },
    { phase: 'cancel', token, extra: null },
  ])('rejects additional fields: $phase', command => {
    expect(resizeCommandSchema.safeParse(command).success).toBe(false);
  });

  it.each([
    { phase: 'move', token },
    { phase: 'START', edge: 'se' },
    { phase: '', edge: 'se' },
    { edge: 'se' },
  ])('rejects an unknown or missing phase: $phase', command => {
    expect(resizeCommandSchema.safeParse(command).success).toBe(false);
  });

  it.each([
    { phase: 'start', edge: 'n' },
    { phase: 'start', edge: 'SE' },
    { phase: 'start', edge: '' },
    { phase: 'start' },
    { phase: 'start', token },
  ])('rejects an invalid or missing start edge: $edge', command => {
    expect(resizeCommandSchema.safeParse(command).success).toBe(false);
  });

  it.each([
    { phase: 'update', token: 'not-a-uuid' },
    { phase: 'end', token: '' },
    { phase: 'cancel', token: '11111111-1111-1111-1111-111111111111' },
    { phase: 'update' },
    { phase: 'end', edge: 'se' },
  ])('rejects an invalid or missing token: $token', command => {
    expect(resizeCommandSchema.safeParse(command).success).toBe(false);
  });
});

describe('game command contract', () => {
  it('accepts a strict user action with revision and command ID', () => {
    expect(userCommandSchema.parse({
      commandId: token,
      expectedRevision: 3,
      action: { type: 'hit', handId: 'hand-1' },
    })).toEqual({
      commandId: token,
      expectedRevision: 3,
      action: { type: 'hit', handId: 'hand-1' },
    });
  });

  it.each([
    { commandId: token, expectedRevision: -1, action: { type: 'deal' } },
    { commandId: 'not-a-uuid', expectedRevision: 0, action: { type: 'deal' } },
    { commandId: token, expectedRevision: 0, action: { type: 'advanceDealer' } },
    { commandId: token, expectedRevision: 0, action: { type: 'hit' } },
    { commandId: token, expectedRevision: 0, action: { type: 'deal', extra: true } },
  ])('rejects malformed or internal commands', value => {
    expect(userCommandSchema.safeParse(value).success).toBe(false);
  });
});
