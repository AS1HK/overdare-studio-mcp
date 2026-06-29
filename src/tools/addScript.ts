import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { insertScript } from "../scene/insert.js";
import { runWriteTool } from "./result.js";

export function register(server: McpServer): void {
  server.registerTool(
    "studio_add_script",
    {
      title: "Add a script",
      description:
        "부모 인스턴스(parentGuid) 하위에 Script/LocalScript/ModuleScript 를 추가한다. " +
        "쓰기 파이프라인(backup→modify→validate→level.apply→level.save.file)을 강제하며, 실패 시 자동 rollback. " +
        "들여쓰기는 탭 사용 권장(선행 4-스페이스 그룹은 자동으로 탭 변환).",
      inputSchema: {
        parentGuid: z.string().describe("부모 인스턴스 GUID (예: ServerScriptService)"),
        scriptClass: z.enum(["Script", "LocalScript", "ModuleScript"]).describe("스크립트 종류"),
        name: z.string().describe("스크립트 이름"),
        source: z.string().describe("Luau 소스 코드"),
      },
    },
    async ({ parentGuid, scriptClass, name, source }) => {
      return runWriteTool(
        "studio_add_script",
        (doc) => insertScript(doc, parentGuid, scriptClass, name, source),
        (outcome) => ({
          text: `Added ${scriptClass} "${name}" (guid ${outcome.guid}) under ${parentGuid}.`,
          affected: [{ guid: outcome.guid!, name, class: scriptClass }],
          metadata: { parentGuid },
        }),
      );
    },
  );
}
