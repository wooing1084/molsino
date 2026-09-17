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

interface FrameIdentity { readonly url: string; }
interface ContentsIdentity { readonly mainFrame: FrameIdentity | null; }

/** IPC requires the exact overlay contents and its current main frame, not merely a matching URL. */
export function isTrustedIpcSender(
  sender: unknown,
  senderFrame: FrameIdentity | null | undefined,
  overlayContents: ContentsIdentity | null | undefined,
  expectedDocumentURL: string,
): boolean {
  return Boolean(overlayContents && sender === overlayContents && senderFrame &&
    senderFrame === overlayContents.mainFrame && isTrustedDocument(senderFrame.url, expectedDocumentURL));
}
