import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JSON_EXTENSIONS, PathSecurityError, validatePath } from "../security/path-guard.js";
import { rejectResult, runRpcMutationTool } from "./result.js";

/**
 * action_sequencer_service.apply_json — 기존 ActionSequencer 인스턴스에 시퀀서 JSON 을 적용한다.
 * jsonFilePath 는 **pathGuard 로 검증**(경계/심링크/.json). 레벨을 바꾸므로 백업 가드(롤백 가능).
 * instanceGuid 유효성은 Studio 가 검증한다(없으면 RPC 에러 → 가드가 롤백).
 */
export function register(server: McpServer): void {
  server.registerTool(
    "studio_apply_action_sequence",
    {
      title: "Apply a sequencer JSON to an Action Sequencer",
      description:
        "기존 ActionSequencer 인스턴스(instanceGuid)에 시퀀서 JSON 파일을 적용한다. " +
        "jsonFilePath 는 프로젝트 경계 안의 .json 파일이어야 한다(경로검증). " +
        "실패 시 자동 rollback. 지원 안 하면 capability 에러.",
      inputSchema: {
        instanceGuid: z.string().describe("대상 ActionSequencer 인스턴스 GUID"),
        jsonFilePath: z.string().describe("시퀀서 JSON 파일 경로(절대경로 권장, 프로젝트 경계 안)"),
      },
    },
    async ({ instanceGuid, jsonFilePath }) => {
      let realPath: string;
      try {
        realPath = validatePath(jsonFilePath, { extensions: JSON_EXTENSIONS });
      } catch (e) {
        if (e instanceof PathSecurityError) return rejectResult("studio_apply_action_sequence", "path", e.message);
        throw e;
      }
      return runRpcMutationTool(
        "studio_apply_action_sequence",
        "action_sequencer_service.apply_json",
        { instanceGuid, jsonFilePath: realPath },
        (result) => ({
          text: `Applied sequencer JSON to ${instanceGuid}.`,
          data: result,
          affected: [{ guid: instanceGuid }],
          metadata: { jsonFilePath: realPath },
        }),
        { backup: true },
      );
    },
  );
}
