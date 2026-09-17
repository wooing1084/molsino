import { expect, it } from 'vitest';
import { isTrustedDocument, isTrustedIpcSender } from '../../src/main/ipc/trust';
it('accepts only the registered document, including dev port', () => {
  expect(isTrustedDocument('app://molsino/index.html', 'app://molsino/index.html')).toBe(true);
  expect(isTrustedDocument('app://molsino/other.html', 'app://molsino/index.html')).toBe(false);
  expect(isTrustedDocument('https://molsino/index.html', 'app://molsino/index.html')).toBe(false);
  expect(isTrustedDocument('http://localhost:5174/', 'http://localhost:5173/')).toBe(false);
  expect(isTrustedDocument('invalid', 'app://molsino/index.html')).toBe(false);
});

it('accepts only the active overlay main frame as IPC sender', () => {
  const mainFrame = { url: 'app://molsino/index.html' };
  const overlay = { mainFrame };
  const otherContents = { mainFrame };
  const subframe = { url: mainFrame.url };
  const expected = mainFrame.url;
  expect(isTrustedIpcSender(overlay, mainFrame, overlay, expected)).toBe(true);
  expect(isTrustedIpcSender(otherContents, mainFrame, overlay, expected)).toBe(false);
  expect(isTrustedIpcSender(overlay, subframe, overlay, expected)).toBe(false);
  expect(isTrustedIpcSender(overlay, null, overlay, expected)).toBe(false);
  expect(isTrustedIpcSender(overlay, mainFrame, null, expected)).toBe(false);
  mainFrame.url = 'app://molsino/other.html';
  expect(isTrustedIpcSender(overlay, mainFrame, overlay, expected)).toBe(false);
});

it('rejects a matching development document on the wrong port or protocol', () => {
  const frame = { url: 'http://localhost:5174/' };
  const overlay = { mainFrame: frame };
  expect(isTrustedIpcSender(overlay, frame, overlay, 'http://localhost:5173/')).toBe(false);
  frame.url = 'https://localhost:5173/';
  expect(isTrustedIpcSender(overlay, frame, overlay, 'http://localhost:5173/')).toBe(false);
});
