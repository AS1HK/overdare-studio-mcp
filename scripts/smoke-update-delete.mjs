// 라이브 update_part + delete 스모크 — 임시 Part 생성→수정→삭제를 실 Studio 에서 원자적 검증.
// 항상 백업 원복으로 끝나 월드를 그대로 유지한다.
//   OVERDARE_PROJECT_CWD=<world dir> node scripts/smoke-update-delete.mjs
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { call } from "../dist/rpc/client.js";
import { config } from "../dist/config.js";
import { resolveOvdrjmPath } from "../dist/ovdrjm/document.js";
import { createBackup, discardBackup, restoreBackup } from "../dist/ovdrjm/backup.js";
import { applyWrite } from "../dist/ovdrjm/pipeline.js";
import { insertInstance } from "../dist/scene/insert.js";
import { updateInstance } from "../dist/scene/update.js";
import { deleteInstance } from "../dist/scene/delete.js";
import { partProperties, partPropertiesUpdate } from "../dist/ovdrjm/schemas.js";

const GUID = "4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m, c = 1) => { console.error(`\n✗ FAIL: ${m}`); process.exitCode = c; throw new Error(m); };
const fp = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const walk = (ns, fn) => { for (const n of ns) { fn(n); if (n.children) walk(n.children, fn); } };
const find = (lvl, g) => { let h = null; walk(lvl, (n) => { if (n.guid === g) h = n; }); return h; };
const wsGuid = (lvl) => { let g = null; walk(lvl, (n) => { if (n.class === "Workspace") g = n.guid; }); return g; };

const { ovdrjmPath } = resolveOvdrjmPath(config.projectCwd);
console.log(`world: ${ovdrjmPath}\n`);

console.log("[0] 동시접근 감지...");
const a = fp(ovdrjmPath); await sleep(400);
if (a !== fp(ovdrjmPath)) fail("동시 수정 감지 — 중단", 3);
console.log("    안정\n");

let backup = null, reverted = false;
const revert = async () => {
  if (reverted || !backup) return;
  restoreBackup(backup); await call("level.apply"); await call("level.save.file"); reverted = true;
};

try {
  backup = createBackup([ovdrjmPath]);
  const ws = wsGuid((await call("level.browse")).level);
  if (!ws) fail("Workspace 못 찾음");

  // create
  await applyWrite((doc) => insertInstance(doc, ws, "Part", "SmokeUD", partProperties.parse({ Material: "Plastic" }), GUID));
  if (!find((await call("level.browse")).level, GUID)) fail("create 후 미발견");
  console.log("[1] create ✓");

  // update (rename + color)
  await applyWrite((doc) => updateInstance(doc, GUID, { name: "SmokeUD2", properties: partPropertiesUpdate.parse({ Color: { R: 10, G: 20, B: 30 } }) }));
  const upd = find((await call("level.browse")).level, GUID);
  if (!upd || upd.name !== "SmokeUD2") fail(`update 후 이름 불일치: ${upd?.name}`);
  console.log("[2] update ✓ (renamed -> SmokeUD2)");

  // delete
  await applyWrite((doc) => deleteInstance(doc, GUID));
  if (find((await call("level.browse")).level, GUID)) fail("delete 후에도 존재");
  console.log("[3] delete ✓ (소멸 확인)");

  console.log("\nLIVE UPDATE/DELETE SMOKE OK");
} finally {
  try { await revert(); } catch (e) { console.error("rollback 실패!", e?.message); process.exitCode = 2; }
  if (backup) discardBackup(backup);
}
