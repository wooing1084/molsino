export type BlackjackErrorCode =
  | 'INVALID_ACTION'
  | 'INVALID_AMOUNT'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_HAND'
  | 'INTEGRITY_ERROR';

export class BlackjackError extends Error {
  public constructor(
    public readonly code: BlackjackErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BlackjackError';
  }
}

export function assertSafeCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BlackjackError('INVALID_AMOUNT', `${label} must be a non-negative safe integer`);
  }
}

export function safeAdd(left: number, right: number, label: string): number {
  assertSafeCents(left, label);
  assertSafeCents(right, label);
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new BlackjackError('INVALID_AMOUNT', `${label} exceeds the safe integer range`);
  }
  return result;
}

export function safeMultiply(value: number, multiplier: number, label: string): number {
  assertSafeCents(value, label);
  if (!Number.isSafeInteger(multiplier) || multiplier < 0) {
    throw new BlackjackError('INVALID_AMOUNT', `${label} multiplier is invalid`);
  }
  const result = value * multiplier;
  if (!Number.isSafeInteger(result)) {
    throw new BlackjackError('INVALID_AMOUNT', `${label} exceeds the safe integer range`);
  }
  return result;
}
