import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deleteInstance } from "../scene/delete.js";
import { runWriteTool } from "./result.js";

export function register(server: McpServer): void {
  server.registerTool(
    "studio_delete",
    {
      title: "Delete an instance",
      description:
        "인스턴스를 삭제한다 (자식 포함 — 서브트리 통째로 제거). " +
        "쓰기 파이프라인(backup→modify→validate→level.apply→level.save.file)을 강제하며 실패 시 자동 rollback. " +
        "서비스(Workspace/Lighting/Players 등 싱글톤)는 삭제할 수 없다. guid 는 studio_browse 로 확인.",
      inputSchema: {
        guid: z.string().describe("삭제할 인스턴스 GUID"),
      },
    },
    async ({ guid }) => {
      return runWriteTool(
        "studio_delete",
        (doc) => deleteInstance(doc, guid),
        (outcome) => ({
          text: `Deleted "${outcome.label}" (${guid}) and its descendants.`,
          affected: [{ guid, name: outcome.label }],
        }),
      );
    },
  );
}
