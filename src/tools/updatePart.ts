import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { partPropertiesUpdate } from "../ovdrjm/schemas.js";
import { updateInstance } from "../scene/update.js";
import { runWriteTool } from "./result.js";

export function register(server: McpServer): void {
  server.registerTool(
    "studio_update_part",
    {
      title: "Update a Part",
      description:
        "기존 Part(또는 인스턴스)의 이름/속성을 수정한다. " +
        "쓰기 파이프라인(backup→modify→validate→level.apply→level.save.file)을 강제하며 실패 시 자동 rollback. " +
        "전달한 필드만 바뀌고 나머지는 보존된다(부분 업데이트). guid 는 studio_browse 로 확인. " +
        "속성: Size/CFrame(Position·Orientation)/Color/Material/Anchored/Transparency 등. name 으로 이름 변경.",
      inputSchema: {
        guid: z.string().describe("수정할 인스턴스 GUID"),
        name: z.string().optional().describe("새 이름 (이름 변경 시)"),
        properties: partPropertiesUpdate.optional().describe("바꿀 속성만 (미지정 필드는 보존)"),
      },
    },
    async ({ guid, name, properties }) => {
      return runWriteTool(
        "studio_update_part",
        (doc) => updateInstance(doc, guid, { name, properties }),
        (outcome) => ({
          text: `Updated ${guid}${name !== undefined ? ` (renamed to "${name}")` : ""}: ${outcome.added?.join(", ") || "no changes"}.`,
          affected: [{ guid, name }],
          metadata: { changed: outcome.added ?? [] },
        }),
      );
    },
  );
}
