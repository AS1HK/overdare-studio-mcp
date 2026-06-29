---
name: Bug report
about: 버그 신고
title: "[bug] "
labels: bug
---

## 증상
무엇이 잘못됐는지 간단히.

## 재현 절차
1. 사용한 도구 / 호출
2. 입력값
3. 관찰된 결과 vs 기대한 결과

## 환경
- overdare-studio-mcp 버전:
- OVERDARE Studio 빌드:
- 검증 시점/빌드 (알면):
- OS / Node 버전:

## Trace (가능하면 첨부)
`OVERDARE_MCP_TRACE=1 OVERDARE_MCP_TRACE_DIR=.trace` 로 재현 후 `.trace/` 첨부.
(민감정보 확인 — JWT 는 자동 마스킹되나 그 외는 직접 확인)

## 프로토콜 드리프트 의심 시
`npm run replay .trace/session.json` 결과를 붙여주세요.
