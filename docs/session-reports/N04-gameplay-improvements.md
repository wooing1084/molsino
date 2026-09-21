# N04 게임성 개선

**목적:** 불투명도 조절창, 공통 레벨·베팅 한도, 순차 카드 공개의 구현과 실제 검증 증거를 기록한다.

**요약:** Main의 여섯 레벨·v3 저장과 Renderer의 레벨 페이지·표시 타임라인을 연결했다. 변경 전 패키지에서 네 가지 기능 실패를 재현했다. 최종 패키지 전체 93개 사례 중 최초 90개 통과 후 테스트 기대 3건을 수정해 재실행 3개도 통과했다. 구현·검증과 DEV 대상 PR 생성을 완료했다.

## 목차

- [1. 작업 범위와 결정](#1-작업-범위와-결정)
- [2. 검증 기록](#2-검증-기록)
- [3. 남은 확인과 다음 시작점](#3-남은-확인과-다음-시작점)

날짜: 2026-09-21 · 상태: 완료. 구현 커밋 `6505ac0` · [DEV 대상 PR #12](https://github.com/wooing1084/molsino/pull/12).

## 1. 작업 범위와 결정

- `table-levels.ts`의 공통 금액표로 두 게임의 기본 베팅을 검증한다. 현재 잔액 입장, 손실 후 선택 방 유지, 정산 후 최고 잔액, 새 시작 초기화를 AppStore가 소유한다.
- v3에 선택 레벨과 최고 잔액을 저장한다. v2 진행 판의 카드·슈·베팅·잔액을 보존해 이전하고 다음 베팅부터 한도를 적용한다. 검증된 동등 백업을 남기며 v1 원본은 변경하지 않는다.
- 공통 헤더의 확정 레벨, 게임의 고정 한도 행, 같은 창 안의 가로 카드 선택 페이지를 연결한다.
- 공개 카드 식별자로 Renderer가 순차 공개한다. Main 저장·정산은 독립이며 빠른 완료·같은 상태 재송신·스플릿 이동에도 카드 순서를 유지한다. 결과·최종 잔액·바카라 기록·달성의 선행 표시를 막는다.
- 제품 수치·동작의 상세는 [메인 제품 설계 §6](../main/product-design.md#6-공통-테이블-레벨과-카드-공개), 저장/API 계약은 [기술 설계 §9.8](../main/technical-design.md#98-공통-레벨v3-이전표시-타임라인)이 기준이다.

## 2. 검증 기록

### 변경 전 RED

QA 담당자가 변경하지 않은 `origin/DEV`를 새로 패키징한 뒤 실행했다.

```sh
MOLSINO_ELECTRON_ZIP_DIR=/Users/curvc/Library/Caches/electron/f9c7436ab4a2c1ed6ac6cea2902187de75bd5b7a60c0973ad8967c318a6313c3 npm run package
npx playwright test tests/e2e/gameplay-improvements.spec.ts --timeout=15000
```

첫 sandbox 실행의 Electron launch 실패 4건은 기능 RED로 계산하지 않는다. OS 앱 실행 권한으로 재실행한 실제 앱에서는 아래 4건이 기대대로 실패했다.

| 시나리오 | 변경 전 관찰 |
| --- | --- |
| N04-01 | 조절창 opacity가 기대 0.2 대신 1 |
| N04-02 | 현재 레벨 헤더 없음 |
| N04-03 | Lv.1 상한을 넘는 5,001센트 Main 명령 허용 |
| N04-04 | Main 0ms 바카라에서 첫 카드 대신 네 카드 즉시 표시 |

### 구현 후 검증

macOS의 실제 프로덕션 Electron 패키지와 격리된 userData에서 실행했다. 최종 소스는 전체 실행 전에 고정했고 아래 3건 재실행 전에는 테스트의 기대·준비만 수정했다.

| 명령/범위 | 실제 결과 |
| --- | --- |
| `npm run check` | 18파일·183테스트 통과 |
| `npm run package` (위 Electron 캐시 환경 사용) | 최종 프로덕션 패키지 생성 성공 |
| 전체 `npx playwright test` | 93개 중 90통과·3실패·0스킵, 3.9분 |
| 아래 실패 사례 재실행 | 3통과·0실패·0스킵, 11.8초 |
| `npm run smoke` | 메뉴·AppStore·BlackjackCore 딜·IPC·Node 격리 통과 |
| `npm run typecheck:e2e` | 최종 통과 |
| `git diff --check` | 통과 |

```sh
npx playwright test tests/e2e/baccarat.spec.ts tests/e2e/gameplay-improvements.spec.ts --grep '잔액 99센트|다른 게임에서 잔액이|N04-14' --timeout=30000 --output=/tmp/molsino-n04-rerun-results
```

서로 다른 93개 사례의 검증을 완료했다. 전부 한 번에 통과한 결과가 아니라 전체 최초 실행과 수정한 3개 재실행을 구분한 결과다. N04-01~18은 20개 실행 사례이며 N04-08 primary/backup, N04-09 reload/hide를 각각 실행한다. N04 20개도 이 검증 범위에 포함한다.

로컬 실행 로그는 `/tmp/molsino-n04-package-release.log`, `/tmp/molsino-n04-full-e2e.log`, `/tmp/molsino-n04-rerun-e2e.log`, `/tmp/molsino-n04-smoke.log`에 있다. 임시 로그 경로는 영구 배포 산출물이 아니다.

### 최소 창 이미지 확인

오케스트레이터와 Frontend 담당자가 실제 `test-results` PNG를 열어 220×150에서 Lv.6 선택 카드, 흰색/검정 블랙잭 결과, 검정 바카라 결과를 직접 확인했다. 최대 기본 베팅 $25,000으로 블랙잭 잔액 $125,000·바카라 잔액 $150,000인 화면에서도 헤더 Lv.6, 정확한 최소 $1,000·최대 $25,000, 카드·점수·다음 판·결과가 창 안에 배치됐다. 바카라 반환 요약의 말줄임은 기존 compact 표시이며 title에서 상세를 확인한다. 이 확인은 앱 캡처의 레이아웃 증거이고 OS 투명 합성이나 물리 포커스 검증을 의미하지 않는다.

### 구현 중 발견한 타이머 회귀

코드 검토와 실제 패키지 E2E에서 타이머가 예정 시각보다 일찍 깨어난 뒤 다음 tick을 예약하지 않아 카드 공개 후 정산 표시가 멈추는 결함을 확인했다. Frontend는 조기 wake에서도 다음 tick을 재예약하도록 수정하고 공개 정보만 사용하는 타임라인 단위 테스트 8개 통과를 보고했다. 숨김 직후 복원 상태가 React에 일괄 반영될 때 숨김 effect를 건너뛰던 경로도 동기적으로 최신 상태에 맞추도록 수정했다. 수정한 소스의 최종 패키지 검증 결과는 위 표를 따른다.

전체 회귀의 BAC-12 99센트 사례는 이전의 disabled 딜 버튼을 기대했으나 새 화면은 ‘메뉴에서 새 시작’ CTA를 제공해 실패했다. QA는 UI 기대만 수정하고 Main의 딜 거부 검증은 유지했다. APP-08 준비 코드는 바카라 화면 선택의 Main 저장 완료 전에 직접 IPC를 보내 실패했으므로 화면 전환 완료를 기다리고 각 준비 명령의 성공을 검사하도록 수정했다. N04-14는 기존 코어의 원장이 판당 하나가 아니라 핸드당 하나라는 계약에 맞춰 2개 항목·서로 다른 component ID·동일 round ID를 검사한다. 제품 소스를 바꾸지 않고 이 세 테스트를 수정한 뒤 재실행했다.

### 후속 헤더 표시 조정 (2026-09-21)

사용자 요청에 따라 두 게임의 헤더에서 `molsino` 옆 게임 이름을 복원했다. 변경 전 소스에는 게임명 DOM 없이 스타일만 남아 있었다. 창 너비에 따른 정보 우선순위와 숨김 기준은 [메인 제품 설계 §2](../main/product-design.md#2-오버레이와-조작)에 반영했다. 기존 모서리 크기 조절 여백은 유지했다.

`npm run typecheck`, 캐시를 사용한 `npm run package`, `git diff --check`를 통과했다. 임시 Playwright 점검(`node /tmp/molsino-header-check.cjs`)으로 실제 macOS 패키지와 격리 userData에서 블랙잭·바카라 각각 220×150, 280×150, 340×150의 표시 우선순위, 두 게임명, 레벨 유지, 24×24 버튼과 우상단 크기 조절 핸들의 비중첩을 확인했다. 6개 화면 점검은 모두 통과했고 PNG를 열어 실제 배치를 확인했다. 최초 sandbox의 앱 실행 실패 후 OS 앱 실행 권한으로 재실행했으며 기능 실패는 없었다. 전체 93개 스위트를 다시 실행한 결과가 아니며, 영구 테스트는 추가하지 않았다.

임시 검증 로그는 `/tmp/molsino-header-check.log`, 패키징 로그는 `/tmp/molsino-header-package.log`, 캡처는 `/tmp/molsino-header-screenshots/{blackjack,baccarat}-{220,280,340}.png`에 있다. Windows 및 OS 투명 합성은 이 후속 점검 범위에 포함하지 않는다.

## 3. 남은 확인과 다음 시작점

최종 패키지 검증과 [DEV 대상 PR #12](https://github.com/wooing1084/molsino/pull/12) 생성을 완료했다. PR 브랜치는 `codex/n04-gameplay-improvements`이며 DEV 병합은 이 완료 기록에 포함하지 않는다. 최소 창 PNG의 직접 확인 범위는 위 기록을 따른다. Windows, 외부 업무 앱 포커스, 실제 물리 키·트레이, OS 투명 합성은 이번 기록만으로 검증됐다고 판단하지 않는다.

N04를 완료했고 다음 세션은 N05 macOS 서명과 Mac App Store 제출이다. 다음 작업의 현재 기준은 [로드맵](../work-session-roadmap.md)이다.
