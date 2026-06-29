## 변경 내용
무엇을 왜 바꿨는지.

## 근거
- [ ] 확인된(라이브 검증된) 동작만 구현했다 (확인 안 된 동작은 TODO + 근거)

## 체크리스트
- [ ] `npm run ci` 통과 (typecheck + build + test + replay dry)
- [ ] 새 동작에 테스트/GOLDEN fixture 추가
- [ ] 쓰기 변경은 `applyWrite` 파이프라인 사용
- [ ] 도구 변경 시 `npm run gen:docs` 로 `docs/TOOLS.md` 갱신
- [ ] `CHANGELOG.md` 갱신
- [ ] stdout 오염 없음 (로그/trace 는 stderr)
