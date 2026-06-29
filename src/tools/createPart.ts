import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { partProperties } from "../ovdrjm/schemas.js";
import { insertInstance } from "../scene/insert.js";
import { runWriteTool } from "./result.js";

export function register(server: McpServer): void {
  server.registerTool(
    "studio_create_part",
    {
      title: "Create a Part",
      description:
        "부모 인스턴스(parentGuid) 하위에 Part 를 생성한다. " +
        "쓰기 파이프라인(backup→modify→validate→level.apply→level.save.file)을 강제하며, 실패 시 자동 rollback. " +
        "parentGuid 는 studio_browse 로 먼저 확인할 것. " +
        "속성: Size/CFrame/Color/Material/Anchored 등. " +
        "Position 은 CFrame.Position 으로 지정한다. Size 단위는 cm.",
      inputSchema: {
        parentGuid: z.string().describe("부모 인스턴스 GUID (예: Workspace)"),
        name: z.string().describe("생성할 Part 이름"),
        properties: partProperties.optional().describe("Part 속성 (생략 시 기본값 적용)"),
      },
    },
    async ({ parentGuid, name, properties }) => {
      // zod 기본값 적용(Anchored 등) 후 파싱된 속성을 노드에 병합
      const props = partProperties.parse(properties ?? {});
      return runWriteTool(
        "studio_create_part",
        (doc) => insertInstance(doc, parentGuid, "Part", name, props),
        (outcome) => ({
          text: `Created Part "${name}" (guid ${outcome.guid}) under ${parentGuid}.`,
          affected: [{ guid: outcome.guid!, name, class: "Part" }],
          metadata: { parentGuid },
        }),
      );
    },
  );
}
