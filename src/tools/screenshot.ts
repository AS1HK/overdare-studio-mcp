import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { call } from "../rpc/client.js";
import { readResult } from "./result.js";

export function register(server: McpServer): void {
  server.registerTool(
    "studio_screenshot",
    {
      title: "Capture viewport screenshot",
      description:
        "OVERDARE Studio 뷰포트 스크린샷을 캡처해 파일로 저장한다 (RPC game.screenshot, captureType=Viewport). " +
        "현재 Viewport 모드만 지원. 응답이 느릴 수 있어 타임아웃을 길게 잡는다.",
      inputSchema: {},
    },
    async () => {
      const result = await call("game.screenshot", { captureType: "Viewport" }, { timeoutMs: 60000 });
      return readResult("studio_screenshot", result, JSON.stringify(result, null, 2));
    },
  );
}
