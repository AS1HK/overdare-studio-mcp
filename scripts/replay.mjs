// Replay Mode — 기록된 세션의 RPC를 라이브 Studio에 재생하고 응답 shape를 비교해
// Studio 업데이트 이후 프로토콜 변경(드리프트)을 감지한다.
//
//   npm run replay .trace/session.json        # 읽기 메서드만 재생(안전)
//   npm run replay .trace/session.json --all   # 모든 메서드 재생(변이 포함, 주의)
//
// 비교는 "값"이 아니라 "shape(키/타입 구조)"로 한다 — 월드 데이터는 바뀌어도 프로토콜은 그대로이므로.
import { readFileSync } from "node:fs";
import { call } from "../dist/rpc/client.js";

const SAFE_METHODS = new Set(["level.browse", "hub.token.read"]);
// 비가역·외부공개 — replay 에서 영구 제외(--all 로도 재생 금지).
const NEVER_REPLAY = new Set(["level.publish"]);

const args = process.argv.slice(2);
const all = args.includes("--all");
const dry = args.includes("--dry"); // CI용: 라이브 Studio 없이 세션 파싱 + shape 계산만 검증
const sessionPath = args.find((a) => !a.startsWith("--")) ?? ".trace/session.json";

const session = JSON.parse(readFileSync(sessionPath, "utf-8"));
const calls = session.calls ?? [];

function shape(v) {
  if (Array.isArray(v)) return v.length ? ["array", shape(v[0])] : ["array[]"];
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = shape(v[k]);
    return o;
  }
  return typeof v;
}
const sig = (v) => JSON.stringify(shape(v));

let ok = 0;
let drift = 0;
let skipped = 0;

// --dry: 네트워크 없이 세션 무결성 + shape 계산만 검증 (CI replay-only smoke)
if (dry) {
  if (!Array.isArray(calls) || calls.length === 0) {
    console.error(`✗ session 에 calls 가 없음: ${sessionPath}`);
    process.exit(1);
  }
  let bad = 0;
  for (const c of calls) {
    if (typeof c.method !== "string") { bad++; continue; }
    if (!("result" in c) && !("error" in c)) { bad++; continue; }
    try { sig(c.result ?? null); } catch { bad++; }
  }
  console.log(`[dry] session ${sessionPath} — calls ${calls.length}, label ${session.label ?? "(none)"}, invalid ${bad}`);
  process.exit(bad > 0 ? 1 : 0);
}

console.log(`Replaying ${calls.length} calls from ${sessionPath}${all ? " (--all)" : " (read-only)"}\n`);

for (const c of calls) {
  if (NEVER_REPLAY.has(c.method)) {
    console.log(`· SKIP   ${c.method} (영구 제외 — 비가역)`);
    skipped++;
    continue;
  }
  if (!all && !SAFE_METHODS.has(c.method)) {
    console.log(`· SKIP   ${c.method} (mutating/unsafe — use --all to force)`);
    skipped++;
    continue;
  }
  const params = c.params ?? undefined;
  try {
    const live = await call(c.method, params);
    if (c.error) {
      console.log(`⚠ DRIFT  ${c.method}: 이전엔 error, 지금은 success`);
      drift++;
      continue;
    }
    if (sig(live) === sig(c.result)) {
      console.log(`✓ OK     ${c.method}`);
      ok++;
    } else {
      console.log(`⚠ DRIFT  ${c.method}: 응답 shape 변경`);
      console.log(`    was: ${sig(c.result)}`);
      console.log(`    now: ${sig(live)}`);
      drift++;
    }
  } catch (err) {
    const code = err?.code;
    if (c.error && c.error.code === code) {
      console.log(`✓ OK     ${c.method} (동일 에러코드 ${code})`);
      ok++;
    } else {
      console.log(`⚠ DRIFT  ${c.method}: ${err?.message ?? err}`);
      drift++;
    }
  }
}

console.log(`\nReplay 완료 — OK ${ok}, DRIFT ${drift}, SKIP ${skipped}`);
process.exit(drift > 0 ? 1 : 0);
