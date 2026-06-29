import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { call } from "../rpc/client.js";
import { readResult } from "./result.js";

export function register(server: McpServer): void {
  server.registerTool(
    "studio_apply",
    {
      title: "Apply pending level changes",
      description:
        "디스크의 .ovdrjm 변경분을 라이브 씬에 반영한다 (RPC level.apply). " +
        "보통 .ovdrjm 편집 직후 호출하는 쓰기 파이프라인의 일부. 보류분이 없으면 사실상 no-op.",
      inputSchema: {},
    },
    async () => {
      const result = await call("level.apply");
      return readResult("studio_apply", result, JSON.stringify(result, null, 2));
    },
  );
}
