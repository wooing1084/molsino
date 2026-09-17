# AGENT.md — 에이전트 인계 문서

갱신일: 2026-09-17 · 분석 기준: 현재 소스

설계 기준은 `docs/blackjack-design.md`(제품)와 `docs/blackjack-technical-design.md`(기술)다.
앞으로의 세션별 작업 순서와 완료 조건은 `docs/work-session-roadmap.md`를 따른다.

---

## 프로젝트 개요

`molsino`는 다른 앱 위에 떠 있는 투명 게임 오버레이이며, 현재 첫 게임으로 Blackjack을 제공한다. macOS·Windows 공통 코드 기반.
Electron 44.3 + TypeScript 7 + React 19 + Vite 8.3 + Electron Forge 7.11.2

---

## 현재 상태 — P0 S10.5 금액 입력·게임 오버 경계 완료, P1 완료, S08 저장·S09 IPC 회귀 완료

### 완성된 것

**빌드·인프라**
- 의존성 버전 전부 고정 (`package-lock.json`, `.nvmrc` Node 22.22.1)
- `npm start / typecheck / typecheck:e2e / test / check / package / make / smoke / test:e2e` 스크립트
- GitHub Actions CI (`ci.yml`): macOS·Windows 행렬로 `check + package`
- 배포 workflow (`build-distributables.yml`): macOS Universal ZIP과 Windows x64 Setup/포터블 ZIP artifact
- OS별 로컬 빌드 명령과 배포 절차는 `docs/building-distribution.md`에 정리
- 세션 공식 검증은 프로덕션 패키지 대상 Playwright Electron E2E가 원칙. P1 묶음 작업만 사용자 지시에 따른 일회성 예외로 `npm run check`와 패키징으로 검증

**투명 오버레이 창**
- `frame:false, transparent:true, focusable:false, skipTaskbar:true`
- macOS: `setAlwaysOnTop(true, 'floating')`, `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen:true})`, 일반 앱 Dock 표시·E2E 전용 숨김
- Windows: `setAlwaysOnTop(true)`
- `showInactive()` 기반 복원 — 포커스 비탈취 보장
- 단일 인스턴스 잠금 (`requestSingleInstanceLock`), `second-instance`에서 복원
- `close` → `hide` 루프 방지 (`quitting` 플래그)
- 네 모서리 커스텀 리사이즈 → strict IPC → Main `setBounds`
- 220×150~420×280 DIP 및 workArea clamp, 30Hz 병합, 10초 token 만료
- 기본 크기 280×180 DIP, 최소 크기 반응형 레이아웃
- S10 접힘 140×30 DIP·펼친 bounds 복원·중복 전환 방지, 진행 중 판 보존
- 헤더 `▁` 접기 버튼은 일시정지와 혼동되어 제거. 내부 접힘 명령·상태는 유지하며, 헤더 `−` 및 전역 Alt+백틱은 숨기기 전용. 트레이에서 복원
- 색상 전환 버튼 호버의 별도 조절창: 전경 불투명도 슬라이더 20–100%(5% 단위, 기본 65%), 화면 경계에서 좌우 방향 선택; 접힘·reload 중 값 유지, 앱 재실행 시 초기화
- 접힘·숨김 중에도 Main의 딜러 자동 진행·단계별 저장 유지, 펼침·복원 시 최신 판 표시

**트레이**
- macOS: Template 이미지, 메뉴 막대
- Windows: ICO, 알림 영역 메뉴
- 동작: 보이기/클릭 통과 해제, 숨기기, 전체 클릭 통과, 크기 프리셋(소/기본/대), 종료

**보안·IPC**
- `contextIsolation:true, sandbox:true, nodeIntegration:false, webSecurity:true`
- `app://molsino` 커스텀 프로토콜 — whitelist 경로만 서빙, symlink 탈출 차단
- CSP 헤더 (개발 빌드 HMR 허용 / 배포 빌드 `connect:none`)
- `isTrustedIpcSender` / `isTrustedDocument`: webContents·mainFrame identity·정확한 URL을 모두 검증
- `userCommandSchema`, `windowCommandSchema`, `resizeCommandSchema`, `opacityPercentSchema` Zod 런타임 검증
- Preload: `ipcRenderer` 미노출, `getSnapshot` / `dispatch` / `onState`와 창 기능만 `contextBridge`로 노출

**코어·테스트**
- `src/core`: 불변 JSON 상태 기반 순수 Blackjack engine(P1 전체)
  - 6덱 312장, 주입형 Fisher–Yates, 75% 컷/78장 안전 여유, 다중 A soft/hard 점수
  - deal/hit/stand, 자연 블랙잭, 딜러 S17, 보험/이븐 머니/서렌더
  - double/DAS, 같은 점수 split, 왼쪽 우선, 최대 4핸드, A split 제한
  - 정수 센트·safe integer, `(roundId, componentId)` 멱등 원장, 상태 무결성 검사
- `tests/core`: P1 규칙·슈·점수·원장과 S10.5 센트 베팅·게임 오버 경계 검증
- `tests/main/trust.test.ts`: contents·subframe·URL·포트·프로토콜 거부 커버
- `tests/main/resize-controller.test.ts`: resize geometry·token·timeout 하위 테스트
- `tests/e2e/overlay-resize.spec.ts`: S01 전체 배관 E2E 4건

**GameStore·IPC·플레이 UI·세션 저장**
- Main 단일 작성자 `GameStore`: `commandId` 멱등 캐시/재기동 재전송, `expectedRevision`, busy 방어, 딜러 한 단계씩 저장
- 공개 `GameViewState`: 슈와 딜러 홀 카드를 Renderer에서 차단
- `getSnapshot` / `dispatch` / `onState` IPC와 구독 cleanup 구현
- S09 프로덕션 E2E: 늦은 snapshot/최신 push 역순, reload·구독 해제, 비신뢰 문서 IPC 거부, Node 격리, 내부 명령·비공개 정보 차단
- 베팅, 딜, 보험, 이븐 머니, 히트, 스탠드, 더블, 스플릿, 서렌더, 다음 판, 새 게임 UI 연결
- 결정론적 E2E 슈 fixture 주입과 자연 블랙잭 대표 여정 검증
- `SessionRepository`: versioned `session.json`, 원자 교체·검증된 primary backup, 손상/미래 schema 복구 선택, 실패 후보 재시도, 재기동 복원
- S09: 등록된 최상위 frame·URL별 IPC 송신자 검증과 신뢰 문서로만 상태 push, 늦은 snapshot보다 새 revision의 push 유지, 구독 해제·reload, 비정상 payload 거부와 공개 상태 경계 E2E
- S10.5: 베팅 금액 숫자칸 클릭 시 같은 자리에 텍스트 필드 표시, Enter 확정·Escape/필드 밖 클릭 취소, $1.00~현재 잔액의 센트 베팅. 편집 중에만 메인 창 포커스를 허용하고 종료·숨김·접힘·클릭 통과·reload 시 해제
- S10.5: 자연 블랙잭·서렌더의 반 센트 반환금 올림, 정산 후 잔액 $1.00은 다음 판 가능·$0.99 이하는 게임 오버/새 게임. 프로덕션 패키지 E2E 7건 추가

---

## 아직 없는 것

### 기술 설계서 기준 미구현 항목

| 항목 | 설계서 위치 | 비고 |
|------|------------|------|
| 다중 모니터 위치 보정 (`displayId`, `workArea`) | §4.7 | S11과 함께 TOBE 보류 |
| 창 설정 재실행 초기화·다중 모니터 | §4.7·§7.2 | S11 전체 TOBE 보류. `preferences.json`은 만들지 않음 |
| Renderer 장애 복구 (`render-process-gone` → 재동기화) | §7.3 | 현재 `overlay.hide()`만 있음 |
| 자동 부분 클릭 통과 실험 (`forward:true`) | §4.5 (O-10) | 별도 실험 항목 |
| 전체 게임·저장 E2E | §11.2 | S08 복원 6건·S09 IPC 11건·S10.5 베팅/게임 오버 7건 완료, E2E-18(TOBE)을 제외한 나머지 확장 필요 |

---

## 다음 작업 — 설계서 권장 순서

### 다음 세션 (S12 인라인 금액 입력의 포커스·접근성 회귀)

사용자 결정(2026-09-17)에 따라 S11(위치·다중 모니터와 시작 기본값) 전체를 TOBE로 보류한다. 다음은 S12에서 S10.5 인라인 금액 입력의 반복 시작·종료, 숨김·복원 뒤 포커스 상태, 키보드·접근성 경로를 회귀 검증한다. 별도의 금액 입력 UtilityWindow는 만들지 않는다. S10.5 변경·검증과 실제 업무 앱 포커스 한계는 [`docs/session-reports/S10.5-inline-bet-input.md`](docs/session-reports/S10.5-inline-bet-input.md)에 기록했다.

### 구현 순서

기술 설계서 §11.4(P0~P3)를 따른다. 세션 단위 작업 순서는 [`docs/work-session-roadmap.md`](docs/work-session-roadmap.md)를 참조한다.

---

## 파일 구조 현황

전체 예정 구조(생성 예정 포함)는 [기술 설계서](docs/blackjack-technical-design.md) §10을 참고. 아래는 현재 실제로 존재하는 파일과 완료 여부만 표시한다.

```
src/
  main/
    main.ts                  ← 창·트레이·IPC·프로토콜 (완료)
    game/game-store.ts       ← Main 단일 작성자·저장 후 commit·공개 ViewState (완료)
    game/shoe-source.ts      ← production RNG·결정론적 E2E 슈 fixture (완료)
    windows/resize-controller.ts ← 커스텀 리사이즈 상태·bounds 계산 (완료)
    ipc/trust.ts             ← sender·frame·URL 신뢰 검증 (완료)
    platform/adapter.ts      ← macOS/Windows 창 정책 분기 (완료)
    persistence/session-repository.ts ← 세션 원자 저장·backup·복구 (완료)
  preload/preload.ts         ← 게임·창 contextBridge API (완료)
  renderer/main.tsx          ← 실제 GameViewState 플레이·복구 UI (완료)
  core/
    betting.ts               ← 기본 베팅 검증
    models.ts                ← Card/Rank/Suit/HandScore
    scoring.ts               ← 다중 A soft/hard 점수
    shoe.ts                  ← 불변 6덱 슈·셔플·draw·컷
    game-state.ts            ← P1 세션·라운드·행동 계약
    rules.ts                 ← legal actions와 카지노 규칙 조건
    settlement.ts            ← 배당·멱등 원장
    engine.ts                ← 순수 상태 전이
    errors.ts                ← 도메인 오류·safe 산술
  shared/contracts.ts        ← 채널·Zod 스키마·타입 (완료)
  shared/bet-input.ts        ← 달러 텍스트를 정수 센트로 파싱 (완료)

tests/
  core/*.test.ts             ← P1 코어 40건 완료
  main/game-store.test.ts    ← 멱등·revision·공개 상태·딜러 진행
  main/session-repository.test.ts ← 저장 실패·EPERM·손상·backup 복구
  e2e/overlay-resize.spec.ts ← S01 E2E 4건 완료
  e2e/overlay-state.spec.ts ← S10 접힘·불투명도·호버 조절창·전역 숨김 등록 E2E 9건
  e2e/dock-lifecycle.spec.ts ← macOS E2E 실행 중 Dock 아이콘 숨김 회귀 1건
  e2e/playable-mvp.spec.ts   ← 베팅→딜→자연 블랙잭→다음 판 E2E
  e2e/persistence.spec.ts    ← S08 복원·손상·미래 버전·컷 경계 E2E 6건
  e2e/ipc-state.spec.ts      ← S09 역순·reload·보안 E2E 5건
  e2e/ipc-subscription.spec.ts ← S09 snapshot 역순·복구·구독/reload·공개 상태·보안 E2E 6건
  e2e/betting.spec.ts        ← S10.5 인라인 금액 입력·센트 베팅·게임 오버 경계 E2E 7건
  main/resize-controller.test.ts ← 리사이즈 하위 테스트
  main/trust.test.ts         ← 완료

docs/
  blackjack-design.md        ← 제품 설계서 (v0.4)
  blackjack-technical-design.md ← 기술 설계서
  work-session-roadmap.md    ← S00~S18 세션 순서와 현재 상태
  session-reports/S01-custom-resize.md ← S01 변경·검증·이슈
  session-reports/P1-blackjack-core.md ← S02~S06 변경·검증·이슈
  session-reports/S07-playable-mvp.md ← GameStore·IPC·UI 수직 통합
  session-reports/S08-session-repository.md ← 세션 저장·복구·검증 기록
  session-reports/S09-ipc-state-sync.md ← IPC·상태 구독 회귀·검증 기록
  session-reports/S09-ipc-subscription.md ← 병합된 S09 IPC·상태 구독 회귀 기록
  session-reports/S10-overlay-state-opacity.md ← 접힘·불투명도·헤더 버튼 제거·전역 숨기기 검증 기록
  session-reports/S10.5-inline-bet-input.md ← 인라인 금액 입력·게임 오버 경계 검증 기록
  building-distribution.md ← macOS·Windows 빌드·배포 가이드
```

---

## 기술 결정 메모

핵심 기술 결정(정수 센트, `commandId`+`expectedRevision`, 원장 키, 딜러 홀 카드 비공개, `resizable:false`+`setBounds`, 클릭 통과 정책)은 [기술 설계서](docs/blackjack-technical-design.md) §4.5, §4.6, §6.1, §6.4, §7.1에 정의되어 있다. 이 문서에서 재서술하지 않는다.

---

## 검증 기록

| 항목 | 상태 | 관련 ID |
|------|------|---------|
| S01 프로덕션 패키지 + 리사이즈 E2E | ✅ 4/4 통과 (`npm run test:e2e`) | O-05 자동화 범위 |
| P1 순수 Blackjack core | ✅ `npm run check` 9파일 78/78 + macOS arm64 `npm run package` 통과 | S02~S06 묶음 예외 검증 |
| S07 인메모리 플레이 MVP | ✅ `npm run check` 10파일 87/87, `npm run test:e2e` 5/5, `npm run smoke` 통과 | S07 + S09/S14 일부 |
| S08 세션 저장·재기동 복원 | ✅ `npm run check` 11파일 92/92, macOS arm64 프로덕션 `npm run test:e2e` 11/11, `npm run smoke` | S08, E2E-17/19/20 일부 |
| S09 IPC·상태 구독 회귀 | ✅ `npm run check` 11파일 108/108, macOS arm64 프로덕션 `npm run test:e2e` 16/16 | S09, E2E-21 |
| S09 IPC·Preload·상태 구독 (병합 PR #1) | ✅ macOS arm64 프로덕션 `npm run test:e2e` 17/17 (S09 신규 6건) | S09, E2E-21 보안 경계 |
| S10 접힘·불투명도·전역 숨기기 | ✅ macOS arm64 프로덕션 `npm run test:e2e` 25/25 (S10 9건), `npm run check` 110/110 | S10, O-01/O-05/O-11 자동화 범위 |
| macOS E2E Dock 정리 | ✅ macOS arm64 프로덕션 전체 `npm run test:e2e` 26/26, `npm run check` 110/110 | 테스트 앱 한정 Dock 숨김, 일반 앱 정책 유지 |
| 최신 DEV 병합 통합 검증 | ✅ macOS arm64 프로덕션 `npm run test:e2e` 32/32, `npm run check` 114/114 | 병합된 S09 회귀 6건 포함 |
| S10.5 인라인 베팅·게임 오버 경계 | ✅ macOS arm64 프로덕션 전체 `npm run test:e2e` 39/39 (S10.5 7건), `npm run check` 13파일 130/130 | 최소 $1.00, 잔액 전체 상한, $0.99 게임 오버, 센트 입력·정산 |
| 데스크톱 배포 산출물 | ✅ macOS Universal ZIP·Windows x64 포터블 ZIP 생성, macOS 패키지 smoke 통과 | Windows GUI는 실장비 미검증 |
| 10개 체크포인트 | ⬜ S15에서 완성 | E2E-17 |
| 창 설정 재실행 초기화 | ⏸ S11과 함께 TOBE 보류 | E2E-18 |
| 실제 OS 투명도·외부 앱 포커스 | ⬜ E2E 범위 밖, 통과로 추정하지 않음 | O-02, O-05 |
| Windows 빌드 + 창 동작 | ⬜ 미검증 (CI 대상이나 실 장비 없음) | — |
| 자동 부분 클릭 통과 | ⬜ 미검증 (실험 항목) | O-10 |
