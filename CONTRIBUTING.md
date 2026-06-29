# Contributing

## 개발 환경

```bash
npm install
npm run dev          # tsx 로 서버 실행 (개발)
npm test             # vitest (단위 + GOLDEN)
npm run typecheck    # tsc --noEmit
npm run build        # dist/
npm run ci           # typecheck + build + test + replay(dry)  ← PR 전 로컬에서 통과시킬 것
```

## 핵심 원칙 (반드시 지킬 것)

1. **확인된 동작만 구현.** RPC 메서드·스키마·동작은 라이브로 검증된 것만 구현한다.
   확인 안 된 동작은 추가하지 말고 `TODO` + 근거를 남긴다.
2. **테스트 먼저.** 새 동작은 테스트(또는 GOLDEN fixture)로 기대값을 먼저 고정한 뒤 구현한다.
3. **.ovdrjm 편집은 fixture 검증 필수.** `tests/fixtures/` 의 실제 구조로 의미적 동일성을 검증한다.
4. **쓰기는 파이프라인을 통한다.** 모든 변경은 `applyWrite()`(backup→modify→validate→apply→save)
   를 거친다. 백업 생략은 `--unsafe` 일 때만.
5. **stdout 오염 금지.** stdout 은 MCP 프로토콜 채널이다. 로그/trace 는 stderr 로만.

## 새 도구 추가 절차

1. `src/scene/` 또는 `src/ovdrjm/` 에 순수 로직 + 단위 테스트.
2. `src/tools/<name>.ts` 에 `register(server)` 로 zod `inputSchema` 와 함께 등록.
3. `src/server/index.ts` 에서 register 호출.
4. `npm run gen:docs` 로 `docs/TOOLS.md` 갱신.
5. `CHANGELOG.md` 에 항목 추가.

## 커밋 / PR

- 한 PR = 한 가지 관심사. `npm run ci` 통과 필수.
- 쓰기/프로토콜 변경은 fixture 또는 replay 근거를 PR 에 첨부.
- 비공식 프로토콜 변경 감지: Studio 버전 갱신 시 `npm run replay` 결과를 공유.
