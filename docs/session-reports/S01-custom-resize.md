# S01 — 커스텀 리사이즈

목적: 투명 오버레이의 네 모서리에서 창 크기를 안전하게 조절한다.

요약: Main이 계산하는 크기 조절, 화면 경계 제한, 최소 크기 레이아웃을 구현하고 검증했다.

## 목차

- [작업 범위](#작업-범위)
- [확정 설계](#확정-설계)
- [선작성 검증](#선작성-검증)
- [세션 종료 기록](#세션-종료-기록)

상태: 완료 · 완료일: 2026-09-16

## 작업 범위

투명 오버레이의 `resizable:false`를 유지하면서 네 모서리 핸들에서 Renderer → Preload → Main IPC → `BrowserWindow.setBounds`로 이어지는 사용자 정의 크기 조절을 구현한다. 허용 크기는 220×150~420×280 DIP다. 220×150에서도 필수 UI가 잘리지 않도록 반응형 레이아웃을 함께 정리한다.

설정 영속화, 접힘 모드, 자동 부분 클릭 통과는 이후 세션 범위다.

## 확정 설계

### IPC 계약

- 단일 채널 `overlay:resize`를 사용한다.
- 명령은 strict discriminated union이다.
  - `{ phase: 'start', edge: 'nw' | 'ne' | 'sw' | 'se' }`
  - `{ phase: 'update' | 'end' | 'cancel', token: UUID }`
- `start`는 Main이 만든 token과 현재 bounds를 반환한다. 이후 명령은 적용된 bounds를 반환한다.
- Renderer 좌표는 IPC payload로 받지 않는다. 좌표원은 Main의 `screen.getCursorScreenPoint()`뿐이다.
- sender, main frame, 문서 URL 검증은 기존 IPC와 동일하게 적용한다. token은 권한 수단이 아니라 오래되거나 재전송된 제스처를 거부하기 위한 세션 식별자다.

### 크기 계산

- start 시점의 bounds와 Main 커서를 저장하며 update마다 시작점 기준으로 다시 계산한다. 누적 delta는 사용하지 않는다.
- 사용자가 잡은 모서리의 반대편 모서리를 anchor로 유지한다.
- 폭과 높이는 각각 220~420, 150~280 DIP로 제한한다.
- 시작 display의 workArea를 넘지 않도록 해당 방향에서 가능한 최대 크기도 함께 제한한다. 음수 모니터 좌표는 정상값이다.
- `setBounds` 적용은 Main에서 최대 약 30Hz로 제한하고, end는 최신 커서를 한 번 반영한 뒤 세션을 종료한다.

### 수명과 실패 처리

- 창 하나당 활성 resize 세션은 하나만 허용한다.
- 10초 동안 명령이 없으면 세션을 만료한다.
- cancel, hide, passthrough, preset 크기 변경, close/destroy, navigation/reload, render-process-gone, 앱 종료에서 즉시 만료한다.
- invalid, expired, replayed token은 오류로 거부한다.
- Renderer는 primary pointer만 받고 pointer capture를 사용한다. `pointercancel`, `lostpointercapture`, `pagehide`에서 취소한다.

### UI

- 네 모서리에 24×24 DIP hit target을 둔다. 시각 표시는 작고 희미하게 유지하며 hover/resize 중 강조한다.
- 핸들은 `app-region:no-drag`, `touch-action:none`을 사용한다.
- 기본 크기를 제품 설계와 같은 280×180 DIP로 통일한다.
- 220×150에서 본문 글씨 11 DIP와 24 DIP 컨트롤을 유지한다. 부가 설명을 줄이되 잔액, 카드, 베팅 컨트롤, 상태는 viewport 안에 남긴다.

## 선작성 검증

### Playwright Electron E2E

- 실제 모서리 pointer 이벤트가 Preload와 IPC를 통과해 BrowserWindow bounds를 변경하는지 확인한다.
- 최대·최소 크기 clamp를 확인한다.
- cancel/expired token 이후 update가 거부되고 bounds가 바뀌지 않는지 확인한다.
- 220×150에서 필수 UI 요소의 DOM rect가 viewport 안에 있는지 확인한다.

Playwright의 합성 mouse가 OS 커서를 이동한다는 가정은 하지 않는다. 테스트 앱의 Main context에서 `screen.getCursorScreenPoint()`만 임시 stub하고, 프로덕션 코드나 IPC에는 테스트 좌표 주입 경로를 추가하지 않는다.

### Vitest

- 모서리별 anchor 계산, min/max/workArea clamp, 누적 drift 방지.
- 단일 활성 세션, invalid/expired token, timeout, cancel, end 최종 반영, 30Hz 제한.
- strict Zod schema와 추가 필드 거부.

### 공식 검증 정책

사용자 지시에 따라 세션 공식 검증은 E2E만 수행한다. 실제 투명도 합성, 외부 앱 포커스, Windows 실장비 동작은 E2E로 확인되지 않았으므로 관련 이슈로 남긴다.

## 세션 종료 기록

### 변경사항

- `ResizeController`: 네 모서리 anchor, min/max/workArea clamp, 30Hz trailing 병합, end 최종 반영, cancel/invalidate, 10초 만료.
- `overlay:resize`: strict start/update/end/cancel 계약, UUID token, 기존 sender/main-frame/URL 신뢰 검증 적용.
- Renderer: 네 개의 24×24 DIP 핸들, pointer capture와 비동기 start 레이스 처리, 220×150 반응형 grid.
- 테스트 기반: `@playwright/test` 설치, E2E 타입 검사와 프로덕션 패키지 선행 실행 스크립트 추가.
- 제품 기본 크기를 280×180 DIP로 통일.

### E2E 검증 결과

- 명령: `npm run test:e2e`
- 환경: macOS arm64, Electron 44.3.0, 프로덕션 Forge 패키지
- 결과: 1개 spec, 4개 시나리오 전부 통과
  - 실제 핸들 → IPC → BrowserWindow bounds 및 최대 clamp
  - 최소 clamp와 종료 token 재사용 거부
  - cancel 후 token 만료 및 bounds 유지
  - 220×150 DIP 필수 UI viewport 유지

### 관련 이슈

- E2E가 실제 데스크톱 합성 투명도와 외부 앱 포커스 유지까지 판정하지는 않는다. 공식 검증을 E2E로 한정했으므로 미검증으로 유지한다.
- Windows x64 실장비 동작은 미검증이다.
- `npm install`은 high severity 취약점 17개를 보고했다. 자동 수정은 수행하지 않았다.
- 저장소에 `.git`이 없어 변경 이력을 Git으로 확인할 수 없다.

### 다음 시작점

- S02 — 카드·슈·점수 기반 (`work-session-roadmap.md` 재배치로 창 UI 나머지보다 게임 핵심 로직을 먼저 진행한다).
- 먼저 6덱 슈 결정론적 카드 공급과 핸드 점수 계산의 단위 테스트·E2E를 red 상태로 작성한다.
