// MCP 레벨 스모크: stdio로 서버 띄우고 tools/list + studio_browse 호출.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/server/index.js"],
});
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const res = await client.callTool({ name: "studio_browse", arguments: { maxDepth: 1 } });
const text = res.content[0].text;
const nodes = JSON.parse(text);
console.log("studio_browse ->", nodes.length, "top-level nodes:", nodes.map((n) => n.class).join(", "));

// Tool Contract: structuredContent 검증
const sc = res.structuredContent;
if (!sc || sc.success !== true || sc.operation !== "studio_browse" || !Array.isArray(sc.affected)) {
  throw new Error("structuredContent 계약 불일치: " + JSON.stringify(sc));
}
console.log("structuredContent OK ->", JSON.stringify({ success: sc.success, operation: sc.operation, affected: sc.affected.length, warnings: sc.warnings.length }));

await client.close();
console.log("MCP SMOKE OK");
