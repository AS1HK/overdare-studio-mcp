import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

const SEP = "-".repeat(32);

/** 민감 응답 마스킹 — hub.token.read 의 JWT 가 trace 파일에 저장되지 않도록. */
function redactSensitive(method: string, result: unknown): unknown {
  if (method === "hub.token.read" && result && typeof result === "object" && "token" in result) {
    return { ...(result as object), token: "<redacted>" };
  }
  return result;
}

export interface RpcRecord {
  method: string;
  request: Record<string, unknown>;
  result?: unknown;
  error?: { code?: number; message?: string } | null;
  elapsedMs: number;
}

interface SessionCall {
  method: string;
  params: unknown;
  result?: unknown;
  error?: { code?: number; message?: string } | null;
}

/**
 * Recorder — RPC/ovdrjm/backup/rollback 을 사람이 읽는 trace(stderr) 로,
 * 그리고 OVERDARE_MCP_TRACE_DIR 지정 시 replay 용 구조화 파일로 기록한다.
 *
 * 파일 (TRACE_DIR/):
 *   - rpc.jsonl     : RPC 레코드 1줄/건 (ts/method/request/result|error/elapsedMs)
 *   - session.json  : { metadata, calls: [{method, params, result|error}] }  ← replay 입력
 *   - metadata.json : 기록 환경(호스트/포트/버전/시각)
 *   - ovdrjm.diff   : ovdrjm 편집 diff 누적
 *
 * 중요: MCP stdout 은 프로토콜 채널 → 사람용 trace 는 반드시 stderr 로만.
 */
class Recorder {
  enabled = config.trace;
  private readonly dir = config.traceDir;
  private readonly file = process.env.OVERDARE_MCP_TRACE_FILE;
  private readonly calls: SessionCall[] = [];
  private dirReady = false;

  private ensureDir(): void {
    if (!this.dir || this.dirReady) return;
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, "metadata.json"), JSON.stringify({
      recordedAt: new Date().toISOString(),
      label: config.traceLabel ?? null,
      studioHost: config.host,
      studioPort: config.port,
      mcpVersion: "0.3.0",
      nodeVersion: process.version,
      platform: process.platform,
    }, null, 2));
    // P1-4: session.json 은 RPC 마다 전체 재기록(O(n²)) 대신 종료 시 1회만 작성.
    // rpc.jsonl(append-only)이 실시간 크래시 복원본 역할을 한다.
    process.once("exit", () => this.flushSession());
    this.dirReady = true;
  }

  private flushSession(): void {
    if (!this.dir) return;
    try {
      writeFileSync(join(this.dir, "session.json"), JSON.stringify({
        recordedAt: new Date().toISOString(),
        label: config.traceLabel ?? null,
        calls: this.calls,
      }, null, 2));
    } catch { /* trace 실패 무시 */ }
  }

  private emit(block: string): void {
    if (!this.enabled) return;
    const out = `${block}\n`;
    process.stderr.write(out);
    if (this.file) {
      try { appendFileSync(this.file, out); } catch { /* trace 실패가 본작업을 막지 않음 */ }
    }
  }

  /** RPC 1건 기록 (성공/실패 모두). */
  recordRpc(rec: RpcRecord): void {
    const status = rec.error ? "error" : "success";
    const tail = rec.error ? `\n  code: ${rec.error.code} ${rec.error.message ?? ""}` : "";
    this.emit(`[RPC]\n→ ${rec.method}\n← ${status}${tail}\nelapsed: ${rec.elapsedMs.toFixed(0)}ms\n${SEP}`);

    if (!this.dir) return;
    try {
      this.ensureDir();
      const safeResult = redactSensitive(rec.method, rec.result);
      appendFileSync(join(this.dir, "rpc.jsonl"), `${JSON.stringify({ ts: Date.now(), ...rec, result: safeResult })}\n`);
      this.calls.push({
        method: rec.method,
        params: rec.request.params ?? null,
        ...(rec.error ? { error: rec.error } : { result: safeResult }),
      });
    } catch { /* trace 실패 무시 */ }
  }

  ovdrjmDiff(label: string, added: string[] = [], removed: string[] = []): void {
    const lines = ["[OVDRJM]", "Modified:", label, ...added.map((f) => `+ ${f}`), ...removed.map((f) => `- ${f}`), SEP];
    const block = lines.join("\n");
    this.emit(block);
    if (this.dir) {
      try {
        this.ensureDir();
        appendFileSync(join(this.dir, "ovdrjm.diff"), `${block}\n`);
      } catch { /* ignore */ }
    }
  }

  backup(backupPath: string): void {
    this.emit(`[BACKUP]\n${backupPath}\n${SEP}`);
  }

  rollback(reason: string, complete: boolean): void {
    this.emit(`[ROLLBACK ${complete ? "complete" : "INCOMPLETE"}]\n${reason}\n${SEP}`);
  }
}

export const recorder = new Recorder();
