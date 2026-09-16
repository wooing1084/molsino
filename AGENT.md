# AGENT.md — 에이전트 인계 문서

갱신일: 2026-09-16 · 분석 기준: 현재 소스

설계 기준은 `docs/blackjack-design.md`(제품)와 `docs/blackjack-technical-design.md`(기술)다.
앞으로의 세션별 작업 순서와 완료 조건은 `docs/work-session-roadmap.md`를 따른다.

---

## 프로젝트 개요

`molsino`는 다른 앱 위에 떠 있는 투명 게임 오버레이이며, 현재 첫 게임으로 Blackjack을 제공한다. macOS·Windows 공통 코드 기반.
Electron 44.3 + TypeScript 7 + React 19 + Vite 8.3 + Electron Forge 7.11.2

---

## 현재 상태 — P0 창 기반 부분 완료, P1 완료, S09 IPC 회귀 완료

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
- macOS: `setAlwaysOnTop(true, 'floating')`, `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen:true})`, Dock 숨기기
- Windows: `setAlwaysOnTop(true)`
- `showInactive()` 기반 복원 — 포커스 비탈취 보장
- 단일 인스턴스 잠금 (`requestSingleInstanceLock`), `second-instance`에서 복원
- `close` → `hide` 루프 방지 (`quitting` 플래그)
- 네 모서리 커스텀 리사이즈 → strict IPC → Main `setBounds`
- 220×150~420×280 DIP 및 workArea clamp, 30Hz 병합, 10초 token 만료
- 기본 크기 280×180 DIP, 최소 크기 반응형 레이아웃

**트레이**
- macOS: Template 이미지, 메뉴 막대
- Windows: ICO, 알림 영역 메뉴
- 동작: 보이기/클릭 통과 해제, 숨기기, 전체 클릭 통과, 크기 프리셋(소/기본/대), 종료

**보안·IPC**
- `contextIsolation:true, sandbox:true, nodeIntegration:false, webSecurity:true`
- `app://molsino` 커스텀 프로토콜 — whitelist 경로만 서빙, symlink 탈출 차단
- CSP 헤더 (개발 빌드 HMR 허용 / 배포 빌드 `connect:none`)
- `isTrustedDocument`: sender, senderFrame, URL을 모두 검증
- `userCommandSchema`, `windowCommandSchema`, `resizeCommandSchema` Zod 런타임 검증
- Preload: `ipcRenderer` 미노출, `getSnapshot` / `dispatch` / `onState`와 창 기능만 `contextBridge`로 노출

**코어·테스트**
- `src/core`: 불변 JSON 상태 기반 순수 Blackjack engine(P1 전체)
  - 6덱 312장, 주입형 Fisher–Yates, 75% 컷/78장 안전 여유, 다중 A soft/hard 점수
  - deal/hit/stand, 자연 블랙잭, 딜러 S17, 보험/이븐 머니/서렌더
  - double/DAS, 같은 점수 split, 왼쪽 우선, 최대 4핸드, A split 제한
  - 정수 센트·safe integer, `(roundId, componentId)` 멱등 원장, 상태 무결성 검사
- `tests/core`: P1 규칙·슈·점수·원장과 베팅 경계 40건
- `tests/main/trust.test.ts`: URL 일치·포트 불일치·프로토콜 불일치 커버
- `tests/main/resize-controller.test.ts`: resize geometry·token·timeout 하위 테스트
- `tests/e2e/overlay-resize.spec.ts`: S01 전체 배관 E2E 4건

**GameStore·IPC·플레이 UI·세션 저장**
- Main 단일 작성자 `GameStore`: `commandId` 멱등 캐시/재기동 재전송, `expectedRevision`, busy 방어, 딜러 한 단계씩 저장
- 공개 `GameViewState`: 슈와 딜러 홀 카드를 Renderer에서 차단
- `getSnapshot` / `dispatch` / `onState` IPC와 구독 cleanup 구현
- 베팅, 딜, 보험, 이븐 머니, 히트, 스탠드, 더블, 스플릿, 서렌더, 다음 판, 새 게임 UI 연결
- 결정론적 E2E 슈 fixture 주입과 자연 블랙잭 대표 여정 검증
- `SessionRepository`: versioned `session.json`, 원자 교체·검증된 primary backup, 손상/미래 schema 복구 선택, 실패 후보 재시도, 재기동 복원
- S09: 등록된 최상위 frame·URL별 IPC 송신자 검증, 늦은 snapshot보다 새 revision의 push 유지, 구독 해제·reload, 비정상 payload 거부와 공개 상태 경계 E2E

---

## 아직 없는 것

### 기술 설계서 기준 미구현 항목

| 항목 | 설계서 위치 | 비고 |
|------|------------|------|
| 접힘(collapsed) 모드 140×30 DIP | §4.7 | `setSize`와 별도 경로 필요 |
| 금액 직접 입력 UtilityWindow (`focusable:true`) | §4.4 | 별도 창, 포커스 복원 주의 |
| 다중 모니터 위치 복원 (`displayId`, `workArea`) | §4.7 | `display-metrics-changed` 이벤트 연동 |
| Preferences 저장 | §7.2 | `preferences.json`은 S11 범위 |
| Renderer 장애 복구 (`render-process-gone` → 재동기화) | §7.3 | 현재 `overlay.hide()`만 있음 |
| 자동 부분 클릭 통과 실험 (`forward:true`) | §4.5 (O-10) | 별도 실험 항목 |
| 전체 게임·저장 E2E | §11.2 | S08 복원 6건 완료, E2E-01~21 전체 확장 필요 |

---

## 다음 작업 — 설계서 권장 순서

### 다음 세션 (P0 접힘·펼침)

로드맵 S10(접힘·펼침과 창 상태 모델)을 진행한다. 140×30 DIP 접힘 상태, 펼친 크기 복원, 게임 상태 보존과 중복 전이를 E2E로 검증한다. S09 결과는 [`docs/session-reports/S09-ipc-subscription.md`](docs/session-reports/S09-ipc-subscription.md)에 기록했다.

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
    ipc/trust.ts             ← URL 신뢰 검증 (완료)
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

tests/
  core/*.test.ts             ← P1 코어 40건 완료
  main/game-store.test.ts    ← 멱등·revision·공개 상태·딜러 진행
  main/session-repository.test.ts ← 저장 실패·EPERM·손상·backup 복구
  e2e/overlay-resize.spec.ts ← S01 E2E 4건 완료
  e2e/playable-mvp.spec.ts   ← 베팅→딜→자연 블랙잭→다음 판 E2E
  e2e/persistence.spec.ts    ← S08 복원·손상·미래 버전·컷 경계 E2E 6건
  e2e/ipc-subscription.spec.ts ← S09 snapshot 역순·복구·구독/reload·공개 상태·보안 E2E 5건
  main/resize-controller.test.ts ← 리사이즈 하위 테스트
  main/trust.test.ts         ← 완료

docs/
  blackjack-design.md        ← 제품 설계서 (v0.3)
  blackjack-technical-design.md ← 기술 설계서
  work-session-roadmap.md    ← S00~S18 세션 순서와 현재 상태
  session-reports/S01-custom-resize.md ← S01 변경·검증·이슈
  session-reports/P1-blackjack-core.md ← S02~S06 변경·검증·이슈
  session-reports/S07-playable-mvp.md ← GameStore·IPC·UI 수직 통합
  session-reports/S08-session-repository.md ← 세션 저장·복구·검증 기록
  session-reports/S09-ipc-subscription.md ← IPC·상태 구독 회귀·검증 기록
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
| S09 IPC·Preload·상태 구독 | ✅ macOS arm64 프로덕션 `npm run test:e2e` 16/16 (S09 신규 5건) | S09, E2E-21 보안 경계 |
| 데스크톱 배포 산출물 | ✅ macOS Universal ZIP·Windows x64 포터블 ZIP 생성, macOS 패키지 smoke 통과 | Windows GUI는 실장비 미검증 |
| 10개 체크포인트·Preferences 복원 | ⬜ S15/S11에서 완성 | E2E-17~18 |
| 실제 OS 투명도·외부 앱 포커스 | ⬜ E2E 범위 밖, 통과로 추정하지 않음 | O-02, O-05 |
| Windows 빌드 + 창 동작 | ⬜ 미검증 (CI 대상이나 실 장비 없음) | — |
| 자동 부분 클릭 통과 | ⬜ 미검증 (실험 항목) | O-10 |
