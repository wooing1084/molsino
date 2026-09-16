# P1 — 순수 Blackjack core (S02~S06)

상태: 완료  
완료일: 2026-09-16

## 작업 범위

로드맵의 S02~S06을 한 번에 묶어 Electron·DOM·파일 시스템에 의존하지 않는 Blackjack core를 구현했다.

- S02: 카드·6덱 슈·결정론적 셔플 주입·핸드 점수
- S03: 딜·히트·스탠드·자연 블랙잭·딜러 S17·일반 정산
- S04: 보험·이븐 머니·레이트 서렌더
- S05: 더블·DAS·재스플릿 최대 4핸드·A 스플릿 제한
- S06: 정수 센트·safe integer·항목별 멱등 정산 원장·상태 무결성 검사

GameStore의 `commandId`/`expectedRevision`/busy 직렬화, 저장소, IPC와 Renderer 연결은 P2(S07~S09, S14)의 책임으로 남겼다.

## 확정 설계

### 순수 상태와 주입 경계

- `transition(state, action, environment)`는 입력 상태를 변경하지 않고 `{ nextState, events }`를 반환한다.
- `SessionState`, `RoundState`, `Shoe`는 JSON으로 직렬화 가능한 readonly 데이터다. 슈는 `{ cards, nextIndex }`로 보존한다.
- 코어는 난수 API를 직접 호출하지 않는다. 새 슈와 `roundId`/`handId`는 `EngineEnvironment`에서 주입한다.
- 최초 기본 베팅은 문서의 최소 베팅과 같은 $1로 확정했다.
- 문서의 `initialDeal`, `peekAndNaturals`, `settlement`는 한 명령 안에서 끝나는 일시적 단계다. 저장 상태에는 사용자의 선택이나 딜러 한 장 진행을 기다리는 `betting`, `insuranceDecision`, `playerTurn`, `dealerTurn`, `result`만 남긴다.
- 보험 거절은 `chooseInsurance({ amountCents: 0 })`으로 표현한다. 플레이어 행동은 항상 현재 `handId`를 요구한다.

### 슈와 점수

- 6덱 312장을 만들고 물리 카드 ID를 모두 고유하게 부여한다. 새 세션·reset·재셔플 공급원은 완전한 6덱과 `nextIndex: 0`이어야 한다.
- Fisher–Yates는 `randomInt(maxExclusive)`를 필수 주입받는다.
- A는 가능한 한 11로 계산하고 bust를 피할 때 1로 낮춘다. 최종적으로 11인 A가 남아 있으면 soft다.
- `used >= 234` 또는 `remaining < 78`이면 다음 `deal` 직전에만 새 슈를 요청한다. 판 중 소진은 재셔플하지 않고 `INTEGRITY_ERROR`다.

### 진행과 정산

- 최초 배분은 플레이어 → 딜러 공개 → 플레이어 → 딜러 홀 순서다.
- 딜러 A는 보험/이븐 머니 결정을 받기 전 피크하지 않는다. 딜러 10점은 즉시 피크한다.
- 딜러는 soft 17을 포함한 모든 17에서 스탠드한다. 비교할 live hand가 없으면 드로우하지 않는다.
- split은 같은 점수의 두 카드(10/J/Q/K 조합 포함)에 허용하며, 왼쪽 hand를 끝낸 뒤 오른쪽 hand의 두 번째 카드를 준다. 최대 4핸드, DAS 허용, split A는 각 한 장 후 종료한다.
- 원장은 `(roundId, componentId)`를 키로 사용한다. `componentId`는 `insurance` 또는 `handId`이며 같은 키의 반환금을 두 번 잔액에 더하지 않는다.
- `insurance`는 예약 component ID이고 round ID는 과거 원장과 재사용할 수 없다.
- 각 원장 항목은 wager·return·net을 함께 보존한다. 라운드 순손익은 해당 라운드 항목의 net 합계다.

## 변경사항

- `src/core/models.ts`: Card/Rank/Suit/HandScore
- `src/core/scoring.ts`: 다중 A와 soft/hard 점수
- `src/core/shoe.ts`: 불변 6덱 슈, Fisher–Yates, 컷/안전 여유, draw
- `src/core/game-state.ts`: 세션·라운드·핸드·행동·이벤트 계약
- `src/core/rules.ts`: 자연 블랙잭, S17, 보험 한도, legal actions
- `src/core/settlement.ts`: 정확한 배당과 멱등 원장
- `src/core/engine.ts`: P1 전체 순수 상태 전이와 무결성 검사
- `src/core/errors.ts`: 도메인 오류와 safe-integer 산술
- `tests/core`: 슈/점수, 기본 라운드, 특수 행동, split/double, 원장/오류 회귀 추가

## 검증 결과

이번 작업에 한해 사용자가 세션별 E2E 선작성·상세 검증을 생략하고 P1 전체 구현 후 느슨한 검증을 허용했다. P1은 아직 Main/IPC/Renderer에 연결되지 않은 순수 코어이므로 Playwright E2E는 작성·실행하지 않았다.

- `npm run check`
  - TypeScript root 검사 통과
  - E2E TypeScript 검사 통과
  - Vitest 9개 파일, 78개 테스트 전부 통과
- `npm run package`
  - macOS arm64 Forge 프로덕션 패키징 통과
  - 첫 시도는 sandbox DNS에서 `github.com` 조회 실패, 네트워크 허용 후 재실행해 통과

핵심 회귀에는 312개 고유 카드와 완전한 6덱 검증, 여러 A, 75%/78장 경계, 자연/양쪽 블랙잭, 보험 전 피크 금지, 보험 적중/실패, 이븐 머니, 서렌더, 딜러 S17, 더블, DAS, 10점 카드 split, split 21 일반 지급, A split, 4핸드 제한, 왼쪽 우선, 잔액 부족, stale/reserved hand ID, round ID 재사용, 슈 중간 소진, 원장 중복 지급 방지가 포함된다.

## 관련 이슈

- P1 코어는 아직 앱 UI와 연결되지 않았다. 실제 사용자 여정 E2E는 S09/S14에서 IPC와 UI를 연결할 때 작성한다.
- `commandId` 중복, `expectedRevision`, 동시에 들어온 명령, await 중 재진입은 S07 `GameStore` 범위다.
- 저장 복원·손상/미래 버전·응답 유실은 S08 범위다.
- Renderer에 홀 카드·슈·내부 원장을 노출하지 않는 공개 ViewState 경계는 S09 범위다.
- Windows 실장비 검증은 수행하지 않았다.
- 작업 디렉터리에 `.git` 저장소가 없어 변경 이력을 Git으로 확인할 수 없다.

## 다음 시작점

S07 — `GameStore` 명령 직렬화. `SessionState`를 Main의 단일 작성자가 소유하고 `commandId`, `expectedRevision`, busy, 내부 `advanceDealer`를 코어 전이 주위에 배치한다.
