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
