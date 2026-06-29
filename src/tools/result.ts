import { applyWrite, type WriteOpts, type WriteOutcome, WriteError } from "../ovdrjm/pipeline.js";
import { applyRpcMutation, type RpcMutationOpts } from "../ovdrjm/rpc-mutation.js";
import { isSupported } from "../capability/capabilities.js";
import type { OvdrjmDoc } from "../ovdrjm/document.js";

/**
 * 안정적 Tool Contract (v1.x 동안 깨지 않는 것을 목표로 하는 공통 반환 계약).
 *
 * 모든 MCP 도구는 사람용 `content[text]` 와 함께 `structuredContent: ToolResult` 를 반환한다.
 * 도구별 페이로드는 `data`(주 결과) 또는 `metadata`(부가정보)에 담는다.
 */

export interface AffectedInstance {
  guid: string;
  name?: string;
  class?: string;
}

export interface ToolResult {
  /** 성공 여부. 실패해도 throw 하지 않고 success:false 로 반환한다. */
  success: boolean;
  /** 도구/오퍼레이션 이름 (예: "studio_create_part"). */
  operation: string;
  /** 영향받은 인스턴스. 읽기 전용 도구는 []. */
  affected: AffectedInstance[];
  /** 쓰기 실패 시 롤백 완료 여부. 성공/읽기 도구에선 생략. */
  rollbackComplete?: boolean;
  /** 비치명적 경고. */
  warnings: string[];
  /** 도구별 주 결과 페이로드 (예: browse 트리). */
  data?: unknown;
  /** 부가 메타데이터. */
  metadata?: Record<string, unknown>;
  /** success=false 일 때 에러 정보. */
  error?: { stage?: string; message: string };
}

/** ToolResult + 사람용 텍스트 → MCP 도구 응답. */
export function toResponse(result: ToolResult, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: result as unknown as Record<string, unknown>,
    isError: !result.success,
  };
}

/** 읽기 전용 성공 응답 헬퍼. */
export function readResult(operation: string, data: unknown, text: string) {
  return toResponse({ success: true, operation, affected: [], warnings: [], data }, text);
}

/** 미지원 capability 호출 시 표준 계약 응답(UnsupportedCapabilityError 의 계약 형태). */
export function unsupportedResult(operation: string, method: string) {
  return toResponse({
    success: false,
    operation,
    affected: [],
    warnings: [],
    error: { stage: "capability", message: `unsupported RPC method: ${method}` },
    metadata: { capability: method, supported: false },
  }, `${operation}: Studio 가 "${method}" 를 지원하지 않습니다 (capability 미지원).`);
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * 쓰기 도구 공통 실행기 — applyWrite 를 돌리고 ToolResult 로 감싼다.
 * 실패는 throw 하지 않고 success:false + stage + rollbackComplete 로 구조화해 반환한다.
 * Phase 3 의 모든 쓰기 도구(update_part/delete/...)도 이 헬퍼를 사용한다.
 */
export async function runWriteTool(
  operation: string,
  modify: (doc: OvdrjmDoc) => WriteOutcome,
  onOk: (outcome: WriteOutcome) => { text: string; affected: AffectedInstance[]; metadata?: Record<string, unknown> },
  opts: WriteOpts = {},
) {
  try {
    const outcome = await applyWrite(modify, opts);
    const { text, affected, metadata } = onOk(outcome);
    return toResponse({ success: true, operation, affected, warnings: [], metadata }, text);
  } catch (err) {
    const we = err instanceof WriteError ? err : null;
    const message = errMsg(err);
    return toResponse({
      success: false,
      operation,
      affected: [],
      warnings: [],
      rollbackComplete: we ? we.rollbackComplete : false,
      error: { stage: we?.stage, message },
    }, `${operation} 실패: ${message}`);
  }
}

/** 검증 거부(예: 경로 보안) 를 계약 형태로 반환. */
export function rejectResult(operation: string, stage: string, message: string) {
  return toResponse({
    success: false, operation, affected: [], warnings: [], error: { stage, message },
  }, `${operation} 거부(${stage}): ${message}`);
}

/**
 * 직접 RPC 변이 도구 공통 실행기 — capability 확인 → applyRpcMutation → ToolResult.
 * 미지원이면 unsupportedResult, 실패면 success:false + stage + rollbackComplete.
 */
export async function runRpcMutationTool(
  operation: string,
  method: string,
  params: Record<string, unknown>,
  onOk: (result: unknown) => { text: string; affected?: AffectedInstance[]; data?: unknown; metadata?: Record<string, unknown> },
  opts: RpcMutationOpts = {},
) {
  if (!(await isSupported(method))) return unsupportedResult(operation, method);
  try {
    const result = await applyRpcMutation(method, params, opts);
    const { text, affected, data, metadata } = onOk(result);
    return toResponse({ success: true, operation, affected: affected ?? [], warnings: [], data, metadata }, text);
  } catch (err) {
    const we = err instanceof WriteError ? err : null;
    return toResponse({
      success: false,
      operation,
      affected: [],
      warnings: [],
      rollbackComplete: we ? we.rollbackComplete : false,
      error: { stage: we?.stage ?? "rpc", message: errMsg(err) },
    }, `${operation} 실패: ${errMsg(err)}`);
  }
}
