# S07 — GameStore와 플레이 가능한 MVP 수직 통합

상태: 완료  
완료일: 2026-09-16

## 작업 범위

사용자가 우선 실제로 플레이해 볼 수 있게 로드맵 S07 `GameStore`를 완료하고, S09 IPC와 S14 React UI의 최소 수직 경로를 앞당겨 연결했다.

- Main 단일 작성자 `GameStore`
- `getSnapshot` / `dispatch` / `onState` IPC·Preload
- 공개 `GameViewState`와 딜러 홀 카드·슈 마스킹
- 베팅, 딜, 히트, 스탠드, 더블, 스플릿, 서렌더, 보험, 이븐 머니, 다음 판 UI
- Main에서 딜러 내부 명령 자동 진행
- 프로덕션 패키지 대상 대표 플레이 E2E

파일 저장·재기동 복원은 S08 범위로 남겼다. 따라서 이번 결과는 **앱을 켜 둔 동안 플레이 가능한 인메모리 MVP**다.

## 확정 설계

### GameStore

- Main의 `GameStore`만 committed `SessionState`와 revision을 소유한다.
- 명령은 UUID `commandId`, `expectedRevision`, strict `UserAction`으로 검증한다.
- 같은 command ID는 캐시된 결과를 반환하고 다시 실행하지 않는다. 오래된 revision은 `STALE_STATE`로 거부한다.
- 사용자 명령 결과가 `dealerTurn`이면 Renderer에 내부 명령을 노출하지 않고 Main에서 `advanceDealer`를 정산 완료까지 실행한다.
- 현재 전이는 동기식이라 한 dispatch 안에서 후보 상태를 완성한 뒤 한 번에 commit한다. S08 저장 연결 시 각 내부 전이의 저장 checkpoint를 추가한다.

### 공개 상태와 IPC

- Renderer에는 shoe와 내부 원장을 보내지 않는다.
- 딜러 홀 카드 공개 전에는 공개 카드 한 장과 `hiddenCardCount`만 보낸다.
- 결과 화면에는 사용자에게 필요한 라운드별 정산 상세만 보낸다.
- `onState`는 Electron event 객체를 제거한 상태 payload만 전달하며 cleanup 함수를 반환한다.
- Renderer는 구독을 먼저 설치하고 snapshot을 요청하며, 더 낮은 revision은 적용하지 않는다.

### 빠른 플레이 UI

- 베팅 화면에서 −/+/딜을 실행한다.
- 현재 phase와 `legalActions`에 따라 보험·이븐 머니·히트·스탠드·더블·스플릿·서렌더만 표시한다.
- 여러 핸드는 가로 스크롤로 표시하고 현재 핸드를 강조한다.
- 딜러 진행은 즉시 끝내고 결과, 잔액, 다음 판 버튼을 표시한다. 딜러 카드 애니메이션은 후속 UX 범위다.

## 변경사항

- `src/main/game/game-store.ts`: revision, command cache, stale/busy 방어, 내부 딜러 진행, 공개 ViewState
- `src/main/game/shoe-source.ts`: production crypto RNG와 E2E JSON fixture를 완전한 6덱 슈로 조립
- `src/main/main.ts`: GameStore 생성과 strict game IPC, push 구독 연결
- `src/shared/contracts.ts`: 실제 UserCommand/GameViewState/API와 Zod 스키마
- `src/preload/preload.ts`: `dispatch`와 안전한 `onState`
- `src/renderer/main.tsx`, `styles.css`: 스텁을 실제 플레이 UI로 교체
- `tests/main/game-store.test.ts`: 중복 명령, stale revision, 홀 카드/슈 비공개, 내부 딜러 진행
- `tests/e2e/playable-mvp.spec.ts`: $1→$2 베팅, 딜, 자연 블랙잭 정산, 다음 판
- `scripts/smoke.cjs`: 실제 GameStore → core 딜 경로로 갱신

## 검증 결과

- `npm run check`
  - TypeScript root/E2E 검사 통과
  - Vitest 10개 파일, 87개 테스트 전부 통과
- `npm run test:e2e`
  - 환경: macOS arm64, Electron 44.3.0, Forge 프로덕션 패키지
  - 결과: 2개 spec, 5개 시나리오 전부 통과
  - 기존 리사이즈 4건 + 플레이 MVP 1건
- `npm run smoke`
  - 임의 production shoe에서 베팅 변경 → 딜 → GameStore/BlackjackCore → 공개 상태 확인 통과

## 관련 이슈

- 저장소가 아직 없으므로 앱을 종료하면 잔액·슈·진행 중 판이 초기화된다.
- 딜러 카드는 Main에서 즉시 끝까지 진행한다. 카드별 저장과 짧은 연출은 S08/S14에서 보완한다.
- 직접 금액 입력 UtilityWindow는 아직 없고 $1 단위 −/+만 제공한다.
- 전체 E2E-01~21 중 대표 자연 블랙잭 경로만 연결했다. 특수 행동 UI는 core와 연결됐지만 각 분기의 UI E2E는 S14에서 확장한다.
- Windows 실장비 플레이는 미검증이다.
- 작업 디렉터리에 `.git` 저장소가 없어 변경 이력을 Git으로 확인할 수 없다.

## 다음 시작점

S08 — `SessionRepository`와 GameStore commit 연결. 앱을 종료·재실행해도 동일한 잔액, 슈, 진행 중 판을 복원하도록 한다.
