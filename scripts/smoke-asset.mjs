// 라이브 asset import 가드 스모크 — 잘못된 assetid 로 import 를 시도해
// RPC 변이 가드(백업→실패→롤백)가 실 Studio 에서 월드를 깨지 않고 처리하는지 검증한다.
//   OVERDARE_PROJECT_CWD=<world dir> node scripts/smoke-asset.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { call } from "../dist/rpc/client.js";
import { config } from "../dist/config.js";
import { resolveOvdrjmPath } from "../dist/ovdrjm/document.js";
import { applyRpcMutation } from "../dist/ovdrjm/rpc-mutation.js";
import { getCapabilities } from "../dist/capability/capabilities.js";

const { ovdrjmPath } = resolveOvdrjmPath(config.projectCwd);
const fp = () => createHash("sha256").update(readFileSync(ovdrjmPath)).digest("hex");

const caps = await getCapabilities();
console.log("[cap] asset_drawer.import supported:", caps.methods["asset_drawer.import"].supported);

const before = fp();
let threw = false;
try {
  // 존재하지 않는 자산 → Studio 가 거부 → 가드가 롤백
  await applyRpcMutation(
    "asset_drawer.import",
    { assetid: "ovdrassetid://999999999", assetName: "__smoke_bogus__", assetType: "MODEL" },
    { backup: true },
  );
  console.log("[!] 예상과 달리 성공함(가짜 자산이 임포트됨?) — 확인 필요");
} catch (e) {
  threw = true;
  console.log("[guard] 실패를 구조적으로 처리:", e.name, "/ stage:", e.stage, "/ rollbackComplete:", e.rollbackComplete);
}

const after = fp();
console.log("[world] 시작==종료 동일:", before === after);
if (before !== after) { console.error("✗ 월드 파일이 변경됨!"); process.exit(1); }
console.log(threw ? "ASSET GUARD SMOKE OK" : "ASSET GUARD SMOKE: 임포트가 성공함(가짜 id가 유효했음?)");
