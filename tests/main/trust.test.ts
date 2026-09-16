import { expect, it } from 'vitest';
import { isTrustedDocument } from '../../src/main/ipc/trust';
it('accepts only the registered document, including dev port', () => {
  expect(isTrustedDocument('app://blackjack/index.html', 'app://blackjack/index.html')).toBe(true);
  expect(isTrustedDocument('app://blackjack/other.html', 'app://blackjack/index.html')).toBe(false);
  expect(isTrustedDocument('https://blackjack/index.html', 'app://blackjack/index.html')).toBe(false);
  expect(isTrustedDocument('http://localhost:5174/', 'http://localhost:5173/')).toBe(false);
  expect(isTrustedDocument('invalid', 'app://blackjack/index.html')).toBe(false);
});
