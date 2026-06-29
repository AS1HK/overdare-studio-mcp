import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { call } from "../rpc/client.js";
import { postProcess } from "../scene/browse.js";
import { readResult } from "./result.js";

export function register(server: McpServer): void {
  server.registerTool(
    "studio_browse",
    {
      title: "Browse level tree",
      description:
        "OVERDARE Studio 레벨 인스턴스 트리를 조회한다 (RPC level.browse). " +
        "각 노드는 guid/name/class/children 을 가진다. " +
        "startGuid 로 특정 노드부터, classType 으로 클래스 필터(예 Part/Script), maxDepth 로 깊이 제한(1=최상위만 권장).",
      inputSchema: {
        startGuid: z.string().optional().describe("이 GUID 노드부터 조회"),
        classType: z.string().optional().describe('이 클래스만 (예 "Part", "Script")'),
        maxDepth: z.number().int().min(1).optional().describe("트리 깊이 제한 (1=최상위만)"),
      },
    },
    async (args) => {
      // Studio 서버는 필터 인자를 무시하므로 params 없이 호출하고 클라이언트에서 후처리한다
      const result = await call("level.browse");
      const nodes = postProcess(result, args);
      return readResult("studio_browse", nodes, JSON.stringify(nodes, null, 2));
    },
  );
}
