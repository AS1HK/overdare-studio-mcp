import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { call } from "../rpc/client.js";
import { readResult } from "./result.js";

export function register(server: McpServer): void {
  server.registerTool(
    "studio_save",
    {
      title: "Save world to file",
      description:
        "편집 중인 월드를 파일로 저장한다 (RPC level.save.file). .umap 과 .ovdrjm 둘 다 갱신됨.",
      inputSchema: {},
    },
    async () => {
      const result = await call("level.save.file");
      return readResult("studio_save", result, JSON.stringify(result, null, 2));
    },
  );
}
