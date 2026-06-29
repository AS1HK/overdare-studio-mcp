import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isSupported } from "../capability/capabilities.js";
import { call } from "../rpc/client.js";
import { RpcError } from "../rpc/errors.js";
import { toResponse } from "./result.js";

/**
 * level.publish — 월드를 OVERDARE 플랫폼에 공개한다. **비가역·외부공개**.
 *
 * 설계 최우선 목표: "실수로 호출되지 않는 것".
 * 실제 level.publish 는 아래 4개 게이트가 **모두** 충족될 때만 호출된다:
 *   1) capability 지원      isSupported("level.publish")
 *   2) 환경 허용            OVERDARE_ALLOW_PUBLISH === "1"
 *   3) 명시적 확인          confirm === true
 *   4) dry-run 아님         dryRun === false
 * 하나라도 미충족이면 RPC 를 **절대 호출하지 않는다**.
 *
 * 롤백 없음(외부 공개 불가역). Replay 영구 제외. 토큰은 기록 금지(이미 redacted).
 */

export interface PublishArgs {
  worldName?: string;
  description?: string;
  category?: string[];
  keyword?: string[];
  confirm?: boolean;
  dryRun?: boolean;
}

export interface PublishGates {
  capability: boolean;
  envAllow: boolean;
  confirm: boolean;
  notDryRun: boolean;
}

export async function evaluateGates(args: PublishArgs): Promise<PublishGates> {
  return {
    capability: await isSupported("level.publish"),
    envAllow: process.env.OVERDARE_ALLOW_PUBLISH === "1",
    confirm: args.confirm === true,
    notDryRun: args.dryRun === false,
  };
}

export function allGatesPass(g: PublishGates): boolean {
  return g.capability && g.envAllow && g.confirm && g.notDryRun;
}

function buildParams(args: PublishArgs): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (args.worldName) p.worldName = args.worldName;
  if (args.description) p.description = args.description;
  if (args.category && args.category.length > 0) p.category = args.category;
  if (args.keyword && args.keyword.length > 0) p.keyword = args.keyword;
  return p;
}

/**
 * publish 결정 + 실행. 게이트 미충족이면 RPC 미호출. 직접 테스트/스모크 가능하도록 분리.
 */
export async function executePublish(args: PublishArgs) {
  const gates = await evaluateGates(args);

  if (!allGatesPass(gates)) {
    const unmet = (Object.entries(gates) as [keyof PublishGates, boolean][])
      .filter(([, v]) => !v).map(([k]) => k);

    // dry-run(기본): 정상적인 "미리보기" — RPC 미호출
    if (args.dryRun !== false) {
      return toResponse({
        success: true,
        operation: "studio_publish",
        affected: [],
        warnings: ["dry-run — level.publish 를 호출하지 않았습니다."],
        data: { wouldPublish: buildParams(args) },
        metadata: { dryRun: true, gates, unmetGates: unmet },
      }, "dry-run: 실제 publish 를 하지 않았습니다. 발사하려면 OVERDARE_ALLOW_PUBLISH=1 + confirm:true + dryRun:false 가 모두 필요합니다.");
    }

    // dryRun=false 인데 게이트 미충족 → 차단(구조적 이유 포함)
    return toResponse({
      success: false,
      operation: "studio_publish",
      affected: [],
      warnings: [],
      error: { stage: "guard", message: `publish 차단 — 미충족 게이트: ${unmet.join(", ")}` },
      metadata: { dryRun: false, gates, unmetGates: unmet },
    }, `publish 차단: 미충족 게이트 [${unmet.join(", ")}]. RPC 미호출.`);
  }

  // 4중 게이트 모두 충족 → 실제 publish (롤백 없음)
  try {
    const result = await call("level.publish", buildParams(args), { timeoutMs: 60000 });
    return toResponse({
      success: true,
      operation: "studio_publish",
      affected: [],
      warnings: ["publish 는 비가역입니다. Studio 가 브라우저 승인 페이지를 엽니다."],
      data: result,
      metadata: { published: true, gates },
    }, "publish 요청됨 — Studio 가 브라우저로 승인 페이지를 엽니다.");
  } catch (err) {
    const canceled = err instanceof RpcError && err.code === -32009;
    return toResponse({
      success: false,
      operation: "studio_publish",
      affected: [],
      warnings: [],
      error: {
        stage: canceled ? "canceled" : "publish",
        message: canceled
          ? "유저가 Studio UI 에서 publish 를 취소했습니다(재시도 금지)."
          : (err instanceof Error ? err.message : String(err)),
      },
      metadata: { published: false },
    }, canceled ? "publish 취소됨(유저)." : `publish 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function register(server: McpServer): void {
  server.registerTool(
    "studio_publish",
    {
      title: "Publish the world (irreversible)",
      description:
        "월드를 OVERDARE 플랫폼에 공개한다. **비가역·외부공개.** " +
        "기본은 dry-run(미리보기). 실제 발사는 OVERDARE_ALLOW_PUBLISH=1 + confirm:true + dryRun:false 가 " +
        "모두 충족돼야 한다. 하나라도 빠지면 RPC 를 호출하지 않는다.",
      inputSchema: {
        worldName: z.string().optional().describe("월드 이름(첫 publish 에만 반영)"),
        description: z.string().optional(),
        category: z.array(z.string()).max(3).optional().describe("카테고리 태그(최대 3)"),
        keyword: z.array(z.string()).max(5).optional().describe("검색 키워드(최대 5)"),
        confirm: z.boolean().default(false).describe("실제 발사 확인(기본 false)"),
        dryRun: z.boolean().default(true).describe("true(기본)면 미리보기만 — RPC 미호출"),
      },
    },
    async (args) => executePublish(args),
  );
}
