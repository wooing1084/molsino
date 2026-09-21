# 빅휠 기술 설계

**목적:** 빅휠 엔진·공용 저장·공개 상태의 책임 경계를 정한다.

**요약:** 순수 코어에 Main의 난수와 식별자 생성기를 주입한다. 회전 시작 후보에 당첨 칸과 차감을 저장하고 내부 자동 진행에서 같은 칸으로 정산한다. v4 저장은 v1/v2/v3 잔액과 진행 판을 보존한다.

## 목차

- [1. 코어 계약](#1-코어-계약)
- [2. 저장과 공개 상태](#2-저장과-공개-상태)
- [3. UI와 검증 경계](#3-ui와-검증-경계)

## 1. 코어 계약

게임 ID는 `bigwheel`, 규칙 ID는 `bigwheel-kl-54-v1`이다. `src/core/bigwheel/core.ts`의 `createBigWheel()`, `transitionBigWheel(state, balance, action, env, sessionId)`를 사용한다. 환경은 `nextId()`와 `nextSegmentIndex()`이며 반환은 `{game, balance, active}`다. `BIG_WHEEL_SYMBOLS`, 구역별 이름·칸 수·배당 및 54칸 고정 배열을 코어에서 공유한다.

`pendingBets`는 일곱 구역을 모두 키로 가지는 정수 센트 맵이다. 사용자 명령은 `setBet {target, amountCents}`, `spin`, `nextRound`이며 내부 전용 명령은 `advanceBigWheel`이다. 공개 IPC의 strict 스키마는 내부 전이를 허용하지 않는다. phase는 `betting | spinning | result`다.

진행 판은 roundId·베팅 복사·총액·segmentIndex·정산 여부를 보존한다. Main의 `randomInt(54)`로 회전 시작 시 한 번 추첨하며 이후 저장 실패/재시작에도 재추첨하지 않는다. 정산 결과에는 roundId·당첨 구역·칸 인덱스·베팅·총액·returnCents·netCents를 보존한다. 최근 결과 최대 20개와 정산 횟수/식별 증거로 현재 판의 일관성을 검증한다.

## 2. 저장과 공개 상태

`AppStore`가 게임·공용 지갑·잠금·revision·정산 후 최고 잔액을 한 후보로 저장한다. `AppSessionRepository`는 strict v2/v3 스키마를 보존하고 v4에 `games.bigwheel: null`을 추가하여 이전한다. 기존 v1 이전도 최종 v4로 이어지며 기존 지갑·진행 판·명령 식별자를 유지한다. 이전 실패/백업/미래 버전 동작은 기존 원자 저장 계약을 따른다.

`BigWheelView`는 roundId·phase·pendingBets·totalBetCents·lastResult·recentResults·legalActions를 제공한다. spinning에는 미공개 칸·당첨 구역·내부 정산 식별자를 노출하지 않는다. result의 lastResult에서만 segmentIndex를 공개한다. Main 테스트 fixture는 격리된 E2E 환경에서만 허용한다.

`validateBigWheel`은 총 54칸 규칙, 구역 맵, 베팅 합, phase/round/result 관계, 당첨 칸과 배당, 최근 기록·정산 식별의 일관성 및 안전 정수를 확인한다. 진행 판의 예상 반환과 지갑 덧셈도 복구 시 확인한다.

## 3. UI와 검증 경계

기존 공개 카드 타임라인과 별개로 roundId 기반 휠 표시를 연결한다. Main 정산을 Renderer 완료 콜백에 종속시키지 않는다. 빠른 정산에서도 결과·잔액·최고 레벨·기록은 표시 타임라인으로 함께 공개한다. 숨김/reload 시 최신 공개 상태로 맞추며 중복 지급 명령을 만들지 않는다.

하위 테스트는 순수 규칙·명령·저장 무결성을, 프로덕션 패키지 E2E는 실제 사용자 이동·금액 입력·결과·복구를 검증한다. 세션 실행 결과는 N05 보고서에서 관리한다.
