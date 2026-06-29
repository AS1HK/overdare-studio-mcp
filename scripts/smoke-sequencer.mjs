// 라이브 action_sequencer 가드 스모크 — 실제 .json + 가짜 instanceGuid 로 적용을 시도해
// pathGuard 통과 + RPC 변이 가드(백업→실패→롤백)가 월드를 깨지 않는지 검증한다.
//   OVERDARE_PROJECT_CWD=<world dir> node scripts/smoke-sequencer.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { call } from "../dist/rpc/client.js";
import { config } from "../dist/config.js";
import { resolveOvdrjmPath } from "../dist/ovdrjm/document.js";
import { applyRpcMutation } from "../dist/ovdrjm/rpc-mutation.js";
import { validatePath, JSON_EXTENSIONS, PathSecurityError } from "../dist/security/path-guard.js";
import { getCapabilities } from "../dist/capability/capabilities.js";

const { ovdrjmPath } = resolveOvdrjmPath(config.projectCwd);
const fp = () => createHash("sha256").update(readFileSync(ovdrjmPath)).digest("hex");

const caps = await getCapabilities();
console.log("[cap] action_sequencer.apply_json supported:", caps.methods["action_sequencer_service.apply_json"].supported);

// pathGuard: 경계 밖/잘못된 확장자 거부 확인
try { validatePath("/etc/passwd", { extensions: JSON_EXTENSIONS }); console.log("[!] 경계검사 실패"); }
catch (e) { console.log("[pathGuard] 경계 밖 거부:", e instanceof PathSecurityError ? e.reason : e.message); }

// 프로젝트 경계 안에 실제 .json 생성 (pathGuard 통과해야 함)
const seqPath = join(config.projectCwd, "__smoke_seq.json");
writeFileSync(seqPath, JSON.stringify({ steps: [] }));

const before = fp();
let threw = false;
try {
  const real = validatePath(seqPath, { extensions: JSON_EXTENSIONS });
  console.log("[pathGuard] 통과:", real.endsWith("__smoke_seq.json"));
  // 가짜 instanceGuid → Studio 거부 → 가드 롤백
  await applyRpcMutation(
    "action_sequencer_service.apply_json",
    { instanceGuid: "BOGUSGUIDBOGUSGUIDBOGUSGUID00000", jsonFilePath: real },
    { backup: true },
  );
  console.log("[!] 예상과 달리 성공함 — 확인 필요");
} catch (e) {
  threw = true;
  console.log("[guard] 구조적 처리:", e.name, "/ stage:", e.stage, "/ rollbackComplete:", e.rollbackComplete);
} finally {
  try { unlinkSync(seqPath); } catch {}
}

const after = fp();
console.log("[world] 시작==종료 동일:", before === after);
if (before !== after) { console.error("✗ 월드 변경됨!"); process.exit(1); }
console.log(threw ? "SEQUENCER GUARD SMOKE OK" : "SEQUENCER SMOKE: 적용이 성공함(?)");
