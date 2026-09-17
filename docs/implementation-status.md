# 구현 현황과 실제 파일 지도

**목적:** 현재 코드에서 동작하는 범위, 남은 작업, 실제 파일의 위치를 개발 시작 전에 확인한다.

**요약:** 2026-09-18 소스 기준으로 블랙잭 코어, 플레이 화면, 세션 저장, 투명 오버레이와 IPC가 연결돼 있다. 포커스·접근성 및 클릭 통과 회귀, 전체 게임 E2E, Renderer 장애 복구, 실제 Windows 동작 검증이 남아 있으며 위치·다중 모니터 작업은 보류 중이다. 제품 동작과 기술 계약은 각각 [제품 설계](blackjack-design.md)와 [기술 설계](blackjack-technical-design.md)가 기준이다.

## 목차

- [확인 기준과 관련 문서](#확인-기준과-관련-문서)
- [현재 구현된 범위](#현재-구현된-범위)
- [남은 작업과 보류 항목](#남은-작업과-보류-항목)
- [실제 파일 지도](#실제-파일-지도)

## 확인 기준과 관련 문서

이 문서는 `src/`, `tests/`, `package.json`, `.github/workflows/`의 현재 파일을 기준으로 한 **구현 현황**이다. [기술 설계 §10](blackjack-technical-design.md#10-프로젝트-구조와-패키징)의 트리는 생성 예정 구조이므로 현재 파일을 찾을 때는 아래 지도를 사용한다. 새 작업 후 구현 현황이나 파일 배치가 바뀌면 이 문서를 갱신한다.

- 다음 세션과 작업 순서: [작업 세션 로드맵](work-session-roadmap.md)
- 완료 세션의 결정·변경·검증 근거: [세션 목록](session-reports/session-list.md)에서 연결한 보고서
- E2E 시나리오와 구현 범위: [E2E 테스트 설계](e2e-test-plan.md), [E2E 구현 현황](e2e-implementation-status.md)
- 빌드와 배포 절차: [빌드와 배포](building-distribution.md)

## 현재 구현된 범위

| 영역 | 현재 코드에서 확인한 범위 | 상세 기록 |
| --- | --- | --- |
| 블랙잭 게임 | 6덱 슈, 점수·행동·정산 원장, 보험·이븐 머니·서렌더·더블·스플릿을 순수 코어로 구현했다. 센트 단위 베팅과 잔액 부족 시 게임 오버도 처리한다. | [P1 보고서](session-reports/P1-blackjack-core.md), [S10.5 보고서](session-reports/S10.5-inline-bet-input.md) |
| 플레이 화면 | `GameViewState`에 따라 베팅부터 결과·새 게임·복구 화면까지 연결했다. 베팅 금액의 제자리 입력은 편집하는 동안에만 창 포커스를 허용한다. | [S07 보고서](session-reports/S07-playable-mvp.md), [S10.5 보고서](session-reports/S10.5-inline-bet-input.md) |
| 상태·저장 | Main의 `GameStore`가 명령과 revision을 관리하고, `SessionRepository`가 게임을 파일에 저장·복원한다. 딜러 진행은 단계별로 저장하며 손상·미래 버전 파일은 복구 선택 화면으로 보낸다. | [S08 보고서](session-reports/S08-session-repository.md) |
| 오버레이 | macOS·Windows용 투명 창, 모서리 크기 조절, 트레이의 표시·숨김·전체 클릭 통과·크기 프리셋, 내부 접힘/펼침, 전경 불투명도 조절창을 구현했다. 헤더 접기 버튼은 제거했고 Alt+백틱은 현재 숨김·복원 토글로 동작한다. | [S01 보고서](session-reports/S01-custom-resize.md), [S10 보고서](session-reports/S10-overlay-state-opacity.md) |
| IPC·보안 | 등록된 창·최상위 문서에서만 명령을 받고 런타임 스키마를 검사한다. Preload는 제한된 API와 공개 상태만 제공하며, Renderer에는 슈와 미공개 딜러 카드가 전달되지 않는다. | [S09 상태 동기화](session-reports/S09-ipc-state-sync.md), [S09 구독 보강](session-reports/S09-ipc-subscription.md) |
| 빌드·검증 기반 | 고정된 주요 도구 버전과 Node 버전 파일, 타입 검사·하위 테스트·프로덕션 패키지 E2E 스크립트, macOS·Windows CI 및 배포 산출물 workflow가 있다. | [빌드와 배포](building-distribution.md), [E2E 구현 현황](e2e-implementation-status.md) |

이 표는 코드의 존재와 연결 상태를 나타낸다. 세션별 통과 수, 실행 환경, 자동화가 확인하지 못한 OS 동작은 [세션 보고서](session-reports/session-list.md)와 [E2E 구현 현황](e2e-implementation-status.md)에서 확인한다.

S10 보고서의 Alt+백틱 숨기기 전용 설명은 해당 세션 당시의 기록이다. 이후 단축키가 숨김·복원 토글로 변경됐으며, 현재 동작은 [제품 설계](blackjack-design.md#2-오버레이와-조작)와 `src/main/main.ts`의 `toggleOverlay()`를 기준으로 확인한다.

## 남은 작업과 보류 항목

| 항목 | 현재 경계와 다음 위치 |
| --- | --- |
| 포커스·접근성 회귀 | 인라인 금액 편집은 동작하지만 반복 입력, 숨김·복원 후 포커스, 키보드·보조 기술 경로와 실제 업무 앱 포커스 복귀는 S12에서 검증한다. [로드맵](work-session-roadmap.md) |
| 전체 클릭 통과·트레이 복구 | 명시적 전체 클릭 통과와 트레이 복구 경로는 코드에 있다. 실제 OS 클릭·스크롤 전달 및 상태 전이 회귀는 S13에서 다룬다. 자동 부분 클릭 통과(`forward:true`)는 별도 실험이다. [기술 설계 §4.5](blackjack-technical-design.md#45-클릭-통과) |
| 위치·다중 모니터·창 시작 기본값 | 화면 변화에 따른 위치 보정과 전체 창 설정 재실행 초기화는 S11 전체 및 E2E-18과 함께 TOBE로 보류했다. 게임 세션 저장과 구분하며 `preferences.json`은 만들지 않았다. [로드맵](work-session-roadmap.md) |
| 전체 게임·저장 E2E | 대표 플레이와 저장·IPC·베팅 경계는 자동화됐다. E2E-01~21의 남은 플레이 분기와 E2E-17 전체 저장 체크포인트는 S14~S15에서 확장한다. E2E-18은 위 보류 범위다. [E2E 구현 현황](e2e-implementation-status.md) |
| Renderer 장애 복구 | 현재 `render-process-gone`은 오버레이를 숨기고 오류를 기록한다. 새 창 생성과 저장된 최신 상태 재동기화는 S16 범위다. [기술 설계 §7.3](blackjack-technical-design.md#73-renderer-장애) |
| OS별 제품 검증 | 실제 투명 합성, 외부 앱 포커스, 물리 단축키·트레이 조작, Windows GUI와 다중 모니터는 기존 macOS 패키지 E2E만으로 판정하지 않는다. 접근성·DPI·성능·설치본 검증도 후속 세션에 남아 있다. [로드맵](work-session-roadmap.md), [빌드와 배포](building-distribution.md) |

## 실제 파일 지도

아래는 소스에 존재하는 파일만 나열한다. 구현 계약은 파일과 [기술 설계](blackjack-technical-design.md)를 읽고, 특정 변경의 검증 근거는 [세션 목록](session-reports/session-list.md)에서 찾는다.

### 앱과 공통 코드

```text
src/
  main/
    main.ts                         앱 시작·창/트레이·프로토콜·IPC 연결
    game/game-store.ts              단일 작성자, 공개 상태, 명령·딜러 진행
    game/shoe-source.ts             실제 슈 공급과 E2E 픽스처 주입
    ipc/trust.ts                    IPC 송신자·문서 신뢰 검사
    persistence/session-repository.ts  게임 세션 파일 저장·복구
    platform/adapter.ts            OS별 창 정책
    windows/resize-controller.ts   모서리 크기 조절 제스처·bounds
    windows/hide-shortcut.ts        전역 숨김/복원 단축키 등록
  preload/preload.ts                제한된 Renderer API
  renderer/
    main.tsx                        게임 화면·입력·오버레이 표시
    styles.css                      화면과 최소 크기 레이아웃
  shared/
    contracts.ts                   공개 상태·명령·IPC 스키마/타입
    bet-input.ts                   달러 텍스트의 정수 센트 변환
    env.d.ts                       빌드 환경 타입
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
```

### 테스트·빌드

```text
tests/
  core/
    betting.test.ts, engine-basic.test.ts, engine-special-actions.test.ts
    engine-split-double.test.ts, settlement.test.ts, shoe-scoring.test.ts
    helpers.ts
  main/
    game-store.test.ts, session-repository.test.ts, trust.test.ts
    resize-controller.test.ts, hide-shortcut.test.ts
  shared/
    bet-input.test.ts, contracts.test.ts
  e2e/
    betting.spec.ts, playable-mvp.spec.ts, persistence.spec.ts
    overlay-resize.spec.ts, overlay-state.spec.ts, dock-lifecycle.spec.ts
    ipc-state.spec.ts, ipc-subscription.spec.ts
    support/app.ts, support/game.ts, support/fixtures.ts
    support/format.ts, support/resize.ts
    tsconfig.json, window-api.d.ts
fixtures/blackjack/                  결정론적 게임·저장 E2E 카드 픽스처
scripts/smoke.cjs                    패키지 게임 경로 확인
resources/icons/                     앱 아이콘 원본·플랫폼 산출물
.github/workflows/ci.yml             macOS·Windows 검사·패키징
.github/workflows/build-distributables.yml  배포 산출물 빌드
package.json, package-lock.json, .nvmrc
forge.config.cjs, vite.*.config.mts, vitest.config.mts, playwright.config.ts
```
