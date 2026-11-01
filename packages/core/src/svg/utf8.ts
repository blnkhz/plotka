/** Minimal UTF-8 decoder so core doesn't depend on TextDecoder (a DOM/Node global). */
export function decodeUtf8(bytes: Uint8Array): string {
  let i = 0;
  // Skip BOM
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  const parts: string[] = [];
  let codes: number[] = [];
  const n = bytes.length;
  while (i < n) {
    const b = bytes[i++]!;
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b >= 0xc0 && b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++]! & 0x3f);
    else if (b >= 0xe0 && b < 0xf0)
      cp = ((b & 0x0f) << 12) | ((bytes[i++]! & 0x3f) << 6) | (bytes[i++]! & 0x3f);
    else if (b >= 0xf0)
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i++]! & 0x3f) << 12) |
        ((bytes[i++]! & 0x3f) << 6) |
        (bytes[i++]! & 0x3f);
    else cp = 0xfffd;
    codes.push(cp);
    if (codes.length >= 8192) {
      parts.push(String.fromCodePoint(...codes));
      codes = [];
    }
  }
  parts.push(String.fromCodePoint(...codes));
  return parts.join('');
}
