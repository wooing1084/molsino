# 블랙잭 구현 현황과 실제 파일 지도

**목적:** 현재 블랙잭 게임의 구현 범위, 남은 작업, 실제 파일 위치를 개발 전에 확인한다.

**요약:** 2026-09-18 소스 기준으로 6덱 규칙 코어, 베팅부터 정산까지의 화면, Main의 명령 처리와 세션 저장·복구가 연결돼 있다. 게임·저장 E2E의 나머지 분기와 체크포인트는 후속 세션에서 검증한다. 오버레이와 앱 공통 기반은 [메인 기능 구현 현황](../../main/implementation-status.md)에서 관리한다.

## 목차

- [확인 기준과 관련 문서](#확인-기준과-관련-문서)
- [현재 구현된 범위](#현재-구현된-범위)
- [남은 작업과 보류 항목](#남은-작업과-보류-항목)
- [실제 파일 지도](#실제-파일-지도)

## 확인 기준과 관련 문서

이 문서는 `src/`, `tests/`, `fixtures/blackjack/`의 현재 파일을 기준으로 한 **블랙잭 구현 현황**이다. 게임 규칙과 화면 동작은 [블랙잭 제품 설계](product-design.md), 엔진·게임 상태·저장 계약은 [블랙잭 기술 설계](technical-design.md)를 따른다. 현재 파일 위치는 아래 지도를 사용한다.

- 앱 공통 구현과 파일 위치: [메인 기능 구현 현황](../../main/implementation-status.md)
- 다음 세션과 작업 순서: [작업 세션 로드맵](../../work-session-roadmap.md)
- 완료 세션의 변경·검증 근거: [세션 목록](../../session-reports/session-list.md)에서 연결한 보고서
- 게임 E2E 시나리오와 현재 범위: [블랙잭 E2E 테스트 설계](e2e-test-plan.md), [블랙잭 E2E 현황](e2e-implementation-status.md)

## 현재 구현된 범위

| 영역 | 현재 코드에서 확인한 범위 | 상세 기록 |
| --- | --- | --- |
| 블랙잭 규칙 | 6덱 슈, 점수·허용 행동·정산 원장, 보험·이븐 머니·서렌더·더블·스플릿을 순수 코어로 구현했다. 센트 단위 베팅과 잔액 부족 시 게임 오버도 처리한다. | [P1 보고서](../../session-reports/P1-blackjack-core.md), [S10.5 보고서](../../session-reports/S10.5-inline-bet-input.md) |
| 플레이 화면 | `GameViewState`에 따라 베팅부터 결과·새 게임·복구 화면까지 연결했다. 금액 제자리 입력은 편집하는 동안에만 창 포커스를 허용한다. 공통 창 포커스 회귀는 [메인 기능 구현 현황](../../main/implementation-status.md)을 따른다. | [S07 보고서](../../session-reports/S07-playable-mvp.md), [S10.5 보고서](../../session-reports/S10.5-inline-bet-input.md) |
| 게임 상태·저장 | Main의 `GameStore`가 블랙잭 명령과 revision을 관리하고 `SessionRepository`가 게임 세션을 파일에 저장·복원한다. 딜러 진행은 단계별로 저장하며 손상·미래 버전 파일은 복구 선택 화면으로 보낸다. | [S08 보고서](../../session-reports/S08-session-repository.md) |
| 게임 공개 상태 | Renderer에 공개하는 상태와 명령 응답에는 슈와 미공개 딜러 카드가 없다. 신뢰된 문서와 IPC 구독의 공통 경계는 [메인 기능 구현 현황](../../main/implementation-status.md)을 따른다. | [S09 상태 동기화](../../session-reports/S09-ipc-state-sync.md), [S09 구독 보강](../../session-reports/S09-ipc-subscription.md) |

이 표는 코드의 존재와 연결 상태를 나타낸다. 세션별 통과 수·실행 환경·당시 한계는 [세션 보고서](../../session-reports/session-list.md), 현재 E2E 범위는 [블랙잭 E2E 현황](e2e-implementation-status.md)에서 확인한다.

## 남은 작업과 보류 항목

| 항목 | 현재 경계와 다음 위치 |
| --- | --- |
| 게임 흐름 E2E | 대표 플레이와 베팅 경계는 자동화됐다. E2E-01~16의 남은 승패·특수 행동·연속 입력·새 게임 경로는 S14~S15에서 확장한다. [블랙잭 E2E 현황](e2e-implementation-status.md) |
| 저장 복원 E2E | 정상·강제 종료와 손상 파일의 대표 경로는 자동화됐지만 E2E-17의 모든 저장 체크포인트를 확인하지 않았다. 재셔플 경계와 비공개 게임 상태 은닉의 현재 범위는 [블랙잭 E2E 현황](e2e-implementation-status.md)을 따른다. 공통 신뢰 경계 E2E-21은 [메인 E2E 설계](../../main/e2e-test-plan.md)를 따른다. |
| 게임 입력의 OS 상호작용 | 베팅 금액 편집은 코드에 있다. 실제 외부 앱 포커스 복귀, 반복 입력과 키보드·접근성 동작은 앱 공통 S12 검증에서 다룬다. [메인 기능 구현 현황](../../main/implementation-status.md) |

## 실제 파일 지도

아래는 소스에 존재하는 파일만 나열한다. 메인 기능도 함께 연결하는 파일은 여기서 **블랙잭 담당 부분**만 표시한다. 오버레이·IPC 기반과 빌드 파일은 [메인 기능 파일 지도](../../main/implementation-status.md#실제-파일-지도)를 따른다.

### 게임 코드

```text
src/
  core/
    models.ts                      카드와 핸드 모델
    shoe.ts                        슈 생성·셔플·드로우
    scoring.ts                     핸드 점수
    game-state.ts                  세션·라운드 상태
    betting.ts                     베팅 금액 규칙
    rules.ts                       허용 행동·게임 규칙
    settlement.ts                  정산과 원장
    engine.ts                      순수 게임 상태 전이
    errors.ts                      도메인 오류·안전한 산술
  main/
    main.ts                        게임 세션 시작·명령 연결
    game/game-store.ts             블랙잭 명령·공개 상태·딜러 진행
    game/shoe-source.ts            실제 슈 공급과 E2E 카드 픽스처 주입
    persistence/session-repository.ts  게임 세션 파일 저장·복구
  preload/preload.ts               게임 명령·상태 구독 API 연결
  renderer/
    main.tsx                      블랙잭 화면·베팅 입력
    styles.css                    카드·핸드·베팅 화면 레이아웃
  shared/
    contracts.ts                  게임 공개 상태·명령 스키마/타입
    bet-input.ts                  달러 텍스트의 정수 센트 변환
```

### 게임 테스트·픽스처

```text
tests/
  core/                             betting.test.ts, engine-basic.test.ts,
                                    engine-special-actions.test.ts,
                                    engine-split-double.test.ts,
                                    settlement.test.ts, shoe-scoring.test.ts,
                                    helpers.ts
  main/                             game-store.test.ts, session-repository.test.ts
  shared/                           bet-input.test.ts, contracts.test.ts의 게임 계약
  e2e/                              betting.spec.ts, playable-mvp.spec.ts,
                                    persistence.spec.ts,
                                    ipc-state.spec.ts와 ipc-subscription.spec.ts의
                                    게임 공개 상태 검증
    support/                        game.ts, fixtures.ts, format.ts
fixtures/blackjack/                 결정론적 카드·저장 E2E 픽스처
scripts/smoke.cjs                   패키지 게임 경로 확인
```
