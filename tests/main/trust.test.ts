import { expect, it } from 'vitest';
import { isTrustedDocument } from '../../src/main/ipc/trust';
it('accepts only the registered document, including dev port', () => {
  expect(isTrustedDocument('app://molsino/index.html', 'app://molsino/index.html')).toBe(true);
  expect(isTrustedDocument('app://molsino/other.html', 'app://molsino/index.html')).toBe(false);
  expect(isTrustedDocument('https://molsino/index.html', 'app://molsino/index.html')).toBe(false);
  expect(isTrustedDocument('http://localhost:5174/', 'http://localhost:5173/')).toBe(false);
  expect(isTrustedDocument('invalid', 'app://molsino/index.html')).toBe(false);
});
