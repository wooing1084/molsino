import { expect, it } from 'vitest';
import { isTrustedDocument, isTrustedIpcSender } from '../../src/main/ipc/trust';
it('accepts only the registered document, including dev port', () => {
  expect(isTrustedDocument('app://molsino/index.html', 'app://molsino/index.html')).toBe(true);
  expect(isTrustedDocument('app://molsino/other.html', 'app://molsino/index.html')).toBe(false);
  expect(isTrustedDocument('https://molsino/index.html', 'app://molsino/index.html')).toBe(false);
  expect(isTrustedDocument('http://localhost:5174/', 'http://localhost:5173/')).toBe(false);
  expect(isTrustedDocument('invalid', 'app://molsino/index.html')).toBe(false);
});

it('allows only the registered top-level frame at the application URL', () => {
  const mainFrame = { url: 'app://molsino/index.html' };
  const registered = { mainFrame };
  const event = { sender: registered, senderFrame: mainFrame };
  const expected = mainFrame.url;

  expect(isTrustedIpcSender(event, registered, expected)).toBe(true);
  expect(isTrustedIpcSender({ ...event, sender: {} }, registered, expected)).toBe(false);
  expect(isTrustedIpcSender({ ...event, senderFrame: { url: expected } }, registered, expected)).toBe(false);
  expect(isTrustedIpcSender({ ...event, senderFrame: null }, registered, expected)).toBe(false);
  expect(isTrustedIpcSender(event, undefined, expected)).toBe(false);
  mainFrame.url = 'app://molsino/other.html';
  expect(isTrustedIpcSender(event, registered, expected)).toBe(false);
});
