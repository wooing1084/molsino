# 블랙잭 E2E 테스트 스위트 구현 현황

**목적:** 블랙잭 게임 E2E의 현재 테스트 파일, 카드 픽스처와 남은 시나리오를 찾는다.

**요약:** 프로덕션 패키지 E2E에서 대표 플레이, 베팅 입력, 세션 저장·복원과 공개 상태의 카드 은닉을 확인한다. 설계된 게임 흐름의 여러 분기와 저장 체크포인트는 아직 모두 검증하지 않았다. 패키징 실행 기반과 오버레이·IPC·OS 공통 검증은 [메인 기능 E2E 현황](../../main/e2e-implementation-status.md)에서 관리한다.

## 목차

- [현재 실행 기반과 픽스처](#현재-실행-기반과-픽스처)
- [현재 테스트 파일과 범위](#현재-테스트-파일과-범위)
- [남은 검증 범위](#남은-검증-범위)

2026-09-18 문서 재구성은 기존 결과를 분류한 것이며, 그 과정에서 테스트를 다시 실행하지 않았다. 당시 검증의 명령·수치·환경은 [세션 목록](../../session-reports/session-list.md)의 보고서를 따른다.

## 현재 실행 기반과 픽스처

- 패키징 후 Playwright Electron을 실행하는 명령, 타입 계약과 공통 런처는 [메인 기능 E2E 현황](../../main/e2e-implementation-status.md#현재-실행-기반)을 따른다. [`tests/e2e/support/`](../../../tests/e2e/support/)의 `game.ts`·`fixtures.ts`·`format.ts`는 게임 명령, 카드 픽스처와 표시값 검증을 지원한다.
- [`fixtures/blackjack/`](../../../fixtures/blackjack/)에는 현재 JSON 16개가 있다. [블랙잭 E2E 테스트 설계](e2e-test-plan.md)의 15개 픽스처에 `dealer-many-steps.json`이 추가됐고 S09 구독 회귀에서 사용한다. 결정론적 카드 순서와 테스트 전용 저장 경로를 사용한다.
- `low-balance`의 `balanceCents`와 `shoe-near-cut`의 `remainingBeforeDeal` 메타데이터는 Main이 직접 소비하지 않는다. 필요한 저장 상태는 테스트 프로세스에서 구성한다. 게임 시나리오의 수용 조건은 [블랙잭 E2E 테스트 설계](e2e-test-plan.md), 세션별 실행 순서는 [작업 세션 로드맵](../../work-session-roadmap.md)을 따른다.

## 현재 테스트 파일과 범위

| 테스트 파일 | 현재 확인하는 블랙잭 경로 |
| --- | --- |
| [`playable-mvp.spec.ts`](../../../tests/e2e/playable-mvp.spec.ts) | 베팅부터 플레이어 자연 블랙잭 정산·다음 판까지의 UI 경로 |
| [`persistence.spec.ts`](../../../tests/e2e/persistence.spec.ts) | 정상·강제 종료 후 세션 복원, 백업·손상·미래 스키마 처리, 판 사이 슈 컷 경계 |
| [`betting.spec.ts`](../../../tests/e2e/betting.spec.ts) | 인라인 센트 베팅·취소·오류·포커스 수명, 반 센트 정산, $1.00/$0.99 게임 오버 경계 |
| [`ipc-state.spec.ts`](../../../tests/e2e/ipc-state.spec.ts), [`ipc-subscription.spec.ts`](../../../tests/e2e/ipc-subscription.spec.ts) | 공개 snapshot·command 응답·push에서 슈와 미공개 딜러 카드 은닉. 구독 수명과 비신뢰 문서 검증은 [메인 기능 E2E 현황](../../main/e2e-implementation-status.md)을 따른다. |
| [`overlay-state.spec.ts`](../../../tests/e2e/overlay-state.spec.ts) | 게임 진행 중 접힘·펼침에도 카드·잔액·revision 유지. 창 표시 기능 자체는 [메인 기능 E2E 현황](../../main/e2e-implementation-status.md)을 따른다. |

위 파일의 존재와 검사 범위를 현재 스위트 현황으로 기록한다. 특정 세션의 통과·실패·스킵 수는 [세션 보고서](../../session-reports/session-list.md)에서 확인한다.

## 남은 검증 범위

- 게임 시나리오 E2E-01~02의 초기 상태·증감 경계, E2E-03~13의 표준 승패와 보험·이븐 머니·더블·스플릿·서렌더 분기는 대표 경로만 있거나 전용 시나리오가 없다. E2E-14의 연속 입력과 E2E-16의 새 게임 초기화도 전용 검증이 부족하다. 기존 미완료 시나리오의 일괄 구현 일정은 폐기했고, 새 변경에 필요한 범위를 선정한다. E2E-15의 금액·게임 오버 경계는 [`betting.spec.ts`](../../../tests/e2e/betting.spec.ts)에 일부 구현돼 있다. 전체 수용 조건은 [블랙잭 E2E 테스트 설계](e2e-test-plan.md)를 따른다.
- E2E-17의 강제 종료 후 복원은 [`persistence.spec.ts`](../../../tests/e2e/persistence.spec.ts)에 대표 경로가 있지만 설계된 10개 체크포인트를 모두 확인하지 않았다. E2E-19의 손상·미래 스키마와 E2E-20의 재셔플 경계는 대표 경로를 구현했고, E2E-21의 비공개 게임 상태 은닉은 두 IPC spec에서 다룬다.
- E2E-18의 구 계획은 폐기했다. 실제 외부 앱 포커스와 OS 클릭 통과·트레이 입력의 현재 검증 범위는 [메인 기능 E2E 현황](../../main/e2e-implementation-status.md#남은-검증-범위)을 따른다.

공용 잔액·메뉴 이관 이후 새 시작 기대값은 [메인 APP 시나리오](../../main/e2e-test-plan.md)를 따른다. 현재 테스트는 블랙잭 단독 구현의 기록이며 아직 신규 계약으로 전환하지 않았다.
