# Changelog

본 프로젝트는 [Keep a Changelog](https://keepachangelog.com/) 와
[Semantic Versioning](https://semver.org/) 을 따른다.

## [Unreleased]

**Phase 4 완료** (asset import / action sequencer / publish). 기존 Stable Tool Contract / 파이프라인 위에 확장.

### Added
- **인프라 `applyRpcMutation`** — 직접 RPC 변이용 백업 가드(applyWrite 의 형제, 같은 write lock 공유).
  성공 시 level.save.file 영속화, 실패 시 백업 복원 + level.apply 롤백.
- **인프라 `pathGuard`** (`src/security/path-guard.ts`) — 파일경로 입력 보안 게이트.
  realpath(심링크 해소) + 프로젝트 경계 + 확장자 화이트리스트. Path Traversal / Symlink escape 차단.
- **`studio_import_model`** (asset_drawer.import) — 에셋 스토어 모델 임포트(ovdrassetid). 백업 가드.
- **`studio_import_image`** (asset_manager.image.import) — 로컬 이미지 임포트. **pathGuard 적용**.
- **`studio_apply_action_sequence`** (action_sequencer_service.apply_json) — ActionSequencer 인스턴스에
  시퀀서 JSON 적용. jsonFilePath **pathGuard(.json)** + 백업 가드. instanceGuid 는 Studio 검증.
- **`studio_publish`** (level.publish) — **비가역·외부공개. 실수 발사 방지 최우선 설계.**
  실제 호출은 **4중 게이트**(capability && OVERDARE_ALLOW_PUBLISH=1 && confirm===true && dryRun===false) 전부
  충족 시에만. 하나라도 빠지면 RPC 미호출. 기본 dry-run. 롤백 없음. **Replay 영구 제외**.
  -32009(유저 취소)는 stage=canceled, 재시도 금지.
- 테스트: path-guard 11 + rpc-mutation 4 + publish 게이트 6 (총 71). 라이브 가드 스모크
  (`smoke-asset.mjs`, `smoke-sequencer.mjs`, `smoke-publish.mjs` — 실제 publish 미발사).

### Notes
- Phase 4 완료 — 13개 도구. 다음 마일스톤 태그(v0.3.0) 는 별도 판단.

## [0.2.0-alpha.1] - 2026-06-29

CRUD 완성 마일스톤. Create/Read/Update/Delete 가 모두 Stable Tool Contract 위에서
실 Studio 까지 end-to-end 검증됐다. + Studio 호환성을 위한 Capability Layer.

### Added
- **update_part** (`studio_update_part`) — 이름/속성 부분 업데이트.
  - update 는 default 없는 부분 스키마 사용 — 미지정 필드 보존(부분 업데이트 footgun 회피).
- **delete** (`studio_delete`) — 인스턴스 삭제(자식 포함). 없는 GUID 에러, 서비스 삭제 차단.
- **Capability Layer** (`studio_capabilities` + `src/capability/`) — 시작 시(또는 첫 사용 시) Studio RPC
  기능 지원 여부를 probe·캐시. `-32002`=미지원. `level.publish` 는 probe 가 실제 publish 라 제외(낙관적).
  미지원 기능은 `UnsupportedCapabilityError` 를 Stable Tool Contract(`error.stage="capability"`)로 반환.
- Golden 테스트: `before.ovdrjm` → `expected-update.ovdrjm` / `expected-delete.ovdrjm` 의미적 검증.
- 라이브 스모크 `smoke-update-delete.mjs`. 테스트 총 50개.

### Notes
- 두 CRUD 도구·capability 모두 Stable Tool Contract 그대로(새 반환형식 없음).
- `studioVersion` 은 RPC 버전 메서드 부재로 현재 `null`(TODO: 버전 메서드 발견 시 채움).
- Phase 4(asset import / action sequencer / publish) 설계 문서: `docs/Phase4-Design.md`.

## [0.1.0-rc.1] - 2026-06-29

첫 Release Candidate. 기능 추가가 아닌 품질/기반 안정화 단계.

### Added
- **Phase 1 — 읽기**: `studio_browse`, `studio_screenshot`, `studio_apply`, `studio_save`.
- **Phase 1 — RPC 클라이언트**: 13377 줄단위 JSON-RPC 2.0 트랜스포트.
- **Phase 2 — 쓰기**: `studio_create_part`, `studio_add_script`.
- **쓰기 파이프라인**: `applyWrite` — backup → modify → validate → level.apply → level.save.file,
  실패 시 자동 rollback. `--unsafe` 일 때만 백업/롤백 생략.
- **.ovdrjm 코덱/문서 모델**: BOM 처리 + `JSON.stringify(...,2)` 직렬화, 노드 빌더,
  zod 속성 스키마(Part 등).
- **Recorder + Replay Mode**: `OVERDARE_MCP_TRACE`/`_DIR`/`_LABEL`,
  `rpc.jsonl`/`session.json`/`metadata.json`/`ovdrjm.diff`, `npm run replay`(shape 드리프트 감지).
- **검증**: vitest 27개(GOLDEN `create_part` 포함), 라이브 원자적 쓰기 스모크(`npm run smoke:write`).
- **문서**: README, `docs/Architecture.md`, `docs/TOOLS.md`(자동 생성),
  CONTRIBUTING. CI(GitHub Actions).

### Security / Reliability
- `hub.token.read` 의 JWT 가 trace 파일에 저장되지 않도록 `<redacted>` 마스킹.
- 쓰기 파이프라인 강화 (코드리뷰 P0/P1):
  - **Write lock** — `.ovdrjm` 변이 직렬화.
  - **TOCTOU 가드** — read/write 지문(mtime+size+sha256) 비교, 외부 변경 시 `WriteError("conflict")`.
  - **Atomic write** — tmp→fsync→rename, 부분기록 방지.
  - write 전/후 실패 구분 — 미기록 실패는 복원 안 함(외부 변경 보존), 기록 후 실패만 롤백.
  - `WriteError.rollbackComplete` + Recorder 에 롤백 성공/실패 기록.
  - `applyWrite`/rollback 단위 테스트 + write-lock 테스트 추가.
- 품질 (코드리뷰 P1):
  - **Stable Tool Contract** — 모든 도구가 공통 `ToolResult`(`success/operation/affected/rollbackComplete/warnings/data/metadata/error`)를
    `structuredContent` 로 반환. 실패도 throw 없이 구조화. (`src/tools/result.ts`, v1.x 안정 API)
  - **P1-5** create/add 도구가 생성 guid 를 `affected[]` 로 구조화 반환.
  - **P1-4** Recorder `session.json` 을 RPC 마다 전체 재기록(O(n²)) → 종료 시 1회 flush. `rpc.jsonl` 는 실시간 append.
  - **P1-3** 백업을 `.overdare-backups/` 하위 + 고유명(충돌방지), 작업 종료 시 정리(누적 방지).
  - 테스트 총 39개.

### Notes
- 비공식 로컬 프로토콜. Studio 업데이트 시 변경 가능 — `npm run replay` 로 감지.
- 검증 시점: 2026-06-29 (OVERDARE Studio 데스크톱 빌드).

[0.1.0-rc.1]: https://example.com/overdare-studio-mcp/releases/tag/v0.1.0-rc.1
