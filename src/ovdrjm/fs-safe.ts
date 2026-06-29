import { createHash } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, statSync, writeSync } from "node:fs";

/**
 * 파일 안전 유틸 — 동시수정 감지(fingerprint)와 부분기록 방지(atomic write).
 */

export interface Fingerprint {
  mtimeMs: number;
  size: number;
  hash: string;
}

export function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** 파일 지문(mtime+size+sha256). 동시수정 감지용. */
export function fingerprint(path: string): Fingerprint {
  const buf = readFileSync(path);
  const st = statSync(path);
  return { mtimeMs: st.mtimeMs, size: buf.length, hash: hashBuffer(buf) };
}

/** 지문 동일성. hash 가 권위(size 는 보조). mtime 은 참고용이라 비교에서 제외. */
export function fingerprintEqual(a: Fingerprint, b: Fingerprint): boolean {
  return a.size === b.size && a.hash === b.hash;
}

/**
 * 원자적 파일 쓰기 — tmp 기록 → fsync → atomic rename.
 *
 * 부분기록(partial write)으로 .ovdrjm 가 깨지는 것을 막기 위해:
 *   1) 같은 디렉터리의 임시 파일에 전량 기록 (rename 이 atomic 이려면 같은 볼륨이어야 함)
 *   2) fsync 로 데이터를 디스크에 플러시
 *   3) rename 으로 원자적 교체 — 독자는 항상 "이전 전체" 또는 "이후 전체"만 본다
 *
 * 플랫폼:
 *   - POSIX(macOS/Linux): rename(2) 는 같은 파일시스템에서 atomic. 디렉터리 엔트리
 *     영속화를 위한 dir fsync 는 생략(대부분의 사용에 충분, 비용/복잡도 대비).
 *   - Windows: fs.renameSync 는 MoveFileEx(REPLACE_EXISTING) 로 기존 파일을 교체한다.
 *     (POSIX 만큼 강한 보장은 아니지만 부분기록 노출은 막는다.)
 */
export function writeFileAtomic(path: string, data: Buffer): void {
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  const fd = openSync(tmp, "w");
  try {
    let offset = 0;
    while (offset < data.length) {
      offset += writeSync(fd, data, offset, data.length - offset);
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}
