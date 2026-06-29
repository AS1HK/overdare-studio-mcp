/**
 * 런타임 설정 — 환경변수 / argv 로 주입.
 * 기본값은 Studio 가 여는 로컬 RPC 엔드포인트(127.0.0.1:13377)에 맞춘다.
 */
export const config = {
  /** Studio JSON-RPC 호스트 (STUDIO_HOST, 기본 127.0.0.1) */
  host: process.env.STUDIO_HOST ?? "127.0.0.1",
  /** Studio JSON-RPC 포트 (STUDIO_PORT, 기본 13377) */
  port: Number(process.env.STUDIO_PORT ?? 13377),
  /** RPC 타임아웃(ms) */
  rpcTimeoutMs: Number(process.env.OVERDARE_RPC_TIMEOUT_MS ?? 30000),
  /** .ovdrjm 를 찾을 프로젝트 디렉터리 (Studio가 연 월드의 cwd). 쓰기(Phase 2~)에 필요. */
  projectCwd: process.env.OVERDARE_PROJECT_CWD ?? process.cwd(),
  /** 쓰기 시 백업 생략 허용 (명시적 --unsafe / OVERDARE_UNSAFE=1 일 때만) */
  unsafe: process.argv.includes("--unsafe") || process.env.OVERDARE_UNSAFE === "1",
  /** Recorder(trace) 활성화 (OVERDARE_MCP_TRACE=1) */
  trace: process.env.OVERDARE_MCP_TRACE === "1",
  /** 구조화 trace 저장 디렉터리 (OVERDARE_MCP_TRACE_DIR=.trace). 지정 시 replay용 파일 기록. */
  traceDir: process.env.OVERDARE_MCP_TRACE_DIR,
  /** 세션 태그 (OVERDARE_MCP_TRACE_LABEL=live-smoke). session.json/metadata.json 에 기록. */
  traceLabel: process.env.OVERDARE_MCP_TRACE_LABEL,
} as const;
