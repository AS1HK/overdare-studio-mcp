# Architecture

## 개요

`overdare-studio-mcp` 는 Claude(또는 MCP 호환 클라이언트)가 OVERDARE Studio 를 조작하게 하는
MCP 서버다. 두 개의 채널을 사용한다:

1. **Studio RPC** — Studio 가 여는 로컬 TCP 포트(`127.0.0.1:13377`)에 줄단위 JSON-RPC 2.0.
2. **.ovdrjm 파일** — 월드 파일(평문 JSON). 인스턴스/스크립트 생성·수정은 이 파일을 편집한 뒤
   `level.apply`/`level.save.file` RPC 로 Studio 에 반영한다.

## 모듈 맵

```
src/
  config.ts            환경변수/플래그 (host/port/timeout/cwd/unsafe/trace)
  rpc/
    transport.ts       생 TCP, 요청 1줄 → 응답 1줄
    client.ts          JSON-RPC envelope + Recorder 연동
    errors.ts          RpcError / RpcTransportError
  ovdrjm/
    codec.ts           decode/encode/serialize (BOM·JSON.stringify)
    document.ts        파싱/탐색/노드 생성(buildAddedNode)/경로 해석
    schemas.ts         zod 속성 스키마(Part 등)
    normalize.ts       스크립트 소스 정규화(4스페이스→탭, 줄끝)
    validate.ts        구조 무결성 검증
    backup.ts          백업/복원
    pipeline.ts        쓰기 단일 진입점 applyWrite (+ rollback)
  scene/
    guid.ts            browse 트리 탐색(guid/name)
    browse.ts          level.browse 후처리(startGuid/classType/maxDepth)
    insert.ts          인스턴스/스크립트 삽입
  tools/               MCP 도구(읽기 4 + 쓰기 2)
  trace/recorder.ts    Recorder + Replay 파일 기록
  server/index.ts      MCP 서버 엔트리(stdio)
```

## 데이터 흐름

### 읽기 (예: studio_browse)
```
tool → rpc.call("level.browse") → TCP 13377 → Studio
     ← {level:[...]} → scene.postProcess(filter) → text content
```

### 쓰기 (create_part / add_script) — 강제 파이프라인
```
applyWrite(modify):
  (write lock 획득)         # 변이 직렬화 — 동시 호출 차단
  1. backup                 # .ovdrjm 스냅샷 (--unsafe 면 생략)
     read + fingerprint     # mtime+size+sha256 캡처
  2. modify                 # in-memory 트리 편집 (insert.*)
  3. validate               # Root/필수필드/GUID중복/ObjectKey 검사
     conflict 재확인        # write 직전 fingerprint 재비교 (외부 변경 감지)
     atomic write           # tmp → fsync → rename
  4. level.apply            # Studio 가 파일 재로드 → 라이브 씬 반영
  5. level.save.file        # .umap + .ovdrjm 저장
  (release)
```
**실패 처리 — write 전/후 구분**:
- write **이전** 실패(modify/validate/conflict/atomic-write)는 디스크를 안 건드렸으므로 **복원하지 않는다.**
  특히 `conflict` 는 외부 프로세스의 변경을 보존해야 하므로 복원 금지.
- write **이후** 실패(apply/save)만 backup 복원 + `level.apply` 로 롤백한다.
- 던지는 `WriteError` 에 `rollbackComplete`(파일복원 && 씬되돌림 성공 여부)를 담고, 메시지에도
  `(rollback: complete/INCOMPLETE)` 를 표기한다. Recorder 에도 성공/실패가 기록된다.
- `--unsafe`(config.unsafe) 일 때만 백업/롤백을 생략한다(자기 책임, `rollbackComplete=false`).

#### 동시성 / 원자성
- **쓰기 직렬화**: `ovdrjmWriteLock` 로 모든 변이를 한 줄로 줄세워 동시 쓰기를 막는다.
- **외부 동시수정 감지(TOCTOU)**: read/write 시점 지문(mtime+size+sha256)을 비교, 변경 감지 시 `WriteError("conflict")`.
- **원자적 파일 기록**: tmp 기록 → fsync → rename. 부분기록 노출을 막는다.

> atomic rename 은 POSIX 에서 atomic, Windows 에서는 `MoveFileEx(REPLACE_EXISTING)` 로 교체한다.
> 디렉터리 엔트리 영속화를 위한 dir fsync 는 비용/복잡도 대비 생략한다.

## Tool Result Contract (stable, v1.x)

모든 MCP 도구는 동일한 반환 계약을 따른다 — 사람용 `content[text]` + 기계용 `structuredContent: ToolResult`.
실패도 throw 하지 않고 `success:false` + `error{stage,message}` (+ 쓰기면 `rollbackComplete`)로 **구조화해 반환**한다.
공통 필드: `success / operation / affected[] / rollbackComplete? / warnings[] / data? / metadata? / error?`.
스키마 전문은 [TOOLS.md](./TOOLS.md) 의 "공통 반환 계약". 구현은 `src/tools/result.ts`(`readResult`/`runWriteTool`).

> 이 계약은 **v1.x 동안 깨지 않는 것을 목표**로 한다. Phase 3 의 모든 도구(update_part/delete/asset import/publish)도
> `runWriteTool`(쓰기) 또는 `readResult`(읽기)를 통해 동일 계약을 사용한다 — 도구별 데이터는 `data`/`metadata` 로만 확장한다.

## 에러 처리

| 종류 | 발생 | 비고 |
|---|---|---|
| `RpcTransportError` | 연결 실패/타임아웃/응답파싱 실패 | 사용자 메시지에 "Studio 실행 중인지 확인" 포함 |
| `RpcError(code, message)` | Studio 가 JSON-RPC error 반환 | 아래 코드표 |
| `WriteError(stage, message)` | 쓰기 파이프라인 단계 실패 | stage ∈ modify/validate/write/apply/save |

### Studio RPC 에러 코드 (관측값)
| 코드 | 의미 |
|---|---|
| `-32002` | Method not found (커스텀, 표준 -32601 아님) |
| `-32602` | Invalid params / 필수 누락 |
| `-32603` | Internal error |
| `-32001` | Invalid request format |
| `-32009` | 유저가 publish UI 에서 취소 (자동 재시도 금지) |

## 타임아웃 정책

| 대상 | 기본값 | 조정 |
|---|---|---|
| RPC 일반 | 30,000ms | `OVERDARE_RPC_TIMEOUT_MS`, 또는 `call(opts.timeoutMs)` |
| `game.screenshot` | 60,000ms | 도구 내부 고정(응답이 느림) |
| 동시접근 안정성 윈도우(smoke) | 400ms | `scripts/smoke-write.mjs` |

타임아웃 초과 시 `RpcTransportError` 로 reject 되고, 쓰기 중이면 rollback 이 수행된다.

## Recorder / Replay

`OVERDARE_MCP_TRACE=1` → stderr 사람용 trace. `OVERDARE_MCP_TRACE_DIR` 지정 시
`rpc.jsonl`/`session.json`/`metadata.json`/`ovdrjm.diff` 저장. `OVERDARE_MCP_TRACE_LABEL` 로 세션 태그.
`npm run replay <session.json>` 으로 재생, 응답 **shape** 비교로 프로토콜 드리프트 감지.
`hub.token.read` 의 JWT 는 trace 에 `<redacted>`.

## 원칙

- 확인되지 않은 RPC/스키마는 추가하지 않는다. 라이브로 검증된 동작만 구현한다.
- `.ovdrjm` 편집은 항상 실제 fixture 로 검증한다(`tests/ovdrjm.test.ts`, GOLDEN).
- 비공식 로컬 프로토콜이므로 Studio 업데이트 후 `npm run replay` 로 회귀를 확인한다.
