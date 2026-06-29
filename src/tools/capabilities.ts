import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCapabilities } from "../capability/capabilities.js";
import { readResult } from "./result.js";

export function register(server: McpServer): void {
  server.registerTool(
    "studio_capabilities",
    {
      title: "Report Studio capabilities",
      description:
        "Studio RPC 기능 지원 여부(capability)와 버전을 보고한다. " +
        "최초 1회 probe 후 캐시. refresh:true 면 강제 재확인. " +
        "지원하지 않는 기능을 호출하면 각 도구가 capability 에러를 계약 형태로 반환한다.",
      inputSchema: {
        refresh: z.boolean().optional().describe("true 면 캐시 무시하고 재-probe"),
      },
    },
    async ({ refresh }) => {
      const caps = await getCapabilities(refresh === true);
      return readResult("studio_capabilities", caps, JSON.stringify(caps, null, 2));
    },
  );
}
