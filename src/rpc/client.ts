import { config } from "../config.js";
import { recorder } from "../trace/recorder.js";
import { RpcError } from "./errors.js";
import { sendRequestLine, type TransportTarget } from "./transport.js";

let nextId = 1;

export interface CallOptions {
  host?: string;
  port?: number;
  timeoutMs?: number;
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code?: number; message?: string };
}

/**
 * Studio 13377 에 JSON-RPC 메서드를 보내고 result 를 반환한다.
 * 빈 params 는 생략한다. error 응답이면 RpcError. Recorder 에 자동 기록.
 */
export async function call<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
  opts: CallOptions = {},
): Promise<T> {
  const target: TransportTarget = {
    host: opts.host ?? config.host,
    port: opts.port ?? config.port,
    timeoutMs: opts.timeoutMs ?? config.rpcTimeoutMs,
  };

  const id = nextId++;
  const request: Record<string, unknown> = { jsonrpc: "2.0", id, method };
  if (params && Object.keys(params).length > 0) request.params = params;
  const raw = JSON.stringify(request);

  const start = performance.now();

  let line: string;
  try {
    line = await sendRequestLine(target, raw);
  } catch (err) {
    const elapsedMs = performance.now() - start;
    recorder.recordRpc({ method, request, error: { message: err instanceof Error ? err.message : String(err) }, elapsedMs });
    throw err;
  }
  const elapsedMs = performance.now() - start;

  let response: JsonRpcResponse;
  try {
    response = JSON.parse(line) as JsonRpcResponse;
  } catch {
    recorder.recordRpc({ method, request, error: { message: "parse error" }, elapsedMs });
    throw new RpcError(null, `Failed to parse Studio RPC response: ${line.slice(0, 200)}`);
  }

  if (response.error) {
    recorder.recordRpc({ method, request, error: response.error, elapsedMs });
    throw new RpcError(response.error.code ?? null, response.error.message ?? "unknown error");
  }

  recorder.recordRpc({ method, request, result: response.result, elapsedMs });
  return response.result as T;
}
