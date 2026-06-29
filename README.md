# overdare-studio-mcp

**Claude 로 OVERDARE Studio 를 조작하는 MCP 서버.** Claude Desktop 이나 Claude Code 에서
"Workspace 에 빨간 큐브 만들어줘" 처럼 말하면, 실제 Studio 월드에 파트·스크립트를 만들고
수정하고 삭제한다.

> ⚠️ **비공식 프로젝트** — OVERDARE 와 무관하며 공식 지원이 아닙니다. Studio 가 여는 로컬 포트를
> 사용하므로 Studio 업데이트로 동작이 바뀔 수 있습니다(`npm run replay` 로 감지). 로컬 단일 사용자용.

---

## ⏱️ 5분 빠른 시작

**0. 준비** — OVERDARE Studio 를 실행하고 월드를 하나 열어둔다. (Node.js 20+ 필요)

**1. 빌드**
```bash
git clone <this-repo> overdare-studio-mcp && cd overdare-studio-mcp
npm install
npm run build
```

**2. Claude 에 연결** (둘 중 하나)

Claude Code:
```bash
claude mcp add overdare-studio -- node /절대경로/overdare-studio-mcp/dist/server/index.js
```

Claude Desktop — `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "overdare-studio": {
      "command": "node",
      "args": ["/절대경로/overdare-studio-mcp/dist/server/index.js"],
      "env": {
        "OVERDARE_PROJECT_CWD": "/절대경로/내-월드-폴더"
      }
    }
  }
}
```
> `OVERDARE_PROJECT_CWD` 는 `.umap`/`.ovdrjm` 월드 파일이 있는 폴더. **쓰기 도구에 필요**(읽기는 없어도 됨).

**3. 첫 도구 호출** — Claude 에게:
- *"OVERDARE 월드 구조 보여줘"* → `studio_browse` 로 트리를 가져온다.
- *"Workspace 에 2×2×2 네온 큐브 'Hello' 만들어줘"* → `studio_create_part` 로 실제 생성.

끝. 생성/수정/삭제는 자동으로 백업되고, 실패하면 롤백된다.

---

## 주요 기능

- **CRUD** — 인스턴스 생성/조회/수정/삭제 + 스크립트 추가. 자연어로.
- **안전한 쓰기** — 모든 변경이 `backup → 수정 → 검증 → 적용 → 저장` 파이프라인을 거치고, 실패 시 자동 롤백.
- **자산 임포트** — 에셋 스토어 모델 + 로컬 이미지(경로 보안 검증).
- **퍼블리시 가드** — 비가역 publish 는 4중 게이트로 보호(실수 발사 방지).
- **Recorder / Replay** — 모든 RPC 를 기록하고, Studio 업데이트 후 프로토콜 변경을 감지.
- **Capability Layer** — 지원하지 않는 기능은 호출 시 구조적 에러로 알림.

---

## 지원 도구 (13)

| 도구 | 하는 일 |
|---|---|
| `studio_browse` | 월드 인스턴스 트리 조회 (필터/깊이 지원) |
| `studio_screenshot` | 뷰포트 스크린샷 |
| `studio_create_part` | Part 생성 (Size/CFrame/Color/Material/Anchored 등) |
| `studio_update_part` | 인스턴스 이름/속성 부분 수정 |
| `studio_delete` | 인스턴스 삭제 (자식 포함, 서비스 보호) |
| `studio_add_script` | Script/LocalScript/ModuleScript 추가 |
| `studio_import_model` | 에셋 스토어 모델 임포트 |
| `studio_import_image` | 로컬 이미지 임포트 (경로 검증) |
| `studio_apply_action_sequence` | ActionSequencer 에 시퀀서 JSON 적용 |
| `studio_apply` / `studio_save` | 변경 적용 / 월드 저장 |
| `studio_publish` | 월드 퍼블리시 (기본 dry-run, 4중 게이트) |
| `studio_capabilities` | Studio 기능 지원 여부 보고 |

도구별 입력 스키마/예제/반환은 [docs/TOOLS.md](docs/TOOLS.md) 참고. 모든 도구는 동일한
`ToolResult`(success/operation/affected/warnings/data/error) 를 `structuredContent` 로 반환한다.

---

## 안전장치

### 쓰기 파이프라인 + 자동 롤백
모든 `.ovdrjm` 변경은 강제로 다음 순서를 거친다:
```
백업 → 수정 → 검증 → level.apply → level.save.file
```
어느 단계든 실패하면 백업에서 복원하고 라이브 씬을 되돌린다. 동시 외부 수정도 감지해 중단한다.
`--unsafe`(또는 `OVERDARE_UNSAFE=1`) 일 때만 백업을 생략한다(롤백 불가).

### Publish 가드 (비가역 작업)
`studio_publish` 는 **기본이 dry-run(미리보기)**. 실제 발사는 아래 4개가 **모두** 충족돼야 한다:
```
capability 지원  +  OVERDARE_ALLOW_PUBLISH=1  +  confirm:true  +  dryRun:false
```
하나라도 빠지면 RPC 를 호출하지 않고, 미충족 게이트를 구조적으로 보고한다.

### Recorder / Replay
`OVERDARE_MCP_TRACE=1` 으로 trace 를 stderr 에 출력하고, `OVERDARE_MCP_TRACE_DIR=.trace` 로
`rpc.jsonl`/`session.json`/`metadata.json`/`ovdrjm.diff` 를 저장한다.
```bash
npm run replay .trace/session.json   # 기록 세션을 재생해 프로토콜 변경(드리프트) 감지
```
응답의 shape(키/타입 구조)를 비교하므로 데이터 변경은 무시하고 프로토콜 변경만 잡는다.
(인증 토큰류는 trace 에 `<redacted>`.)

---

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `OVERDARE_PROJECT_CWD` | 현재 폴더 | `.ovdrjm` 월드가 있는 폴더 (쓰기에 필요) |
| `STUDIO_HOST` / `STUDIO_PORT` | `127.0.0.1` / `13377` | Studio RPC 엔드포인트 |
| `OVERDARE_RPC_TIMEOUT_MS` | `30000` | RPC 타임아웃 |
| `OVERDARE_MCP_TRACE` | — | `1` → Recorder 활성화(stderr) |
| `OVERDARE_MCP_TRACE_DIR` | — | replay 용 파일 저장 폴더 |
| `OVERDARE_ASSET_ROOTS` | — | 이미지 임포트 허용 경로 추가(플랫폼 구분자) |
| `OVERDARE_ALLOW_PUBLISH` | — | `1` → publish 게이트 하나 해제 |
| `OVERDARE_UNSAFE` | — | `1` → 백업/롤백 생략(권장 안 함) |

---

## FAQ

**Q. Studio 가 꺼져 있으면?** 읽기/쓰기 도구가 연결 오류를 구조적으로 반환한다. Studio 를 켜고 월드를 연 뒤 다시 시도.

**Q. 쓰기 도구가 "프로젝트 폴더에 .umap 이 없습니다" 라고 한다.** `OVERDARE_PROJECT_CWD` 를 실제 월드 파일(`.umap`/`.ovdrjm`)이 있는 폴더로 지정해야 한다.

**Q. 실수로 월드가 망가지지 않나?** 모든 쓰기는 백업 후 진행되고 실패 시 롤백된다. publish 만 비가역이며 4중 게이트로 막혀 있다.

**Q. OVERDARE 공식인가?** 아니다. 비공식·로컬 단일 사용자용 도구다.

**Q. Studio 업데이트로 안 되면?** 로컬 프로토콜이 바뀐 것일 수 있다. `npm run replay` 로 변경 지점을 확인한다.

**Q. 어떤 Claude 모델/클라이언트가 필요한가?** MCP 를 지원하는 Claude Desktop 또는 Claude Code. 서버는 stdio 로 동작한다.

---

## 개발

```bash
npm run dev        # tsx 로 서버 실행
npm test           # 단위 테스트 (vitest)
npm run typecheck  # 타입 체크
npm run ci         # typecheck + build + test + replay(dry)
npm run gen:docs   # docs/TOOLS.md 재생성
```

더 자세한 구조·설계는 [docs/Architecture.md](docs/Architecture.md), 기여 가이드는
[CONTRIBUTING.md](CONTRIBUTING.md), 변경 이력은 [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
