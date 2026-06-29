import { copyFileSync, mkdirSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * 백업/복원 — 쓰기 전 .ovdrjm 를 복사해두고, 파이프라인 실패 시 rollback 에서 복원한다.
 *
 * P1-3: 백업은 월드 폴더를 어지럽히지 않도록 `.overdare-backups/` 하위에 두고,
 * 파일명에 timestamp+pid+counter 를 붙여 충돌을 막는다. 백업은 작업 범위(operation-scoped)이며
 * 파이프라인이 작업 종료 시 `discardBackup` 으로 정리한다(누적 방지).
 */

export interface Backup {
  entries: { original: string; backup: string }[];
}

const BACKUP_DIR = ".overdare-backups";
let counter = 0;

export function createBackup(paths: string[], stamp: number = Date.now()): Backup {
  const entries = paths.map((original) => {
    const dir = join(dirname(original), BACKUP_DIR);
    mkdirSync(dir, { recursive: true });
    const backup = join(dir, `${basename(original)}.${stamp}.${process.pid}.${counter++}.bak`);
    copyFileSync(original, backup);
    return { original, backup };
  });
  return { entries };
}

export function restoreBackup(b: Backup): void {
  for (const e of b.entries) {
    copyFileSync(e.backup, e.original);
  }
}

/** 백업 파일 삭제 (작업 종료 시 정리). 실패는 무시. */
export function discardBackup(b: Backup): void {
  for (const e of b.entries) {
    try {
      unlinkSync(e.backup);
    } catch { /* 이미 없거나 잠김 — 무시 */ }
  }
}
