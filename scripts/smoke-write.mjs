// 라이브 원자적 쓰기 스모크 — create_part + rollback 파이프라인의 첫 end-to-end 증거.
//
// 절차(요구사항 1-7):
//   0. 동시 접근 감지(다른 프로세스가 같은 .ovdrjm 를 쓰는 중이면 중단)
//   1. 시작 .ovdrjm 자동 백업 (원자적 복원 스냅샷)
//   2. Workspace 에 식별 가능한 임시 Part 1개 생성 (applyWrite 파이프라인 사용)
//   3. level.apply 후 level.browse 로 GUID+Name 실제 존재 확인
//   4. 즉시 rollback (백업 복원)
//   5. level.apply + level.save.file 재호출
//   6. level.browse 재호출 → 임시 Part 완전 소멸 확인
//   7. 시작/종료 월드 구조 의미적 동일 검증
// 성공/실패 무관하게 finally 에서 항상 rollback 보장.
//
// 실행: OVERDARE_PROJECT_CWD=<world dir> node scripts/smoke-write.mjs
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { call } from "../dist/rpc/client.js";
import { config } from "../dist/config.js";
import { resolveOvdrjmPath } from "../dist/ovdrjm/document.js";
import { createBackup, discardBackup, restoreBackup } from "../dist/ovdrjm/backup.js";
import { applyWrite } from "../dist/ovdrjm/pipeline.js";
import { insertInstance } from "../dist/scene/insert.js";
import { partProperties } from "../dist/ovdrjm/schemas.js";

const TEMP_NAME = "__MCP_LIVE_SMOKE_DELETE_ME__";
const TEMP_GUID = "5E5E5E5E5E5E5E5E5E5E5E5E5E5E5E5E"; // 식별용 고정 GUID
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg, code = 1) => { console.error(`\n✗ FAIL: ${msg}`); process.exitCode = code; throw new Error(msg); };

function fingerprint(p) {
  const s = statSync(p);
  return { mtimeMs: s.mtimeMs, size: s.size, hash: createHash("sha256").update(readFileSync(p)).digest("hex") };
}
function walk(nodes, fn) { for (const n of nodes) { fn(n); if (n.children) walk(n.children, fn); } }
function findInTree(level, guid) { let hit = null; walk(level, (n) => { if (n.guid === guid) hit = n; }); return hit; }
function findWorkspaceGuid(level) { let g = null; walk(level, (n) => { if (n.class === "Workspace") g = n.guid; }); return g; }
function normalizeTree(nodes) {
  return [...nodes]
    .map((n) => ({ guid: n.guid, name: n.name, class: n.class, children: n.children ? normalizeTree(n.children) : undefined }))
    .sort((a, b) => a.guid.localeCompare(b.guid));
}

const { ovdrjmPath } = resolveOvdrjmPath(config.projectCwd);
console.log(`world: ${ovdrjmPath}`);
console.log(`cwd:   ${config.projectCwd}\n`);

// 0. 동시 접근 감지: 안정성 윈도우 동안 파일이 바뀌면 누군가 쓰는 중 → 중단
console.log("[0] 동시 접근 감지 (안정성 윈도우 400ms)...");
const f0 = fingerprint(ovdrjmPath);
await sleep(400);
const f1 = fingerprint(ovdrjmPath);
if (f0.hash !== f1.hash) {
  fail("동시 수정 감지 — 다른 프로세스가 .ovdrjm 를 쓰는 중. 테스트 중단.", 3);
}
console.log("    안정 — 단독 접근 확인\n");

let startBackup = null;
let reverted = false;

async function revert(reason) {
  if (reverted || !startBackup) return;
  console.log(`[rollback] ${reason}`);
  restoreBackup(startBackup);          // 4. 파일 복원
  await call("level.apply");            // 5. 라이브 씬 복원 + 저장
  await call("level.save.file");
  reverted = true;
}

try {
  // 1. 시작 백업 + 시작 월드 구조
  startBackup = createBackup([ovdrjmPath]);
  const startLevel = (await call("level.browse")).level;
  const wsGuid = findWorkspaceGuid(startLevel);
  if (!wsGuid) fail("Workspace GUID 를 못 찾음");
  console.log(`[1] 시작 백업 완료, Workspace=${wsGuid}\n`);

  // 2. 임시 Part 생성 (실제 쓰기 파이프라인 backup→modify→validate→apply→save)
  console.log("[2] create_part (파이프라인)...");
  const props = partProperties.parse({ Size: { X: 2, Y: 2, Z: 2 }, Material: "Neon" });
  await applyWrite((doc) => insertInstance(doc, wsGuid, "Part", TEMP_NAME, props, TEMP_GUID));
  console.log("    생성 완료\n");

  // 3. apply 후 browse 로 실재 확인
  const afterCreate = (await call("level.browse")).level;
  const node = findInTree(afterCreate, TEMP_GUID);
  if (!node) fail("생성한 임시 Part 가 browse 에 없음 (GUID 미발견)");
  if (node.name !== TEMP_NAME) fail(`임시 Part 이름 불일치: ${node.name}`);
  console.log(`[3] 실재 확인 ✓ (guid=${node.guid}, name=${node.name}, class=${node.class})\n`);

  // 4+5. 즉시 rollback
  await revert("임시 Part 제거");
  console.log("[4+5] rollback + apply + save 완료\n");

  // 6. browse 재확인 → 완전 소멸
  const afterRevert = (await call("level.browse")).level;
  if (findInTree(afterRevert, TEMP_GUID)) fail("rollback 후에도 임시 Part 가 남아있음");
  console.log("[6] 소멸 확인 ✓\n");

  // 7. 시작/종료 구조 의미적 동일
  const a = JSON.stringify(normalizeTree(startLevel));
  const b = JSON.stringify(normalizeTree(afterRevert));
  if (a !== b) fail("시작/종료 월드 구조가 다름 (의미적 불일치)");
  console.log("[7] 시작=종료 월드 구조 동일 ✓\n");

  console.log("LIVE SMOKE OK — create_part + rollback 파이프라인 실 Studio 검증 통과");
} finally {
  // 성공/실패 무관 항상 복원
  try { await revert("finally 보장 복원"); } catch (e) { console.error("rollback 실패!", e?.message); process.exitCode = 2; }
  // 이번 실행에서 만든 백업 정리 (pipeline 백업은 self-clean)
  if (startBackup) discardBackup(startBackup);
}
