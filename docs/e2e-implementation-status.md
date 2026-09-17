# E2E 테스트 스위트 구현 현황

**목적:** 현재 E2E 실행 기반과 테스트 파일별 검증 범위, 아직 확인할 범위를 찾는다.

**요약:** Playwright Electron 스위트는 게임 플레이, 저장 복원, IPC 신뢰 경계, 오버레이와 베팅 입력의 대표 경로를 검증한다. 게임 시나리오의 완료 조건은 [E2E 테스트 설계](e2e-test-plan.md), 세션 순서는 [작업 세션 로드맵](work-session-roadmap.md), 당시 변경과 검증 결과는 [세션 목록](session-reports/session-list.md)에서 확인한다.

## 목차

- [현재 실행 기반](#현재-실행-기반)
- [현재 테스트 파일과 범위](#현재-테스트-파일과-범위)
- [남은 검증 범위](#남은-검증-범위)
- [독립 통합 검증 이력](#독립-통합-검증-이력)

최근 문서 정리: 2026-09-18. 이 정리 과정에서 테스트를 다시 실행하지 않았다.

## 현재 실행 기반

- [`npm run test:e2e`](../package.json)는 Forge 패키징을 먼저 수행한 뒤 [`playwright.config.ts`](../playwright.config.ts)에 정의된 Electron E2E 스위트를 실행한다. 앱 코드와 E2E 코드의 타입 검사는 각각 루트 설정과 [`tests/e2e/tsconfig.json`](../tests/e2e/tsconfig.json)을 따른다. 정확한 명령과 도구 버전은 `package.json`이 기준이다.
- [`tests/e2e/support/`](../tests/e2e/support/)는 앱 실행·재기동, 격리된 `userData`, 게임 명령, 카드 픽스처와 크기 조절 관찰을 지원한다. 테스트 API 타입은 [`tests/e2e/window-api.d.ts`](../tests/e2e/window-api.d.ts)가 앱의 [`src/shared/contracts.ts`](../src/shared/contracts.ts)를 재사용한다. API 필드와 헬퍼 함수의 실제 형태는 코드에서 확인한다.
- [`fixtures/blackjack/`](../fixtures/blackjack/)에는 현재 JSON 16개가 있다. [테스트 설계의 15개 픽스처](e2e-test-plan.md#5-픽스처-설계)에 `dealer-many-steps.json`이 추가됐고, S09 구독 회귀에서 사용한다. 결정론적 카드 순서와 테스트 전용 저장 경로를 사용하며, `low-balance`의 `balanceCents`와 `shoe-near-cut`의 `remainingBeforeDeal` 메타데이터는 Main이 직접 소비하지 않는다. 필요한 저장 상태는 테스트 프로세스에서 구성한다.

## 현재 테스트 파일과 범위

| 테스트 파일 | 현재 확인하는 대표 경로 |
| --- | --- |
| [`overlay-resize.spec.ts`](../tests/e2e/overlay-resize.spec.ts) | 모서리 핸들에서 IPC를 거친 창 크기 조절, 경계값, token 수명, 최소 화면 레이아웃 |
| [`playable-mvp.spec.ts`](../tests/e2e/playable-mvp.spec.ts) | 베팅부터 플레이어 자연 블랙잭 정산·다음 판까지의 UI 경로 |
| [`persistence.spec.ts`](../tests/e2e/persistence.spec.ts) | 정상·강제 종료 후 복원, 백업·손상·미래 스키마 처리, 판 사이 슈 컷 경계 |
| [`ipc-state.spec.ts`](../tests/e2e/ipc-state.spec.ts), [`ipc-subscription.spec.ts`](../tests/e2e/ipc-subscription.spec.ts) | snapshot과 push의 순서·구독 수명, 비공개 상태 은닉, 비신뢰 문서와 비정상 IPC 거부 |
| [`overlay-state.spec.ts`](../tests/e2e/overlay-state.spec.ts) | 접힘·펼침과 게임 진행, 불투명도 조절창, 전역 숨김 명령 경계 |
| [`dock-lifecycle.spec.ts`](../tests/e2e/dock-lifecycle.spec.ts) | macOS E2E 앱 실행 중 테스트 전용 Dock 숨김 |
| [`betting.spec.ts`](../tests/e2e/betting.spec.ts) | 인라인 센트 베팅·취소·오류·포커스 수명, 반 센트 정산, $1.00/$0.99 게임 오버 경계 |

위 파일의 존재와 검사 범위를 현재 스위트 현황으로 기록한다. 각 세션을 마쳤을 때의 명령, 통과·실패·스킵 수와 환경은 [세션 보고서](session-reports/session-list.md)에서 확인한다.

## 남은 검증 범위

- 게임 시나리오 E2E-01~02의 초기 상태·증감 경계, E2E-03~13의 표준 승패와 보험·이븐 머니·더블·스플릿·서렌더 분기는 대표 경로만 있거나 전용 시나리오가 없다. E2E-14의 연속 입력과 E2E-16의 새 게임 초기화도 전용 검증을 추가해야 한다. E2E-15의 금액·게임 오버 경계는 [`betting.spec.ts`](../tests/e2e/betting.spec.ts)에 일부 구현돼 있다. 각 시나리오의 전체 수용 조건은 [E2E 테스트 설계](e2e-test-plan.md#3-시나리오)를 따른다.
- E2E-17의 강제 종료 후 복원은 [`persistence.spec.ts`](../tests/e2e/persistence.spec.ts)에 대표 경로가 있지만, [설계된 10개 체크포인트](e2e-test-plan.md#35-저장-복원-mvp-완료-기준의-핵심)를 모두 확인하지 않았다. E2E-19의 손상·미래 스키마와 E2E-20의 재셔플 경계는 대표 경로를 구현했고, E2E-21의 격리·신뢰 경계는 두 IPC spec에서 다룬다.
- S12의 포커스·접근성, S13의 실제 클릭 통과·트레이 복구 회귀가 남아 있다. S11의 위치·다중 모니터와 E2E-18 창 설정 전체 재실행 초기화는 TOBE로 보류했다. 실행 순서와 세션별 완료 조건은 [로드맵](work-session-roadmap.md)을 따른다.
- 자동화 결과만으로 실제 투명 합성, 다른 앱으로의 포커스 복귀, 물리 Alt+백틱·트레이 입력, Windows GUI 동작이나 물리 다중 모니터 동작을 통과로 판정하지 않는다. OS별 검증 결과는 실시한 세션 보고서에 환경과 함께 남긴다.

## 독립 통합 검증 이력

아래 두 기록은 별도 세션 보고서가 없는 기존 통합 검증이다. 당시의 결과이며 현재 스위트 전체 통과 수로 재사용하지 않는다.

- **macOS E2E Dock 정리:** 선작성 패키지 E2E에서 `dock.isVisible() === true`로 실패했다. 일반 앱의 Dock 표시는 유지하고 E2E 런처에만 `MOLSINO_TEST_HIDE_DOCK=1`을 전달해 `setVisibleOnAllWorkspaces` 호출 뒤 Dock 아이콘을 숨겼다. [`dock-lifecycle.spec.ts`](../tests/e2e/dock-lifecycle.spec.ts)에서 실행 중 `dock.isVisible() === false`와 테스트 전용 플래그를 확인했다. 당시 macOS arm64 Forge 프로덕션 패키지에서 `npm run test:e2e` 26/26, `npm run check` 12파일 110/110 통과. 최근 사용 앱 항목을 자동 삭제하거나 사용자 Dock 설정을 바꾸지는 않았고, 종료 뒤 최근 앱 목록에 새 항목이 생기는지는 OS UI로 확인하지 않았다.
- **DEV 병합 통합 검증:** 병합된 S09 spec의 Preload API 기대 목록에 S10 오버레이 API를 반영했다. 당시 macOS arm64 Forge 프로덕션 패키지에서 `npm run test:e2e` 32/32, `npm run check` 12파일 114/114 통과.
