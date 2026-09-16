/** Only the exact application document may issue IPC or navigate. */
export function isTrustedDocument(candidate: string, expected: string): boolean {
  try {
    const actual = new URL(candidate);
    const allowed = new URL(expected);
    return actual.protocol === allowed.protocol && actual.host === allowed.host &&
      actual.pathname === allowed.pathname && actual.search === allowed.search &&
      actual.username === '' && actual.password === '';
  } catch { return false; }
}

/** Match the registered webContents and its current top-level frame. */
export function isTrustedIpcSender(
  event: { sender: unknown; senderFrame: { url: string } | null },
  registered: { mainFrame: { url: string } | null } | undefined,
  documentURL: string,
): boolean {
  return Boolean(registered && event.sender === registered && event.senderFrame &&
    event.senderFrame === registered.mainFrame &&
    isTrustedDocument(event.senderFrame.url, documentURL));
}
