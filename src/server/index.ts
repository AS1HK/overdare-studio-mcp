#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { warmUpCapabilities } from "../capability/capabilities.js";
import { register as registerAddScript } from "../tools/addScript.js";
import { register as registerApply } from "../tools/apply.js";
import { register as registerApplySequence } from "../tools/applySequence.js";
import { register as registerBrowse } from "../tools/browse.js";
import { register as registerCapabilities } from "../tools/capabilities.js";
import { register as registerCreatePart } from "../tools/createPart.js";
import { register as registerDelete } from "../tools/delete.js";
import { register as registerImportImage } from "../tools/importImage.js";
import { register as registerImportModel } from "../tools/importModel.js";
import { register as registerPublish } from "../tools/publish.js";
import { register as registerSave } from "../tools/save.js";
import { register as registerScreenshot } from "../tools/screenshot.js";
import { register as registerUpdatePart } from "../tools/updatePart.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "overdare-studio-mcp",
    version: "0.1.0",
  });

  // Capability Layer (호환성 계층)
  registerCapabilities(server);
  // Phase 1: 읽기 + apply/save
  registerBrowse(server);
  registerScreenshot(server);
  registerApply(server);
  registerSave(server);
  // Phase 2: 쓰기 (backup→modify→validate→apply→save 파이프라인 + 자동 rollback)
  registerCreatePart(server);
  registerAddScript(server);
  // Phase 3: update / delete (계약·파이프라인 그대로 재사용)
  registerUpdatePart(server);
  registerDelete(server);
  // Phase 4: asset import (직접 RPC 변이 + 백업 가드/경로검증)
  registerImportModel(server);
  registerImportImage(server);
  registerApplySequence(server);
  // Phase 4: publish (4중 게이트 — 기본 dry-run, 비가역)
  registerPublish(server);

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Studio 가 떠 있으면 capability 를 미리 캐시(미실행이면 무시, 첫 사용 때 재시도)
  warmUpCapabilities();
}

main().catch((err) => {
  process.stderr.write(`[overdare-studio-mcp] fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
