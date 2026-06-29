import { call } from "../rpc/client.js";
import { RpcError } from "../rpc/errors.js";

/**
 * Capability Layer — Studio RPC 기능 지원 여부를 확인/캐시하는 호환성 계층.
 *
 * 탐지 원리: 메서드를 빈 파라미터로 호출하면 Studio 는
 *   - `-32002 Method not found` → 미지원
 *   - 그 외 에러(-32602/-32603/-32001) 또는 성공 → 지원(메서드 존재)
 * 으로 응답한다(빈 파라미터 호출의 응답 코드로 판별).
 *
 * 예외: `level.publish` 는 빈 파라미터 호출이 **실제 publish** 를 일으키므로 probe 하지 않는다.
 *   → 낙관적 supported 로 두고, 실제(확인된) 호출 시 -32002 를 만나면 그때 미지원 처리.
 */

type ProbeOutcome = "ok" | "not-found" | "skipped" | "unreachable";

/** 빈 파라미터 호출이 무해한(=probe 가능한) 메서드. */
const PROBE_METHODS = [
  "asset_drawer.import",
  "asset_manager.image.import",
  "action_sequencer_service.apply_json",
] as const;

/** probe 불가 메서드 — 빈 호출이 부작용을 일으킴. 낙관적 supported. */
const UNPROBABLE: Record<string, string> = {
  "level.publish": "probing with empty params would trigger a real publish",
};

export interface MethodCapability {
  supported: boolean;
  probe: ProbeOutcome;
}

export interface Capabilities {
  /** 모든 probe 가 Studio 에 닿은 시각. 미실행이면 null(캐시 안 함). */
  probedAt: string | null;
  /** Studio 버전. RPC version 메서드가 없어 현재 null. TODO: 버전 메서드 발견 시 채움. */
  studioVersion: string | null;
  methods: Record<string, MethodCapability>;
}

let cache: Capabilities | null = null;
let inflight: Promise<Capabilities> | null = null;

async function probeMethod(method: string): Promise<ProbeOutcome> {
  try {
    await call(method, {});
    return "ok"; // 성공해도 메서드는 존재 = 지원
  } catch (e) {
    if (e instanceof RpcError) {
      return e.code === -32002 ? "not-found" : "ok";
    }
    return "unreachable"; // 트랜스포트 에러 — Studio 미실행/연결불가
  }
}

/**
 * Capability 를 반환한다(최초 1회 probe 후 캐시). Studio 가 안 닿으면 캐시하지 않고
 * 낙관적 결과를 돌려준다(다음 호출 때 재시도). force=true 면 강제 재-probe.
 */
export async function getCapabilities(force = false): Promise<Capabilities> {
  if (cache && !force) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const methods: Record<string, MethodCapability> = {};
    let anyReachable = false;
    for (const m of PROBE_METHODS) {
      const probe = await probeMethod(m);
      if (probe !== "unreachable") anyReachable = true;
      methods[m] = { supported: probe === "ok" || probe === "unreachable", probe };
    }
    for (const m of Object.keys(UNPROBABLE)) {
      methods[m] = { supported: true, probe: "skipped" };
    }
    const caps: Capabilities = {
      probedAt: anyReachable ? new Date().toISOString() : null,
      studioVersion: null,
      methods,
    };
    cache = anyReachable ? caps : null; // 미연결이면 캐시 보류
    inflight = null;
    return caps;
  })();
  return inflight;
}

/** 특정 RPC 메서드 지원 여부. 미연결/미지(unreachable) 시 낙관적(true). */
export async function isSupported(method: string): Promise<boolean> {
  const caps = await getCapabilities();
  return caps.methods[method]?.supported ?? true;
}

/** Studio 가 안 닿아 probe 못한 경우, 백그라운드 워밍업용(실패 무시). */
export function warmUpCapabilities(): void {
  getCapabilities().catch(() => { /* Studio 미실행 — 무시, 첫 사용 때 재시도 */ });
}

/** 테스트용 캐시 리셋. */
export function _resetCapabilityCache(): void {
  cache = null;
  inflight = null;
}

/** 미지원 기능 호출 시 던지는 에러(계약 변환은 tools/result.unsupportedResult 사용). */
export class UnsupportedCapabilityError extends Error {
  constructor(public readonly method: string) {
    super(`Studio does not support RPC method "${method}" (capability unavailable).`);
    this.name = "UnsupportedCapabilityError";
  }
}
