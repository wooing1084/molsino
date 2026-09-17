# E2E 테스트 스위트 구현 현황

> 최초 작성: 2026-09-15 · 최근 갱신: 2026-09-17(macOS E2E Dock 정리 완료).
> 게임 E2E-01~21은 [`e2e-test-plan.md`](./e2e-test-plan.md), P0 세션 순서는 [`work-session-roadmap.md`](./work-session-roadmap.md)를 기준으로 한다.

## 1. 목표와 접근 원칙

`docs/e2e-test-plan.md`에 설계된 E2E 시나리오 21개(E2E-01~21)를 실제 Playwright 테스트 코드로 확장하는 작업이다. 순수 `BlackjackCore`, 저장 연결 `GameStore`, 게임 IPC·UI가 연결되어 실제 앱에서 플레이하고 재기동 복원할 수 있다. 전체 체크포인트와 행동별 E2E는 후속 세션 범위다.

다음 원칙으로 확장한다:

- 테스트는 **기술 설계서(`docs/blackjack-technical-design.md`) §5.2/§6.1의 실제 계약**을 기준으로 작성한다.
- 대표 자연 블랙잭 여정으로 전체 배관을 먼저 검증했고, 저장 구현과 함께 나머지 분기·복원 시나리오를 추가한다.
- 세션 공식 검증은 `npm run test:e2e`가 원칙이며 이 명령은 Forge 프로덕션 패키지를 먼저 생성한다. P1 묶음 구현은 사용자 지시에 따른 일회성 예외로 `npm run check`와 패키징만 수행했다.
- **가짜로 통과시키지 않는다.** Main에는 실제 core와 GameStore를 연결한다. 테스트 전용 환경변수는 격리된 userData와 결정론적 슈 생성 경계에서만 소비한다.

## 2. 완료된 작업

### 2.1 테스트 러너 도입

- `package.json`에 `"@playwright/test": "1.59.1"` devDependency 추가(기존 `playwright`와 버전 통일),
  `"test:e2e": "playwright test"` 스크립트 추가. devDependencies 알파벳 정렬도 함께 정리함.
- 2026-09-16 `npm install` 완료. `@playwright/test` 1.59.1이 설치되고 lockfile이 동기화됐다.
- `pretest:e2e`에서 `electron-forge package`를 실행해 stale `.vite` 번들로 잘못 실패하지 않게 했다.

### 2.2 `playwright.config.ts` (신규)

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
});
```

### 2.3 TypeScript 격리

- 루트 `tsconfig.json`에 `"exclude": ["tests/e2e"]` 추가 — 앱과 Playwright의 서로 다른 실행 환경을 분리한다.
- `tests/e2e/tsconfig.json` 신규 생성 — 에디터 지원 전용(루트 프로젝트에서 참조 안 됨). `include: ["."]`,
  나머지 컴파일러 옵션은 루트와 유사.

### 2.4 실제 계약 타입 — `tests/e2e/window-api.d.ts`

`tests/e2e/window-api.d.ts`는 별도 미래 타입을 복제하지 않고 `src/shared/contracts.ts`의 실제 `BlackjackAPI`, `GameViewState`, `UserAction`, `CommandResult`를 재사용한다. 따라서 앱 계약과 E2E 타입이 함께 변경된다. 핵심 계약:

- `GameViewState` — `revision`, `phase`(`betting|insuranceDecision|playerTurn|dealerTurn|result`), `balanceCents`, `pendingBetCents`, `betStepCents`, `playerHands: HandView[]`, `activeHandIndex`, `dealerHand: DealerView`, `insurance?`, `evenMoney?`, `lastResult?`. 비공개 슈 순서·잔여량은 노출하지 않는다.
- `UserAction` 판별 유니온 — `setBet | setBetStep | deal | chooseInsurance | acceptEvenMoney | keepBlackjack | hit | stand | doubleDown | split | surrender | nextRound | resetSession`.
- `UserCommand { commandId, expectedRevision, action }`.
- `CommandResult` — `{ok:true, state}` 또는 `{ok:false, error: 'BUSY'|'STALE_STATE'|'INVALID_ACTION'|'VALIDATION_ERROR', message?}`.
- `BlackjackAPI { getSnapshot, dispatch, onState, windowCommand, resize }`.

### 2.5 Main 프로덕션 연결

`protocol.registerSchemesAsPrivileged(...)` 앞에 4줄 추가:

```ts
// E2E 테스트 전용: 격리된 userData로 실제 개발자 세션 파일을 건드리지 않게 한다. 미설정 시 동작 동일.
if (process.env.MOLSINO_TEST_USER_DATA) app.setPath('userData', process.env.MOLSINO_TEST_USER_DATA);
```

환경변수 미설정 시 일반 userData를 사용한다. `src/main/game/shoe-source.ts`는 `BLACKJACK_TEST_SHOE_FIXTURE`를 검증해 고정 prefix와 나머지 카드를 합친 완전한 6덱 슈를 만든다. `src/main/game/game-store.ts`와 `src/main/main.ts`는 실제 `dispatch`, snapshot, push 상태 구독을 제공한다.

### 2.6 공유 테스트 헬퍼 — `tests/e2e/support/*.ts` (신규 4개, 전부 작성 완료)

**`support/app.ts`** — Electron 앱 launch/relaunch/close:

```ts
export interface LaunchedApp { app: ElectronApplication; page: Page; userDataDir: string; }
export interface LaunchOptions { userDataDir?: string; shoeFixture?: string; }

launchApp(options?: LaunchOptions): Promise<LaunchedApp>
  // mkdtemp로 임시 userData 생성 → electron.launch({args:['.'], env:{...process.env, MOLSINO_TEST_USER_DATA, BLACKJACK_TEST_SHOE_FIXTURE?}})
relaunchApp(previous: LaunchedApp, options?): Promise<LaunchedApp>
  // 저장 복원 테스트용 — 같은 userDataDir로 기존 앱 close 후 재launch
closeApp(launched: LaunchedApp, options?: {cleanup?: boolean}): Promise<void>
  // 앱 종료 + 임시 userData 디렉터리 정리(기본값)
```

> `shoeFixture` 옵션(→ `BLACKJACK_TEST_SHOE_FIXTURE` env)은 Main의 실제 슈 생성 경계에 연결되어 결정론적 카드 순서를 보장한다.

**`support/game.ts`** — `window.blackjack` 호출 래퍼:

```ts
getSnapshot(page: Page): Promise<GameViewState>
dispatch(page: Page, action: UserAction, expectedRevision: number): Promise<CommandResult>
dispatchExpectOk(page: Page, action: UserAction, expectedRevision: number): Promise<GameViewState>
  // result.ok가 false면 에러 throw(원인 메시지 포함)
```

**`support/fixtures.ts`** — 픽스처 로더:

```ts
export interface ShoeFixtureCard { cardId: string; rank: string; suit: string; }
export interface ShoeFixture {
  description: string;
  cards: ShoeFixtureCard[];
  remainingBeforeDeal?: number; // shoe-near-cut 전용
  balanceCents?: number;        // low-balance 전용
}
fixturePath(name: string): string   // fixtures/blackjack/<name>.json
loadFixture(name: string): Promise<ShoeFixture>
```

**`support/format.ts`**:

```ts
usd(cents: number): string  // `$${(cents/100).toFixed(2)}`
```

**`support/resize.ts`** — 정확한 BrowserWindow bounds 관찰과 E2E Main cursor stub.

### 2.7 카드 픽스처 — `fixtures/blackjack/*.json` (신규 15개, 전부 작성 완료)

`player-blackjack`, `dealer-blackjack`, `both-blackjack`, `standard-win`, `standard-loss`, `push`,
`insurance-hit`, `insurance-miss`, `even-money-eligible`, `double-eligible`, `split-pair`, `split-ace`,
`late-surrender-eligible`, `shoe-near-cut`, `low-balance` — 15개 전부 생성 완료(설계 문서 §5 목록과 일치,
최초 14개 카운트는 오류였고 실제로는 15개).

카드 순서 = 제품 설계서 §4 진행 순서(플레이어→딜러 공개→플레이어→딜러 비공개, 이후 히트 순서).
`low-balance`의 `balanceCents`와 `shoe-near-cut`의 `remainingBeforeDeal`은 현재 Main이 직접 소비하지 않는다. S08 컷 경계 E2E는 저장 snapshot의 `nextIndex`와 카드 순서를 테스트 프로세스에서 수정해 80장 남은 상황을 만든다. 메타데이터 직접 주입은 후속 범위다.

### 2.8 S01 오버레이 리사이즈 E2E — 완료

- `tests/e2e/overlay-resize.spec.ts`와 `support/resize.ts`를 추가했다.
- `window-api.d.ts`에 `resize(start|update|end|cancel)` 목표 계약을 추가했다.
- Electron Main의 `screen.getCursorScreenPoint()`만 좌표원으로 유지하고, E2E Main context에서 해당 메서드만 임시 stub해 결정론적 좌표를 공급한다. 프로덕션 IPC에는 테스트 좌표 주입 경로가 없다.
- 검증: `npm run test:e2e` — 프로덕션 패키지 생성 후 1개 spec, 4개 시나리오 전부 통과.
- 범위: 실제 핸들→IPC→BrowserWindow bounds, min/max clamp, 종료·cancel token 만료, 220×150 레이아웃.

### 2.9 S07 플레이 가능한 MVP E2E — 완료

- `tests/e2e/playable-mvp.spec.ts`를 추가했다.
- `player-blackjack` 고정 슈로 $1→$2 베팅, 딜, 자연 블랙잭 3:2 정산, $103 잔액, 딜러 홀 카드 공개, 다음 판을 실제 UI에서 검증한다.
- 검증: `npm run test:e2e` — 2개 spec, 기존 리사이즈 4건 + 플레이 1건, 총 5/5 통과.
- 특수 행동은 UI와 core에 연결됐지만 각 분기의 대표 E2E는 S14에서 추가한다.

### 2.10 S09 IPC·상태 구독 E2E — 완료

- `tests/e2e/ipc-state.spec.ts` 5건: 늦은 초기 snapshot과 최신 push 역순, 구독 해제·reload, E2E-21 Node 격리·strict 명령, 슈·홀 카드 비공개, 직접 로드한 비신뢰 문서 IPC 거부.
- 격리된 E2E `userData`에서만 첫 snapshot 캡처 후 응답을 지연시키는 옵션을 사용해 실제 역순을 재현한다. 프로덕션 동작의 상태 계산이나 보안 판정은 바꾸지 않는다.
- `npm run test:e2e`: 프로덕션 패키지 전체 16/16 통과. 상세는 [`session-reports/S09-ipc-state-sync.md`](session-reports/S09-ipc-state-sync.md).

### 2.11 S10 접힘·불투명도·전역 숨기기 E2E — 완료

- `tests/e2e/overlay-state.spec.ts` 9건: 140×30 내부 접힘·펼친 크기 복원·중복 전환, 진행 중 판 보존, 색상 버튼 호버 조절창의 20–100% 슬라이더와 접힘/reload 유지·재실행 초기화, 화면 경계에서 방향 선택·호버 유지/닫힘·게임/창 명령 차단, 숨김/접힘 중 딜러 계속 진행, 헤더 접기 버튼 부재·전역 Alt+백틱 등록·재숨김·복원 경로.
- 불투명도 조절창은 별도 작은 창이므로 `overlay-resize.spec.ts`의 220×150 메인 창 레이아웃을 침범하지 않는다.
- `npm run test:e2e`: macOS arm64 프로덕션 패키지 전체 25/25 통과. `npm run check`: 12파일 110/110 통과. 상세는 [`session-reports/S10-overlay-state-opacity.md`](session-reports/S10-overlay-state-opacity.md).
- 오해를 낳은 헤더 접기 버튼은 제거했다. 기존 접힘 상태·명령은 유지한다. 물리 Alt+백틱 입력과 실제 Tray 클릭은 자동 확인 범위 밖이다.

### 2.12 macOS E2E Dock 정리 — 완료

- 선작성 패키지 E2E는 `dock.isVisible() === true`로 실패했다. 일반 앱은 기존 Dock 표시를 유지하고 E2E 런처에만 `MOLSINO_TEST_HIDE_DOCK=1`을 전달해 `setVisibleOnAllWorkspaces` 뒤 Dock 아이콘을 숨긴다.
- `tests/e2e/dock-lifecycle.spec.ts`에서 실행 중 `dock.isVisible() === false`와 테스트 전용 플래그를 확인한다. macOS arm64 프로덕션 패키지 전체 `npm run test:e2e` 26/26, `npm run check` 12파일 110/110 통과.
- 이미 OS의 최근 사용 앱 영역에 남은 항목을 자동 삭제하거나 사용자 Dock 설정을 바꾸지는 않는다. 테스트가 끝난 뒤 최근 앱 목록에 새 항목이 생기는지까지 OS UI로 검증한 것은 아니다.

## 3. 아직 안 된 작업 (재개 시 순서대로)

1. **S11~S13 창 기능 E2E** — S10 접힘·펼침과 색상 버튼 호버 불투명도 조절창(20–100%)은 완료했다. 위치/다중 모니터·시작 기본값, UtilityWindow, 클릭 통과 회귀를 로드맵 순서대로 추가한다. 재실행 때 창 설정은 기본값으로 돌아가고 게임 세션만 복원한다.
2. **게임용 spec 확장** — S14/S15에서 실제 배관과 UI 계약에 맞춰 작성한다. S08 `persistence.spec.ts` 6건과 S09 `ipc-state.spec.ts` 5건은 완료됐지만 E2E-17 전체 10개 체크포인트와 E2E-18 창 설정 초기화는 미완료다.
   계약(`window-api.d.ts`, `support/*.ts`)과 15개 픽스처, 대표 플레이 spec은 준비돼 있다.
   플랜대로 그룹당 1개씩 병렬 서브에이전트에 위임 가능:
   - `tests/e2e/betting.spec.ts` — E2E-01(초기 기동 스냅샷), E2E-02(베팅 조정 경계)
   - `tests/e2e/standard-rounds.spec.ts` — E2E-03(히트→스탠드 완주), E2E-04(플레이어 자연 블랙잭),
     E2E-05(딜러 블랙잭), E2E-06(양쪽 자연 블랙잭)
   - `tests/e2e/side-rules.spec.ts` — E2E-07~13(보험 구매/거절, 이븐머니 수락/거절, 더블다운, 스플릿,
     A스플릿, 레이트 서렌더) — 7개
   - `tests/e2e/integrity.spec.ts` — E2E-14(연속 클릭 거부), E2E-15(잔액 부족), E2E-16(새 게임 초기화)
   - `tests/e2e/persistence.spec.ts` — E2E-17(저장 복원 10-checkpoint 반복문), E2E-18(창 설정 재실행 초기화),
     E2E-19(저장 손상/미래 스키마), E2E-20(슈 재셔플 경계)
   - E2E-21 Node 격리·비정상 명령 거부 — `ipc-state.spec.ts`에서 완료.

3. **검증:** 각 세션 마지막에 `npm run test:e2e`를 실행하고 통과·실패·스킵 수를 있는 그대로 문서화한다.

## 4. 신규/수정 파일 전체 목록 (현재까지)

**신규**
- `playwright.config.ts`
- `tests/e2e/tsconfig.json`
- `tests/e2e/window-api.d.ts`
- `tests/e2e/support/app.ts`, `support/game.ts`, `support/format.ts`, `support/fixtures.ts`
- `tests/e2e/support/resize.ts`, `tests/e2e/overlay-resize.spec.ts`
- `tests/e2e/playable-mvp.spec.ts`, `tests/e2e/persistence.spec.ts`, `tests/e2e/ipc-state.spec.ts`
- `fixtures/blackjack/*.json` × 15
- `docs/e2e-implementation-status.md`(이 문서)
- `src/main/game/game-store.ts`, `src/main/game/shoe-source.ts`

**수정**
- `tsconfig.json` (`exclude: ["tests/e2e"]` 추가)
- `package.json` (`@playwright/test`, `pretest:e2e`, `test:e2e`, `typecheck:e2e`)
- `src/main/main.ts` (`GameStore`, 게임 IPC, 상태 push, 테스트 userData)
- `src/shared/contracts.ts`, `src/preload/preload.ts`, `src/renderer/main.tsx`, `src/renderer/styles.css`
- `scripts/smoke.cjs`

**아직 미생성**
- `tests/e2e/betting.spec.ts`, `standard-rounds.spec.ts`, `side-rules.spec.ts`, `integrity.spec.ts`와
  `persistence.spec.ts`의 E2E-17 전체 체크포인트·E2E-18 확장

## 5. 알려진 이슈

- 전체 E2E-01~21 전용 spec은 아직 미완료다. 현재 green은 S01 리사이즈 4건, S07 대표 플레이 1건, S08 복원 6건, S09 IPC·보안 5건이다.
- 재실행 게임 복원 대표 경로는 통과했지만 10개 체크포인트 전체·창 설정 재실행 초기화는 아직 통과 조건을 충족하지 않는다.
- E2E는 실제 데스크톱 투명도 합성, 외부 앱 포커스, Windows 실장비 동작을 판정하지 않는다.
- `npm install`이 high severity 취약점 17개를 보고했다. 자동 수정은 수행하지 않았다.
- 현재 변경은 Git 저장소의 PR 브랜치에서 추적한다.
