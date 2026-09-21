# 메인 기능 E2E 테스트 스위트 구현 현황

**목적:** 앱 공통 E2E 실행 기반과 오버레이·IPC·OS 관련 테스트의 현재 범위, 남은 검증을 찾는다.

**요약:** Playwright Electron 스위트는 프로덕션 패키지에서 오버레이 크기·표시 상태, IPC 신뢰 경계와 구독 수명, macOS 테스트 전용 Dock 처리를 검증한다. 블랙잭 카드·베팅·저장 시나리오와 픽스처는 [블랙잭 E2E 현황](../games/blackjack/e2e-implementation-status.md)에서 관리한다.

## 목차

- [현재 실행 기반](#현재-실행-기반)
- [현재 테스트 파일과 범위](#현재-테스트-파일과-범위)
- [남은 검증 범위](#남은-검증-범위)
- [독립 통합 검증 이력](#독립-통합-검증-이력)

2026-09-18 문서 재구성은 기존 결과를 분류한 것이며, 그 과정에서 테스트를 다시 실행하지 않았다. 실제 세션별 검증 결과는 [세션 목록](../session-reports/session-list.md)의 보고서를 따른다.

## 현재 실행 기반

- [`npm run test:e2e`](../../package.json)는 Forge 패키징을 먼저 수행한 뒤 [`playwright.config.ts`](../../playwright.config.ts)에 정의된 Electron E2E 스위트를 실행한다. 앱 코드와 E2E 코드의 타입 검사는 각각 루트 설정과 [`tests/e2e/tsconfig.json`](../../tests/e2e/tsconfig.json)을 따른다. 정확한 명령과 도구 버전은 `package.json`이 기준이다.
- [`tests/e2e/support/`](../../tests/e2e/support/)의 `app.ts`·`app-game.ts`·`resize.ts`는 앱 실행·재기동, 격리된 `userData`, 창 크기 조절 관찰을 지원한다. `game.ts`·`fixtures.ts`·`format.ts`와 카드 픽스처의 역할은 [블랙잭 E2E 현황](../games/blackjack/e2e-implementation-status.md)을 따른다.
- 테스트 API 타입은 [`tests/e2e/window-api.d.ts`](../../tests/e2e/window-api.d.ts)가 앱의 [`src/shared/app-contracts.ts`](../../src/shared/app-contracts.ts)를 재사용한다. API 필드와 헬퍼 함수의 실제 형태는 코드에서 확인한다. 앱 공통 시나리오의 완료 조건은 [메인 E2E 테스트 설계](e2e-test-plan.md), 세션 실행 순서는 [작업 세션 로드맵](../work-session-roadmap.md)을 따른다.

## 현재 테스트 파일과 범위

| 테스트 파일 | 현재 확인하는 앱 공통 경로 |
| --- | --- |
| [`overlay-resize.spec.ts`](../../tests/e2e/overlay-resize.spec.ts) | 모서리 핸들에서 IPC를 거친 창 크기 조절, 경계값, token 수명, 최소 화면 레이아웃 |
| [`overlay-state.spec.ts`](../../tests/e2e/overlay-state.spec.ts) | 접힘·펼침과 창 크기 복원, 불투명도 조절창, 전역 숨김 명령 경계. 같은 파일의 게임 진행 상태 보존 검증은 [블랙잭 E2E 현황](../games/blackjack/e2e-implementation-status.md)을 따른다. |
| [`ipc-state.spec.ts`](../../tests/e2e/ipc-state.spec.ts), [`ipc-subscription.spec.ts`](../../tests/e2e/ipc-subscription.spec.ts) | snapshot과 push의 순서·구독 수명, 비신뢰 문서와 비정상 IPC 거부. 같은 파일의 카드 은닉 검증은 [블랙잭 E2E 현황](../games/blackjack/e2e-implementation-status.md)을 따른다. |
| [`app-menu.spec.ts`](../../tests/e2e/app-menu.spec.ts) | 메뉴 왕복·초기화·이전·저장 실패/재시도·시작 I/O 오류·백업 우선순위·명령 경합·최소 크기 |
| [`baccarat.spec.ts`](../../tests/e2e/baccarat.spec.ts) | APP-08 두 게임 왕복·공용 잔액·게임별 슈, 바카라 UI·복구는 [바카라 E2E 현황](../games/baccarat/e2e-implementation-status.md) 참조 |
| [`bigwheel.spec.ts`](../../tests/e2e/bigwheel.spec.ts) | N05 세 게임 왕복·공용 지갑·복구·표시·최소 창. [빅휠 E2E 현황](../games/bigwheel/e2e-implementation-status.md) 참조 |
| [`dock-lifecycle.spec.ts`](../../tests/e2e/dock-lifecycle.spec.ts) | macOS E2E 앱 실행 중 테스트 전용 Dock 숨김 |

위 파일의 존재와 검사 범위를 현재 스위트 현황으로 기록한다. 각 세션의 명령, 통과·실패·스킵 수와 실행 환경은 [세션 보고서](../session-reports/session-list.md)에서 확인한다.

## 남은 검증 범위

- 2026-09-18에 기존 미진행 세션·TOBE 계획을 폐기했다. 현재 테스트의 미검증 범위는 그대로이며, 메뉴·공용 저장의 단일 게임 APP 시나리오는 N02에서 구현했다. APP-08 두 게임 왕복은 N03의 `baccarat.spec.ts`에서 검증한다. 필요한 회귀는 [새 로드맵](../work-session-roadmap.md)과 변경 범위로 선정한다.
- 자동화 결과만으로 실제 투명 합성, 다른 앱으로의 포커스 복귀, 물리 Alt+백틱·트레이 입력, Windows GUI 동작이나 물리 다중 모니터 동작을 통과로 판정하지 않는다. OS별 검증 결과는 실시한 세션 보고서에 환경과 함께 남긴다.
- 블랙잭 규칙·베팅·세션 복원의 남은 시나리오는 [블랙잭 E2E 현황](../games/blackjack/e2e-implementation-status.md)을 따른다.

## 독립 통합 검증 이력

아래 두 기록은 별도 세션 보고서가 없는 기존 통합 검증이다. 당시의 결과이며 현재 스위트 전체 통과 수로 재사용하지 않는다.

- **macOS E2E Dock 정리:** 선작성 패키지 E2E에서 `dock.isVisible() === true`로 실패했다. 일반 앱의 Dock 표시는 유지하고 E2E 런처에만 `MOLSINO_TEST_HIDE_DOCK=1`을 전달해 `setVisibleOnAllWorkspaces` 호출 뒤 Dock 아이콘을 숨겼다. [`dock-lifecycle.spec.ts`](../../tests/e2e/dock-lifecycle.spec.ts)에서 실행 중 `dock.isVisible() === false`와 테스트 전용 플래그를 확인했다. 당시 macOS arm64 Forge 프로덕션 패키지에서 `npm run test:e2e` 26/26, `npm run check` 12파일 110/110 통과. 최근 사용 앱 항목을 자동 삭제하거나 사용자 Dock 설정을 바꾸지는 않았고, 종료 뒤 최근 앱 목록에 새 항목이 생기는지는 OS UI로 확인하지 않았다.
- **DEV 병합 통합 검증:** 병합된 S09 spec의 Preload API 기대 목록에 S10 오버레이 API를 반영했다. 당시 macOS arm64 Forge 프로덕션 패키지에서 `npm run test:e2e` 32/32, `npm run check` 12파일 114/114 통과.

N04의 공통 레벨·한도·카드 공개 통합 사례는 [`gameplay-improvements.spec.ts`](../../tests/e2e/gameplay-improvements.spec.ts)에 있다. 시나리오 목록은 [메인 E2E 설계](../main/e2e-test-plan.md#4-n04-게임성-개선), 실행 결과와 미확인 범위는 [N04 보고서](../session-reports/N04-gameplay-improvements.md)를 따른다.
