import { platform } from "node:os";

/**
 * 스크립트 소스 정규화 — Studio 가 스크립트 노드를 받아들이는 형식에 맞춘다.
 * 적용 순서: 선행 공백을 탭으로 정돈한 뒤 줄끝을 정규화한다.
 */

/** 선행 4-스페이스 그룹을 탭으로 변환. 기존 탭은 보존, 4 미만 잔여 스페이스는 유지. */
export function tabifyIndent(source: string): { result: string; converted: number } {
  let converted = 0;
  const result = source.replace(/^[\t ]*/gm, (leading) => {
    let out = "";
    let spaces = 0;
    for (const ch of leading) {
      if (ch === "\t") {
        if (spaces > 0) {
          out += " ".repeat(spaces);
          spaces = 0;
        }
        out += "\t";
      } else {
        spaces++;
        if (spaces === 4) {
          out += "\t";
          converted++;
          spaces = 0;
        }
      }
    }
    if (spaces > 0) out += " ".repeat(spaces);
    return out;
  });
  return { result, converted };
}

/** 줄끝 정규화. Windows 에서는 CRLF 로 통일한다. */
export function normalizeNewlines(source: string): { result: string; converted: number } {
  if (platform() === "win32") {
    const unified = source.replace(/\r\n/g, "\n");
    const converted = unified.split("\n").length - 1 - (source.match(/\r\n/g)?.length ?? 0);
    return { result: unified.replace(/\n/g, "\r\n"), converted };
  }
  let converted = 0;
  const result = source.replace(/\r\n/g, () => {
    converted++;
    return "\n";
  });
  return { result, converted };
}

/** 스크립트 소스를 저장용 형식으로 정규화한다(들여쓰기 → 줄끝). */
export function normalizeScriptSource(source: string): string {
  return normalizeNewlines(tabifyIndent(source).result).result;
}
