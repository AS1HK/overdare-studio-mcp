// MCP 도구 API 문서 생성 → docs/TOOLS.md
// 서버를 stdio 로 띄워 tools/list 의 inputSchema(JSON Schema)를 자동 추출하고,
// 큐레이트된 예제/반환 설명을 덧붙인다. (Studio 불필요 — 핸들러 호출 안 함)
import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const CURATED = {
  studio_browse: {
    example: { classType: "Part", maxDepth: 2 },
    returns: "텍스트(JSON). 노드 배열 `[{ guid, name, class, children?, filename? }]`.",
  },
  studio_screenshot: {
    example: {},
    returns: "텍스트(JSON). Studio 가 저장한 스크린샷 결과(파일 경로 등).",
  },
  studio_apply: {
    example: {},
    returns: "텍스트(JSON). `{ success: true, messages: [] }`.",
  },
  studio_save: {
    example: {},
    returns: "텍스트(JSON). `{ success: true }`. .umap + .ovdrjm 저장.",
  },
  studio_create_part: {
    example: {
      parentGuid: "0000000000000000000000000000WSPC",
      name: "MyPart",
      properties: { Size: { X: 4, Y: 1, Z: 4 }, Color: { R: 120, G: 200, B: 120 }, Material: "Plastic" },
    },
    returns: '텍스트. `Created Part "MyPart" (guid ...) under ...`. 실패 시 자동 rollback 후 에러.',
  },
  studio_import_model: {
    example: { assetid: "ovdrassetid://12345", assetName: "Tree", assetType: "MODEL" },
    returns: "텍스트 + structuredContent. 에셋 스토어 모델을 레벨에 임포트. 실패 시 자동 rollback. 미지원 시 capability 에러.",
  },
  studio_import_image: {
    example: { file: "/absolute/path/inside/project/logo.png" },
    returns: "텍스트 + structuredContent(data.assetId). 경로검증(경계/심링크/확장자) 후 임포트. 경계 밖이면 path 에러.",
  },
  studio_capabilities: {
    example: { refresh: false },
    returns: "structuredContent(data) = { probedAt, studioVersion, methods }.",
  },
  studio_apply_action_sequence: {
    example: { instanceGuid: "0000000000000000000000000000ASEQ", jsonFilePath: "/absolute/path/inside/project/seq.json" },
    returns: "텍스트 + structuredContent(affected:[{guid}]). jsonFilePath 경로검증(.json) 후 적용. 실패 시 rollback.",
  },
  studio_publish: {
    example: { worldName: "My World", category: ["TPS"], confirm: false, dryRun: true },
    returns: "비가역. 기본 dry-run(미발사). 실제 발사는 OVERDARE_ALLOW_PUBLISH=1 + confirm:true + dryRun:false 4중 게이트 충족 시에만. 미충족이면 success:false + metadata.unmetGates.",
  },
  studio_update_part: {
    example: {
      guid: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01",
      name: "RenamedPart",
      properties: { Color: { R: 200, G: 50, B: 50 }, Material: "Neon" },
    },
    returns: '텍스트 + structuredContent(affected). 부분 업데이트(전달 필드만 변경). 실패 시 자동 rollback.',
  },
  studio_delete: {
    example: { guid: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01" },
    returns: '텍스트 + structuredContent(affected). 자식 포함 삭제. 서비스는 삭제 불가. 실패 시 rollback.',
  },
  studio_add_script: {
    example: {
      parentGuid: "B19F8DF642807EC0846E32B3BF34B66E",
      scriptClass: "Script",
      name: "Main",
      source: "print('hello from OVERDARE')",
    },
    returns: '텍스트. `Added Script "Main" (guid ...) under ...`. 실패 시 자동 rollback 후 에러.',
  },
};

function renderSchema(schema) {
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const keys = Object.keys(props);
  if (keys.length === 0) return "_입력 없음._\n";
  let out = "| 필드 | 타입 | 필수 | 설명 |\n|---|---|---|---|\n";
  for (const k of keys) {
    const p = props[k] ?? {};
    const type = p.enum ? p.enum.map((e) => `\`${e}\``).join(" \\| ") : (p.type ?? (p.$ref ? "object" : "?"));
    const desc = (p.description ?? "").replace(/\|/g, "\\|");
    out += `| \`${k}\` | ${type} | ${required.has(k) ? "✓" : ""} | ${desc} |\n`;
  }
  return out;
}

const transport = new StdioClientTransport({ command: "node", args: ["dist/server/index.js"] });
const client = new Client({ name: "gen-api-docs", version: "0.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
await client.close();

const lines = [
  "# MCP Tools API",
  "",
  "> 이 문서는 `npm run gen:docs` 로 서버의 `tools/list` 에서 자동 생성된다. 직접 수정하지 말 것.",
  "",
  `도구 ${tools.length}개.`,
  "",
  "## 공통 반환 계약 (Tool Result Contract — stable, v1.x)",
  "",
  "모든 도구는 사람용 `content[text]` 와 함께 `structuredContent: ToolResult` 를 반환한다:",
  "",
  "```ts",
  "interface ToolResult {",
  "  success: boolean;               // 실패해도 throw 하지 않고 success:false 로 반환",
  "  operation: string;              // 도구 이름 (예: \"studio_create_part\")",
  "  affected: { guid: string; name?: string; class?: string }[]; // 영향받은 인스턴스(읽기는 [])",
  "  rollbackComplete?: boolean;     // 쓰기 실패 시 롤백 완료 여부",
  "  warnings: string[];",
  "  data?: unknown;                 // 도구별 주 결과(예: browse 트리)",
  "  metadata?: Record<string, unknown>;",
  "  error?: { stage?: string; message: string }; // success=false 일 때",
  "}",
  "```",
  "실패도 `success:false` + `error` 로 구조화되며 `isError:true` 로 표시된다(throw 안 함).",
  "Phase 3 의 모든 도구도 이 계약을 그대로 사용한다.",
  "",
];

for (const t of tools.sort((a, b) => a.name.localeCompare(b.name))) {
  const c = CURATED[t.name] ?? {};
  lines.push(`## \`${t.name}\``, "");
  lines.push(t.description ?? "", "");
  lines.push("### 입력 스키마", "", renderSchema(t.inputSchema), "");
  lines.push("### 예제", "", "```json", JSON.stringify(c.example ?? {}, null, 2), "```", "");
  lines.push("### 반환", "", c.returns ?? "텍스트.", "");
}

writeFileSync("docs/TOOLS.md", lines.join("\n"));
console.log(`docs/TOOLS.md 생성 (도구 ${tools.length}개)`);
