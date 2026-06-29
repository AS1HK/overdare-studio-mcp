// 라이브 publish 가드 스모크 — 실제 publish 를 절대 수행하지 않는다.
// OVERDARE_ALLOW_PUBLISH 를 켜지 않은 상태에서 게이트가 RPC 를 발사하지 않음만 확인한다.
//   OVERDARE_PROJECT_CWD=<world dir> node scripts/smoke-publish.mjs
import { executePublish } from "../dist/tools/publish.js";

// 안전: 이 스모크에서는 절대 발사 금지 — env 강제 해제
delete process.env.OVERDARE_ALLOW_PUBLISH;

function published(r) {
  return r.structuredContent?.metadata?.published === true;
}

// case 1: 기본(dryRun) → 미리보기, 발사 안 함
const dry = await executePublish({ worldName: "smoke", confirm: true });
console.log("[dry-run] success:", dry.structuredContent.success, "/ dryRun:", dry.structuredContent.metadata.dryRun, "/ published:", published(dry));

// case 2: dryRun=false + confirm=true 지만 env 없음 → 차단(구조적), 발사 안 함
const blocked = await executePublish({ worldName: "smoke", confirm: true, dryRun: false });
console.log("[blocked] success:", blocked.structuredContent.success, "/ stage:", blocked.structuredContent.error?.stage, "/ unmet:", JSON.stringify(blocked.structuredContent.metadata.unmetGates), "/ published:", published(blocked));

if (published(dry) || published(blocked)) {
  console.error("✗ publish 가 발사됨! (게이트 실패)");
  process.exit(1);
}
console.log("PUBLISH GUARD SMOKE OK — 실제 publish 미발사 확인");
