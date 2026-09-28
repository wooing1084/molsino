# N05 빅휠 구현

**목적:** 강원랜드 빅휠 규칙 설계부터 공용 저장·플레이 화면·검증까지의 세션 결과를 기록한다.

**요약:** 사용자 요청으로 사이닝 대신 빅휠을 우선 구현했다. 룰 설계를 먼저 커밋하고, 백엔드·화면·QA를 나누어 구현했다. 아래 상태와 검증 기록은 실제 수행한 범위를 구분한다.

## 목차

- [1. 작업 범위와 결정](#1-작업-범위와-결정)
- [2. 검증 기록](#2-검증-기록)
- [3. 남은 범위와 다음 시작점](#3-남은-범위와-다음-시작점)

날짜: 2026-09-21 · 상태: 구현·검증 완료, 원격 push/PR 승인 대기 · 브랜치: `codex/n05-big-wheel`.

## 1. 작업 범위와 결정

- 최신 `origin/DEV`에서 브랜치를 만들고 `281a252`에 [제품·게임 규칙](../games/bigwheel/product-design.md)과 [기술 설계](../games/bigwheel/technical-design.md)를 구현 전에 기록했다.
- 사용자 제공 [강원랜드 빅휠 안내](https://kangwonland.high1.com/casino/contents.do?key=1767)의 실제 HTML에서 배분·배당·마감 규칙을 확인했다. 웹 도구의 접근 실패 후 직접 HTTP 읽기로 확인했으며 규칙을 추측하지 않았다.
- 공식 배분·배당과 앱의 총액 한도·표시용 휠 배치·로컬 모의 지갑 정책을 구분했다. 상세 수치는 게임 제품 설계에서만 관리한다.
- 코어·공용 저장·QA는 높은 추론 수준, Renderer는 중간 추론 수준으로 분리했다. 주 담당자는 계약·작업 분할·교차 검토·문서와 통합을 맡았다.
- v4에 빅휠을 추가하고 이전 v1/v2/v3의 지갑·판·레벨·식별 증거를 보존했다. 회전 시작에 정한 결과를 저장하며 재시도·재실행에 재추첨하지 않는다.
- 최소 창에서 큰 금액 한도가 잘리지 않도록 합계와 한도 위치를 분리했다. 동작 줄이기 모드에서도 연출 도중 정답 칸으로 즉시 회전하지 않도록 수정했다.

## 2. 검증 기록

### 변경 전 RED

macOS arm64의 기존 소스를 프로덕션 패키징한 뒤 `npx playwright test tests/e2e/bigwheel.spec.ts`를 실행했다. 실제 앱에서 BW-01의 `빅휠` 버튼 클릭이 5초 timeout으로 실패했다. 첫 sandbox의 Electron launch 실패는 기능 RED로 계산하지 않는다.

패키징은 로컬 Electron 캐시를 사용했다.

```sh
MOLSINO_ELECTRON_ZIP_DIR=/Users/curvc/Library/Caches/electron/f9c7436ab4a2c1ed6ac6cea2902187de75bd5b7a60c0973ad8967c318a6313c3 npm run package
```

### 구현 중 검증과 수정

- 첫 `npm run check`는 186개 중 181통과·5실패였다. 기존 저장소 테스트의 v3 기대값을 v4와 `bigwheel: null`로 갱신하는 중 실행한 결과다. 신규 테스트와 기대 갱신 후 전체 20파일·212테스트 및 두 타입 검사를 통과했다.
- 첫 빅휠 E2E는 16개 중 3통과·13실패였다. `output`의 암묵적 status 역할과 footer 선택자의 충돌, 최신 금액 표시 수정이 빠진 패키지, 클릭 직후 저장 완료를 기다리지 않은 준비 코드를 수정했다. 이 실행만으로 복구·배당의 최종 통과를 주장하지 않는다.
- 변경 후 소스를 동결하고 다시 패키징하여 빅휠·메뉴·바카라·게임성 개선 72개를 통합 검증했다. 최종 결과는 아래에 기록한다.

### 최종 결과

macOS arm64의 실제 프로덕션 패키지와 격리 userData에서 실행했다. 제품 소스는 최종 패키징 후 동결했고 후속 시각 검증에서는 테스트만 보강했다.

| 명령/범위 | 결과 |
| --- | --- |
| `npm run check` | 두 타입 검사·20파일 212테스트 통과 |
| Electron 캐시를 사용한 `npm run package` | 최종 프로덕션 패키지 생성 성공 |
| 빅휠·메뉴·바카라·게임성 개선 통합 | 72통과·0실패·0스킵, 3.7분 |
| BW-08·BW-10 추가 최소창/최대 금액 검증 | 최초 2통과(8.2초), 정확한 메인창 선택·viewport/paint 대기 보강 후 최종 2통과(7.2초)·0실패·0스킵. BW-08 중복 재검증, BW-10 신규 |
| 기존 블랙잭 플레이·IPC 상태/구독 회귀 | 10통과·0실패·0스킵, 17초 |
| `npm run smoke` | 메뉴·AppStore·BlackjackCore 딜·IPC·Node 격리 통과 |
| 최종 E2E 타입 검사 | 통과 |
| `git diff --check`, 변경 Markdown의 상대 파일 링크 | 통과 |

```sh
npx playwright test tests/e2e/bigwheel.spec.ts tests/e2e/app-menu.spec.ts tests/e2e/baccarat.spec.ts tests/e2e/gameplay-improvements.spec.ts
npx playwright test tests/e2e/bigwheel.spec.ts --grep 'BW-08|BW-10' --output=/tmp/molsino-bigwheel-visual-results
npx playwright test tests/e2e/playable-mvp.spec.ts tests/e2e/ipc-state.spec.ts tests/e2e/ipc-subscription.spec.ts --output=/tmp/molsino-bigwheel-ipc-results
npm run smoke
```

서로 다른 **83개** E2E 사례를 통과했다. 전체 스위트 한 번 실행 결과가 아니라 위 관련 스위트와 추가 사례의 합계다. 이 중 신규 빅휠은 17개다. 전체 기존 OS 스위트를 다시 실행한 것으로 주장하지 않는다.

### 시각 확인

최소창·Lv6 큰 금액에서 한도와 조작부를 직접 확인했다. 최초 검정 글씨/투명 캡처는 판독이 어려워 테스트에서만 밝은 배경을 적용했다. 280×180 캡처 보완 과정에서 불투명도 팝업 생성 후 `BrowserWindow.getAllWindows()[0]`가 메인창을 보장하지 않는 테스트 문제를 확인했다. 실제 viewport 기대 실패 1건 후 `app.browserWindow(page)`로 정확한 창을 선택하고 bounds·viewport·두 paint frame을 기다리도록 수정하여 BW-08/BW-10을 다시 통과했다. 최종 280×180 PNG는 DPR 2의 560×360이며 최소창은 440×300이다. Lv.1 결과와 Lv.6 최대 베팅·한도·금액 입력·휠/포인터를 밝은 배경의 PNG로 직접 확인했다. DOM 측정에서 `$101.00`의 scroll/client 폭은 77/77, `$100000.00`은 113/113이고 오른쪽 끝은 220 창에서 214, 280 창에서 274여서 잔액 잘림이 없다. 관련 캡처는 `/tmp/molsino-bigwheel-visual-results`에 있으며 임시 검증 산출물이다. 실제 데스크톱 합성 검증을 의미하지 않는다.

## 3. 남은 범위와 다음 시작점

Windows GUI, 실제 외부 앱 포커스·물리 키·트레이·OS 투명 합성은 이번 macOS 자동화 범위 밖이다. 차기 작업은 [로드맵](../work-session-roadmap.md)의 N06 macOS 서명과 Mac App Store 제출이다. 로컬 구현·검증은 완료했다. 원격 push와 DEV 대상 PR 생성은 자동 승인 검토가 차단했다. 검토 사유는 전체 소스·문서를 origin에 게시할 사용자 명시적 승인과 목적지 신뢰도가 확인되지 않았다는 것이다. 원격 게시를 우회하지 않았으며 사용자가 `wooing1084/molsino`의 작업 브랜치 push·DEV PR 생성을 승인하면 이어서 완료한다. DEV 병합은 수행하지 않는다.
