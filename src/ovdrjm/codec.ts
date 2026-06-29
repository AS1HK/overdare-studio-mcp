/**
 * .ovdrjm 코덱 — 월드 파일 인코딩(평문 JSON, UTF-16LE BOM 또는 UTF-8) 처리.
 * 평문 JSON. UTF-16LE(BOM FF FE) 또는 UTF-8. 압축/암호화 없음.
 */

const BOM = Buffer.from([0xff, 0xfe]);

function isUtf16Le(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe;
}

/** 바이트 → 텍스트. JS TextDecoder("utf-16le")는 선행 BOM(U+FEFF)을 제거하므로 동일하게 맞춤. */
export function decode(buf: Buffer): string {
  if (isUtf16Le(buf)) {
    const s = buf.toString("utf16le");
    return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
  }
  return buf.toString("utf8");
}

/** 텍스트 → 바이트. 원본이 UTF-16LE 였으면 BOM 을 다시 붙인다. */
export function encode(text: string, originalBuf: Buffer): Buffer {
  if (isUtf16Le(originalBuf)) {
    return Buffer.concat([BOM, Buffer.from(text, "utf16le")]);
  }
  return Buffer.from(text, "utf8");
}

/** 문서 직렬화: 2-스페이스 들여쓰기 JSON + 끝에 개행. */
export function serialize(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
