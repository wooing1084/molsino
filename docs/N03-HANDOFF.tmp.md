# N03 바카라 구현 — 중단 시점 임시 인수인계

**목적:** 사용자가 중단한 N03 작업을 다른 에이전트가 현재 작업 트리에서 이어갈 수 있게 컨텍스트를 보존한다.

**요약:** 바카라 코어·공용 저장·메뉴·화면을 구현했고 하위 테스트 154개 및 신규 바카라 패키지 E2E 22개가 통과했다. 마지막 메서드 이름 변경 이후 재검증, 기존 전체 회귀, 화면 PNG 시각 확인, 문서 마무리·push·PR은 아직 하지 않았다. 사용자의 후속 요청으로 이 중단 상태와 인수인계 문서를 WIP 커밋으로 보존한다. N03 완료 보고서가 아니다.

## 목차

- [1. 사용자 요청과 중단 상태](#1-사용자-요청과-중단-상태)
- [2. 저장소와 실행 환경](#2-저장소와-실행-환경)
- [3. 구현 내용과 파일](#3-구현-내용과-파일)
- [4. 실제 검증 결과](#4-실제-검증-결과)
- [5. 다음 에이전트의 작업](#5-다음-에이전트의-작업)
- [6. 설계 판단과 주의점](#6-설계-판단과-주의점)

기록일: 2026-09-18, Asia/Seoul. 상태: **사용자 요청으로 구현 중단**, 작업 트리 보존.

## 1. 사용자 요청과 중단 상태

1. 사용자가 다음 세션 작업을 물었다. 현재 로드맵과 N02 보고서를 확인하고 다음 세션이 **N03 바카라 구현**이라고 답했다.
2. 사용자가 “구현해줘”라고 요청해 N03 구현을 진행했다.
3. 가장 최근 요청: **“지금 작업 내용 중단하고 중단지점까지 컨텍스트 내용 임시로 다른 에이전트가 이어서 할 수 있게 문서 만들어봐”**.
4. 이 요청 이후 기능 변경·테스트 실행을 중단하고 현재 상태 확인과 이 문서 작성만 했다.
5. 후속 요청 **“커밋까지 해줘”**에 따라 현재 작업과 이 문서를 WIP 커밋으로 보존한다. 구현 재개나 push·PR 요청은 아니므로 수행하지 않는다. 재개 요청이 있기 전까지 자동으로 계속 구현하지 않는다.

별도 에이전트를 생성하지 않았다. 사용자가 이후 재개하면 아래의 미완료 작업을 이어간다. 기존 변경을 초기화하거나 새로 구현하지 않는다.

## 2. 저장소와 실행 환경

- 작업 경로: `/Users/curvc/Desktop/01_projects/00_private/game`
- 브랜치: `codex/n03-baccarat`
- 기준 HEAD: `87fd228 feat: separate app menu and shared session from blackjack (#10)`
- 원격: `https://github.com/wooing1084/molsino.git`
- 시작 시 `git fetch origin DEV` 후 `origin/DEV`에서 작업 브랜치를 생성했다.
- 중단 당시 변경은 모두 미커밋이었으며, 후속 요청으로 `wip: implement baccarat and record N03 handoff` 커밋에 보존한다. 정확한 해시는 `git log -1 --oneline`으로 확인한다. push·PR 생성·병합은 하지 않았다. 새 소스·테스트·이 문서도 커밋에 포함한다.
- Node `v22.22.1`, npm `10.9.4`, Electron `44.3.0`, macOS arm64.
- 정확한 의존성과 스크립트: `package.json`, `package-lock.json`.
- 로컬 규칙: 루트의 `AGENT.md`(단수 파일명), `docs/documentation-guide.md`, `docs/work-session-roadmap.md`를 읽었다. 현재 로드맵은 구현·E2E·문서·커밋·push·DEV 대상 PR까지를 세션 범위로 둔다.
- 샌드박스에서 Git 메타데이터 쓰기는 막혔으므로 fetch/branch는 `require_escalated`로 성공했다. Electron GUI E2E도 escalation으로 실행했다. 자동 승인 거절은 없었다.
- `gh` 위치: `/opt/homebrew/bin/gh`. 인증 상태는 아직 확인하지 않았다.
- 패키지 빌드는 로컬 Electron ZIP을 지정하여 성공했다:

```sh
MOLSINO_ELECTRON_ZIP_DIR=/Users/curvc/Library/Caches/electron/f9c7436ab4a2c1ed6ac6cea2902187de75bd5b7a60c0973ad8967c318a6313c3 npm run package
```

실행 패키지: `out/molsino-darwin-arm64/molsino.app/Contents/MacOS/molsino`.

테스트는 임시 userData를 생성하여 사용했고 실제 사용자 게임 저장은 변경하지 않았다. 현재 이어서 기다려야 할 빌드나 E2E 프로세스는 없다.

## 3. 구현 내용과 파일

### 새 파일

| 파일 | 현재 내용 |
| --- | --- |
| `src/core/baccarat/core.ts` | 순수 규칙, strict 상태/명령 스키마, 슈·버림, 점수, 세 번째 카드, 정수 센트 배당, 단계별 전이, 저장 무결성 검증 |
| `src/main/game/baccarat-adapter.ts` | 공개 카드·점수·결과·최근 기록·허용 동작만 추출하며 슈·정산 증거를 숨김 |
| `src/main/game/baccarat-shoe-source.ts` | Main crypto 난수 및 격리 테스트용 결정론적 8덱 슈 생성 |
| `src/shared/baccarat-view.ts` | 바카라 공개 상태 타입 |
| `src/renderer/games/baccarat.tsx` | 두 패·대상 선택·금액 편집·딜·결과·최근 기록·재시도·잔액 부족 안내 |
| `tests/core/baccarat.test.ts` | 규칙표·정산·안전 정수·슈·단계·손상 저장·기록 보조 테스트 19개 |
| `tests/e2e/baccarat.spec.ts` | 실제 프로덕션 패키지의 바카라 API/UI·복구 E2E 22개 |

### 기존 코드 변경

- `src/main/game/app-store.ts`: 바카라 환경·게임 선택·사용자 명령·자동 진행을 기존 단일 작성자에 통합. 공용 지갑을 그대로 사용한다.
- `src/main/persistence/app-session-repository.ts`: `games.baccarat`를 null 또는 바카라 상태로 허용. 게임 검증·sessionId 정산 키·동시 진행 잠금을 검사한다. 파일 형식은 기존 설계대로 v2를 유지한다.
- `src/shared/app-contracts.ts`: strict `baccarat {action}` 분기와 `AppView.baccarat` 추가. 내부 `advanceBaccarat`는 공개 명령에 없다.
- `src/main/main.ts`: 바카라 슈 주입, 복구 공개 상태 필드, 두 게임의 베팅 입력 포커스/편집 중 딜 제한 연결.
- `src/renderer/main.tsx`: 바카라 메뉴 활성화, 별도 게임 컴포넌트, 메뉴 복귀·공통 헤더 연결.
- `src/renderer/styles.css`: 바카라 두 패·한 줄 기록·대상 버튼·최소 크기 레이아웃.
- `tests/e2e/support/app.ts`: `baccaratFixture` 옵션과 `BACCARAT_TEST_SHOE_FIXTURE` 환경 변수. Main은 `MOLSINO_TEST_USER_DATA`가 있을 때만 픽스처를 읽는다.
- `tests/e2e/app-menu.spec.ts`: N02의 “바카라 준비 중” 기대를 활성화된 메뉴로 변경. 나머지 회귀 구조는 보존했다.
- `tests/main/app-store.test.ts`: 바카라 진입 거부 대신 현재 화면 외의 바카라 행동 거부를 검사하도록 수정.

### 게임 상태와 구현 정책

- 규칙: 8덱 416장, P→B→P→B 배분, 어느 한쪽 내추럴 8/9에서 종료, Player 및 Banker 세 번째 카드 표 적용.
- 베팅: P/B/T 중 한 곳, 최소 100센트, 1센트 단위. 차감은 deal에서 한 번.
- 배당: P 2배 총 반환, B 원금 + 95% 이익을 반 센트 올림, T 9배 총 반환. P/B의 Tie는 원금 반환.
- deal 전에 중간 곱·최대 반환·결과 잔액의 안전 정수 범위를 검사한다.
- 슈: 첫 카드와 burn 값만큼 추가 버림, 소비 인덱스 402 이후 다음 판 시작에서 교체. 진행 중 셔플하지 않는다.
- phase: `betting | dealing | result`. round stage: `initial | playerThird | bankerThird | settle | settled`.
- 단계마다 공용 wallet·카드·phase·잠금을 기존 원자 저장 경로로 확정한 뒤 다음 단계를 예약한다.
- `lastResult.settlementKey`는 sessionId/gameId/roundId/componentId를 포함한다. 현재 판 stage, commandId/revision, 단조 증가 `settledRoundCount`로 중복 실행을 막는다.
- 최근 표시 기록은 최대 20개. 내부에는 `number`를 저장하여 연속 순번을 검증하고 공개 상태에서는 roundId/outcome만 노출한다. 전체 과거 정산 원장을 추가한 구현은 아니다.
- 저장 검증은 8덱 구성·고유 ID·burn·소비 위치와 현재 판 카드를 해당 슈 prefix에서 결정론적으로 재생하여 검사한다. 마지막 정산·기록·phase 일관성도 확인한다.
- 화면 금액 입력은 공통 십진 파서, Enter 확정, Escape/blur 취소, 임시 포커스 해제. 목표 선택 표시는 흑백 테두리·밑줄로 한다.

## 4. 실제 검증 결과

### 실행 완료

| 순서 | 명령/확인 | 결과와 적용 시점 |
| --- | --- | --- |
| 1 | 기존 패키지에 선작성 `baccarat.spec.ts` 1개 실행 | 바카라 버튼 부재로 예상 실패. 이후 구현 진행 |
| 2 | 초기 연결 후 `npm run check` | 타입 검사 + 기존 15파일 135개 통과 |
| 3 | 바카라 core 테스트 추가 후 `npm run check` | 앱/E2E 타입 검사 + 16파일 154개 통과 |
| 4 | 위 로컬 ZIP 지정 `npm run package` | macOS arm64 프로덕션 패키징 성공 |
| 5 | E2E 확장 후 `npm run typecheck:e2e` | 통과 |
| 6 | `npx playwright test tests/e2e/baccarat.spec.ts --timeout=25000` | **22/22 통과, 실패·스킵 없음, 57.6초** |

**검증 시점 주의:** 154개 하위 테스트와 패키징 후, AppStore 메서드 이름을 `resumeDealer()` → `resumeAutomatic()`으로 바꾸고 Main 호출도 맞췄다. 마지막 변경은 이름 변경·포맷 정리 및 문서 수정이며 **그 이후 typecheck/check/package를 다시 실행하지 않았다**. 통과한 22개 E2E는 이름 변경 전 빌드된 패키지를 사용했다. 현재 소스의 최종 검증으로 과장하지 않는다.

### 22개 바카라 E2E가 확인한 범위

- 메뉴 실제 클릭 → 기본 Player 선택 → 딜 → 결과 → 메뉴.
- P 승/패, B $1.01→$1.97 및 $1.10→$2.15, T 적중/패배, P/B의 Tie 원금 반환. 수수료 문구와 실제 금액 편집 포함.
- 결과에서 Renderer reload 후 저장 파일 불변.
- `initial`, `playerThird`, `bankerThird`, `settle`, `settled` 각각 실제 저장 상태에서 SIGKILL → 같은 userData 재기동. 양쪽 3장·결과·한 개 기록·진행 중 잠금 확인.
- 배분 전과 정산 전 backup 경로를 디렉터리로 만들어 실제 저장 실패 → 파일 불변 → 오류 UI에서 재시도 → 정상 종료·재기동 후 결과 보존.
- 동일 명령 재전송, 같은 revision 동시 딜, 내부 행동 위조, 복수 대상·잘못된 금액, 딜 이후 베팅 변경, 다른 게임·이전 세션 명령 거부.
- snapshot/push/명령 응답에 shoe·burnCount·nextIndex·settlementKey·startIndex 없음.
- APP-08: 블랙잭 자연 승리 후 바카라 승리, 잔액 $100→$101.50→$102.50, 게임 왕복 시 각 슈와 결과 보존.
- 22판을 진행해 최근 20개 순서, 재실행 보존, 전체 초기화 시 두 게임 상태 제거.
- 잔액 99센트 딜 차단, 100센트 딜 후 0센트여도 정산 완료, 메뉴의 $100 새 시작.
- 220×150/280×180/420×280에서 버튼 영역 24×24 이상·창 경계 안 배치. 입력 오류·Escape/blur 취소·focusable 해제, 흑백 전환·불투명도·숨김 중 자동 진행.

### 화면 캡처

아래 폴더의 PNG 존재를 확인했지만 **이미지 자체를 열어 시각 검토하지는 않았다**:

`test-results/baccarat-BAC-05-13-최소·기본·최대-크기-입력-취소·검증-흑백·불투명도·숨김-중-진행/`

- `baccarat-220x150.png`
- `baccarat-280x180.png`
- `baccarat-420x280.png`
- `baccarat-result-220x150.png`

다음 Playwright 실행은 test-results를 덮어쓸 수 있다. 필요하면 먼저 확인·보존한다.

### 아직 확인하지 않은 범위

- 새 코드에서 기존 전체 49개 E2E 회귀 및 smoke는 실행하지 않았다.
- 컷 인덱스 401→경계 넘은 판 완료→다음 판 새 슈는 core 테스트에서 통과했고, 별도 패키지 E2E는 아직 없다. E2E는 burn/소비 인덱스·메뉴 왕복 보존을 확인한다.
- 금액이 큰 기존 블랙잭 결함·Renderer 장애 복원 등 N01 제외 범위는 수정하지 않았다.
- Windows GUI, 실제 외부 앱 포커스 복귀·클릭 전달, 물리 Alt+백틱·트레이·OS 투명 합성은 검증하지 않았다.

## 5. 다음 에이전트의 작업

사용자가 재개를 요청했을 때 진행한다.

1. `git status`와 이 문서를 확인하고, WIP 커밋의 전체 변경은 `git diff 87fd228..HEAD`로 확인한다. 새 소스·테스트도 해당 커밋에 포함되어 있다.
2. 캡처 PNG를 열어 최소 크기와 결과의 카드·버튼·문구 잘림을 시각 확인한다. 현재 DOM 경계 검사는 통과했다.
3. 최종 소스에 `npm run check`, 로컬 ZIP 지정 패키징을 실행한다. 이후 변경 관련 기존 블랙잭·메뉴·저장·IPC·오버레이 회귀를 실행한다. 전체 실행이면 기존 49 + 새 22 = 현재 예상 71개이다. 실제 runner 수를 기준으로 보고한다.
4. `npm run smoke`를 확인한다. 필요 시 발견된 문제를 수정하고 관련 범위만 재검증한다.
5. 아래의 추가 검증 아이디어는 아직 작성·실행하지 않은 제안이다. 완료 조건에 필요한지 판단하여 보강한다.
   - 저장 실패/강제 종료 E2E의 현재 결정론적 판은 Player 베팅 패배 경로다. Banker 베팅 승리로 바꾸거나 한 사례를 추가하면 재시도 후 지급 중복까지 더 직접적으로 검증할 수 있다. 현재 최종 9900센트 assertion을 바꾸기 전 정확한 베팅·배당을 맞춘다.
   - 패키지 E2E에서 저장된 유효 betting 슈의 소비 인덱스 401을 활용해 판 중 셔플 없음과 다음 판 교체를 확인.
   - APP-08의 “다른 게임에서 잔액 감소 후 복귀 시 pending bet 조정”은 구현되어 있지만 전용 E2E는 아직 없다.
6. 문서를 완성한다. **현재 문서 작업이 중간 상태**다:
   - `docs/games/baccarat/implementation-status.md` **미생성**.
   - `docs/games/baccarat/e2e-implementation-status.md` **미생성**.
   - 일부 수정 문서가 위 두 파일로 이미 링크하므로 현재 깨진 링크가 있다.
   - `docs/session-reports/N03-baccarat.md` 등 N03 보고서 **미생성**. 실제 최종 검증 수·환경·실패 이력·미확인 범위를 기록해야 한다.
   - `docs/session-reports/session-list.md`와 `docs/work-session-roadmap.md` **미갱신**. 최종 완료 후 N04 사용성 개선으로 다음 시작점을 갱신한다.
   - AGENT/README/문서 안내, 바카라 설계/E2E 설계, 메인 제품·기술·구현/E2E 문서는 일부 갱신했다. N03 구현 문구가 있어도 최종 완료 판정으로 취급하지 말고 코드·검증과 맞춘다.
   - 상대 링크 검사와 문서 간 현재 상태 충돌 검토가 필요하다. 과거 S/N02 보고서는 당시 이력으로 그대로 보존한다.
7. 최종 diff 검토 후 완료 변경을 추가 커밋하고 작업 브랜치 push·`DEV` 대상 PR 생성. `.github/PULL_REQUEST_TEMPLATE.md`를 사용하고 실제 검증/한계를 명시한다. 현재 원격 PR은 없다.
8. 정식 보고서에 필요한 내용을 옮긴 뒤 이 임시 문서는 사용자의 의도에 맞게 정리한다. 최종 커밋에 포함할지 별도로 판단한다.

## 6. 설계 판단과 주의점

- 기준 설계는 로컬 `docs/games/baccarat/{product-design,technical-design,e2e-test-plan}.md`와 메인 기술 설계 §9다. 별도 신규 기능이나 폐기한 구 백로그를 끌어오지 않는다.
- Banker 95% 곱의 나머지는 정수 센트에서 5의 배수만 가능하다. 기존 설계의 “49/50/51” 표현을 실제 가능한 인접 경계 **45/50/55**로 수정했다. 테스트는 $1.09, $1.10, $1.11 및 $1.01을 포함한다.
- 바카라 상태에 지갑을 중복 저장하지 않는다. 결과 저장과 공용 wallet, 기록, 게임 잠금 해제를 한 스냅샷으로 저장한다.
- 앱 메서드 `resumeAutomatic`은 블랙잭·바카라 공용 자동 진행이다. 구 보조용 `src/main/game/game-store.ts`의 `resumeDealer`는 기존 블랙잭 구현이며 이름을 바꾸지 않았다.
- 신규 상태 스키마·규칙·검증기가 하나의 core 파일에 있다. 실제 필요 없이 범용 플러그인 프레임워크나 블랙잭 대규모 재구조화로 범위를 확대하지 않는다.
- 저장 검증은 현재 판의 결정론적 재생과 최신 정산 증거, 최근 순번의 일관성을 검사한다. 전체 역사 원장이나 파일의 암호학적 변조 방지를 구현했다고 설명하지 않는다.
- UI에서 바카라 베팅 대상은 P/B/T로 짧게 표시하고 접근성 이름은 Player/Banker/Tie 베팅이다. result 영역은 베팅과 반환, footer는 승자·순손익·Banker 수수료를 표시한다. 최소 크기 시각 검토에서 실제 가독성을 확인해야 한다.
- 이 중단은 실패나 권한 거절 때문이 아니라 사용자의 명시적인 요청이다.
