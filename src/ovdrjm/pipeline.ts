import { statSync } from "node:fs";
import { config } from "../config.js";
import { call } from "../rpc/client.js";
import { recorder } from "../trace/recorder.js";
import { type Backup, createBackup, discardBackup, restoreBackup } from "./backup.js";
import { encode, serialize } from "./codec.js";
import { type OvdrjmDoc, readDocument, resolveOvdrjmPath } from "./document.js";
import { type Fingerprint, fingerprint, fingerprintEqual, hashBuffer, writeFileAtomic } from "./fs-safe.js";
import { validateDocument } from "./validate.js";
import { ovdrjmWriteLock } from "./write-lock.js";

export interface WriteOutcome {
  /** Recorder diff 라벨, 예: "Workspace/MyPart" */
  label: string;
  added?: string[];
  removed?: string[];
  /** 생성/대상 인스턴스 GUID */
  guid?: string;
}

export interface WriteOpts {
  /** .ovdrjm 를 찾을 디렉터리 (기본 config.projectCwd). 테스트/멀티월드용. */
  cwd?: string;
}

export class WriteError extends Error {
  /** 쓰기 실패 시 롤백이 끝까지 완료됐는지. (pre-write 실패는 변경이 없어 true) */
  rollbackComplete = true;
  constructor(public readonly stage: string, message: string) {
    super(`[${stage}] ${message}`);
    this.name = "WriteError";
  }
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * 모든 .ovdrjm 쓰기의 단일 진입점. 순서를 강제한다:
 *   (write lock) → backup → modify → validate → [TOCTOU 재확인] → atomic write → level.apply → level.save.file
 *
 * - ovdrjmWriteLock 으로 변이를 직렬화한다(동시 쓰기 차단).
 * - P0-1: read 시점 지문과 write 직전 지문을 비교, 외부 변경 시 WriteError("conflict").
 * - P0-3: 임시파일+fsync+rename 원자적 쓰기 (부분기록 방지).
 *
 * write **이전** 실패(modify/validate/conflict/write)는 디스크를 안 건드리므로 복원하지 않는다
 * (특히 conflict 는 외부 변경을 보존해야 하므로 복원 금지).
 * write **이후** 실패(apply/save)만 backup 복원 + level.apply 로 롤백한다.
 * --unsafe(config.unsafe) 면 backup/rollback 을 생략한다.
 */
export async function applyWrite(
  modify: (doc: OvdrjmDoc) => WriteOutcome,
  opts: WriteOpts = {},
): Promise<WriteOutcome> {
  const release = await ovdrjmWriteLock.acquire();
  try {
    return await runWrite(modify, opts.cwd ?? config.projectCwd);
  } finally {
    release();
  }
}

async function runWrite(modify: (doc: OvdrjmDoc) => WriteOutcome, cwd: string): Promise<WriteOutcome> {
  const { ovdrjmPath } = resolveOvdrjmPath(cwd);
  const { buf, doc } = readDocument(ovdrjmPath);
  const before: Fingerprint = { mtimeMs: statSync(ovdrjmPath).mtimeMs, size: buf.length, hash: hashBuffer(buf) };

  const backup: Backup | null = config.unsafe ? null : createBackup([ovdrjmPath]);
  if (backup) recorder.backup(backup.entries[0]!.backup);

  // write 이전 실패: 디스크 변경 없음 → 복원하지 않음
  const abort = (stage: string, message: string): never => {
    const err = new WriteError(stage, message);
    err.rollbackComplete = true; // 변경한 게 없으니 롤백 불필요/완료로 간주
    throw err;
  };

  // write 이후 실패: 백업 복원 + 라이브 씬 되돌림
  const rollbackAndThrow = async (stage: string, message: string): Promise<never> => {
    let complete = false;
    if (backup) {
      let fileRestored = false;
      try {
        restoreBackup(backup);
        fileRestored = true;
      } catch { /* 파일 복원 실패 → complete=false */ }
      let sceneReverted = false;
      if (fileRestored) {
        try {
          await call("level.apply");
          sceneReverted = true;
        } catch { /* 씬 되돌리기 실패 → complete=false */ }
      }
      complete = fileRestored && sceneReverted;
      recorder.rollback(`${stage}: ${message}`, complete);
    }
    const err = new WriteError(stage, message);
    err.rollbackComplete = backup ? complete : false; // --unsafe 면 롤백 불가
    err.message += backup
      ? ` (rollback: ${complete ? "complete" : "INCOMPLETE"})`
      : " (rollback: skipped, --unsafe)";
    throw err;
  };

  try {
    // 2. modify (in-memory)
    let outcome: WriteOutcome;
    try {
      outcome = modify(doc);
    } catch (err) {
      return abort("modify", msg(err));
    }

    // 3. validate
    const v = validateDocument(doc);
    if (!v.ok) return abort("validate", v.errors.join("; "));

    // P0-1: write 직전 외부 변경 감지 (외부 변경은 보존, 우리만 중단)
    if (!fingerprintEqual(before, fingerprint(ovdrjmPath))) {
      return abort("conflict", "another process modified the .ovdrjm during the write; aborted without writing");
    }

    // P0-3: 원자적 쓰기 (실패해도 atomic 이라 원본 보존 → 복원 불필요)
    try {
      writeFileAtomic(ovdrjmPath, encode(serialize(doc), buf));
      recorder.ovdrjmDiff(outcome.label, outcome.added ?? [], outcome.removed ?? []);
    } catch (err) {
      return abort("write", msg(err));
    }

    // 4. level.apply (이후 실패 → 롤백)
    try {
      await call("level.apply");
    } catch (err) {
      return rollbackAndThrow("apply", msg(err));
    }

    // 5. level.save.file
    try {
      await call("level.save.file");
    } catch (err) {
      return rollbackAndThrow("save", msg(err));
    }

    return outcome;
  } finally {
    // P1-3: 작업 종료 시 백업 정리(누적 방지). rollback 은 이미 백업을 사용한 뒤다.
    if (backup) discardBackup(backup);
  }
}
