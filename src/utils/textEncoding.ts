/**
 * Recovers UTF-8 text that was mis-decoded as Latin-1 somewhere in the pipeline.
 * Symptom: characters like `·` (U+00B7) show up as `Â·`. That happens when the
 * server writes UTF-8 bytes but a downstream reader interpreted them as
 * Windows-1252 / Latin-1 and re-encoded them as UTF-8.
 *
 * Detection is heuristic — we only re-decode when the string contains
 * lone-`Â` sequences that would appear in genuine mojibake but not in
 * legitimate text. If the round-trip fails or the result looks worse than
 * the input, we return the original untouched.
 */
export const decodeMojibake = (input: string): string => {
  if (!input) return input;
  // Cheap heuristic: only try when we see the classic "Â" prefix pattern.
  if (!/Â[\x80-\xBF]/.test(input)) return input;
  try {
    const bytes = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      if (code > 0xff) return input; // not Latin-1-shaped; give up
      bytes[i] = code;
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded;
  } catch {
    return input;
  }
};
