import { config } from "../config.js";
import { call } from "../rpc/client.js";
import { recorder } from "../trace/recorder.js";
import { type Backup, createBackup, discardBackup, restoreBackup } from "./backup.js";
import { resolveOvdrjmPath } from "./document.js";
import { WriteError } from "./pipeline.js";
import { ovdrjmWriteLock } from "./write-lock.js";

/**
 * 직접 RPC 변이 가드 — Studio 가 수행하는 변이(asset import / action sequencer 등)를 감싼다.
 * applyWrite(.ovdrjm 직접편집)의 형제. **같은 write lock 을 공유**해 파일편집과 RPC변이가 직렬화된다.
 *
 * 흐름: (lock) → [백업] → call(method) → call("level.save.file") → [백업 폐기]
 *        실패 시 [백업 복원 + level.apply] → WriteError("rpc")
 *
 * 변이 RPC 는 Studio 가 처리하며, 영속화를 위해 level.save.file 을 뒤따라 호출한다.
 */
export interface RpcMutationOpts {
  cwd?: string;
  /** .ovdrjm 백업/롤백 수행 여부. 레벨을 바꾸는 변이는 true(롤백 가능), 자산등록 등은 false. 기본 true. */
  backup?: boolean;
  timeoutMs?: number;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function applyRpcMutation(
  method: string,
  params: Record<string, unknown>,
  opts: RpcMutationOpts = {},
): Promise<unknown> {
  const release = await ovdrjmWriteLock.acquire();
  try {
    return await runRpcMutation(method, params, opts);
  } finally {
    release();
  }
}

async function runRpcMutation(method: string, params: Record<string, unknown>, opts: RpcMutationOpts): Promise<unknown> {
  const useBackup = opts.backup !== false && !config.unsafe;
  let backup: Backup | null = null;
  if (useBackup) {
    const { ovdrjmPath } = resolveOvdrjmPath(opts.cwd ?? config.projectCwd);
    backup = createBackup([ovdrjmPath]);
    recorder.backup(backup.entries[0]!.backup);
  }

  try {
    const result = await call(method, params, opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {});
    await call("level.save.file"); // 변이 영속화
    return result;
  } catch (err) {
    let complete = false;
    if (backup) {
      let fileRestored = false;
      let sceneReverted = false;
      try { restoreBackup(backup); fileRestored = true; } catch { /* */ }
      if (fileRestored) {
        try { await call("level.apply"); sceneReverted = true; } catch { /* */ }
      }
      complete = fileRestored && sceneReverted;
      recorder.rollback(`rpc ${method}: ${msg(err)}`, complete);
    }
    const we = new WriteError("rpc", `${method}: ${msg(err)}`);
    we.rollbackComplete = backup ? complete : false;
    throw we;
  } finally {
    if (backup) discardBackup(backup);
  }
}
