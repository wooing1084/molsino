# 메인 기능 구현 현황과 실제 파일 지도

**목적:** 게임 종류와 무관한 앱 기능의 현재 구현 범위, 남은 작업, 실제 파일 위치를 개발 전에 확인한다.

**요약:** 2026-09-23 소스 기준으로 투명 오버레이, 크기 조절, 트레이와 단축키, 표시 상태·불투명도, IPC 신뢰 경계와 빌드·검증 기반이 연결돼 있다. 메인 메뉴·공용 잔액·v4 저장과 블랙잭·바카라·빅휠을 구현했다. 한국어 기본값과 영어 표시, 네이티브 언어 메뉴, 별도 환경설정 저장도 연결했다. 미구현·미검증 사실은 아래에 구분한다. 블랙잭의 코어·화면·저장 상태는 [블랙잭 구현 현황](../games/blackjack/implementation-status.md)에서 관리한다.

## 목차

- [확인 기준과 관련 문서](#확인-기준과-관련-문서)
- [현재 구현된 범위](#현재-구현된-범위)
- [현재 한계와 신규 설계](#현재-한계와-신규-설계)
- [실제 파일 지도](#실제-파일-지도)

## 확인 기준과 관련 문서

이 문서는 `src/`, `tests/`, `package.json`, `.github/workflows/`의 현재 파일을 기준으로 한 **메인 기능 구현 현황**이다. 설계의 생성 예정 트리와 현재 파일 배치는 다를 수 있으므로 파일을 찾을 때 아래 지도를 사용한다. 메인 기능의 동작과 구현 계약은 [제품 설계](product-design.md)와 [기술 설계](technical-design.md)를 따른다.

- 블랙잭 구현과 파일 위치: [블랙잭 구현 현황](../games/blackjack/implementation-status.md)
- 바카라 구현과 파일 위치: [바카라 구현 현황](../games/baccarat/implementation-status.md)
- 다음 세션과 작업 순서: [작업 세션 로드맵](../work-session-roadmap.md)
- 완료 세션의 변경·검증 근거: [세션 목록](../session-reports/session-list.md)에서 연결한 보고서
- 현재 E2E 범위: [메인 기능 E2E 현황](e2e-implementation-status.md)
- 빌드·배포 절차: [빌드와 배포](building-distribution.md)

## 현재 구현된 범위

| 영역 | 현재 코드에서 확인한 범위 | 상세 기록 |
| --- | --- | --- |
| 오버레이 창 | macOS·Windows용 투명 창, 모서리 크기 조절, 트레이의 표시·숨김·전체 클릭 통과·크기 프리셋, 접힘/펼침과 불투명도 조절창을 연결했다. Alt+백틱은 숨김·복원 토글로 동작한다. | [S01 보고서](../session-reports/S01-custom-resize.md), [S10 보고서](../session-reports/S10-overlay-state-opacity.md) |
| IPC·보안 경계 | 등록된 창의 최상위 문서만 IPC 명령을 보낼 수 있고 런타임 스키마를 검사한다. Preload는 제한된 API를 제공하며 상태 구독은 snapshot과 push의 순서 및 해제 수명을 처리한다. 현재 블랙잭 공개 상태의 구체적 필드는 [블랙잭 구현 현황](../games/blackjack/implementation-status.md)을 따른다. | [S09 상태 동기화](../session-reports/S09-ipc-state-sync.md), [S09 구독 보강](../session-reports/S09-ipc-subscription.md) |
| 한국어·영어 | 한국어를 기본값으로 유지하고 영어를 추가했다. macOS 애플리케이션 메뉴와 상태 아이콘 메뉴, Windows 알림 영역 메뉴에서 언어를 바꾸며 오버레이 안에는 설정 UI를 두지 않는다. Renderer·불투명도 창·접근성 이름·네이티브 메뉴와 대화상자를 즉시 동기화하고 `preferences.json`에 게임 세션과 별도로 원자 저장한다. | [N06 보고서](../session-reports/N06-english-localization.md), [제품 설계 §7](product-design.md#7-한국어영어와-네이티브-언어-메뉴) |
| 빌드·검증 기반 | 주요 도구 버전과 Node 버전 파일, 타입 검사·하위 테스트·프로덕션 패키지 E2E 스크립트, macOS·Windows CI 및 배포 산출물 workflow가 있다. | [빌드와 배포](building-distribution.md), [메인 기능 E2E 현황](e2e-implementation-status.md) |

이 표는 현재 코드의 존재와 연결 상태를 나타낸다. 세션별 실행 환경·통과 수와 자동화가 확인하지 못한 OS 동작은 [세션 보고서](../session-reports/session-list.md)와 [메인 기능 E2E 현황](e2e-implementation-status.md)을 확인한다. S10 보고서의 Alt+백틱 숨기기 전용 설명은 당시 기록이다. 현재 숨김·복원 토글 계약은 [제품 설계](product-design.md)와 `src/main/main.ts`의 `toggleOverlay()`가 기준이다.

## 현재 한계와 신규 설계

| 항목 | 현재 경계와 다음 위치 |
| --- | --- |
| 공용 잔액·메인 메뉴 | AppStore·AppSessionRepository·window.molsino로 구현했다. 메뉴에서 블랙잭·바카라·빅휠을 선택한다. [신규 계약](technical-design.md#9-여러-게임과-공용-잔액의-신규-계약) |
| 바카라 | 규칙·저장·화면을 연결했다. [바카라 구현 현황](../games/baccarat/implementation-status.md) |
| 빅휠 | 복수 베팅·회전·저장·화면을 연결했다. [빅휠 구현 현황](../games/bigwheel/implementation-status.md) |
| 입력·클릭 통과의 실제 OS 동작 | 편집 포커스·전체 클릭 통과·트레이·단축키 경로는 있다. 외부 앱 포커스 복귀·실제 클릭 전달·물리 키 입력은 기존 자동 테스트로 보장하지 않는다. 구 S12/S13의 별도 일정은 폐기했다. |
| 위치·다중 모니터 | 화면 변화에 따른 자동 위치 보정과 창 위치 환경설정은 미구현이다. 기존 크기 조절 경로의 workArea 보정은 있다. 언어용 `preferences.json`은 존재하지만 창 위치는 저장하지 않는다. S11·E2E-18의 보류 계획은 폐기했다. |
| Renderer 장애 | 현재 `render-process-gone`은 숨김·오류 기록만 한다. 새 창 재생성은 없다. 장애 후 복원 실패는 N01 점검에서 재현했다. 수정 세션과 구 S16 일정은 계획에서 제외했다. |
| OS 검증 | Windows GUI·물리 모니터·실제 투명 합성 등 미확인 범위를 완료로 바꾸지 않는다. 새 사용자 가치와 관계없는 구 일괄 검증 세션은 유지하지 않는다. |

이 표는 현재 소스의 한계와 신규 계획을 구분한다. 앞으로의 실행 순서는 [새 로드맵](../work-session-roadmap.md)만 따른다.

## 실제 파일 지도

아래는 소스에 존재하는 파일만 나열한다. 게임과 메인 기능을 함께 연결하는 파일은 여기서 **메인 기능 담당 부분**만 표시한다. 게임 담당 부분은 [블랙잭 파일 지도](../games/blackjack/implementation-status.md#실제-파일-지도)를 따른다.

### 앱·공통 코드

```text
src/
  main/
    game/app-store.ts               공용 작성자·메뉴·명령·자동 진행
    game/blackjack-adapter.ts         코어 잔액 주입·공개 상태
    game/baccarat-adapter.ts          바카라 공개 상태
    game/baccarat-shoe-source.ts      Main 난수·격리 테스트 슈
    persistence/app-session-repository.ts  v4 스키마·v1/v2/v3 이전
    persistence/atomic-session-repository.ts  공통 원자 저장·백업·복구
    persistence/preferences-repository.ts  한국어·영어 설정 저장·복구
    native-menu.ts                  OS별 애플리케이션/트레이 메뉴 구성
    main.ts                         앱 시작·오버레이 창/트레이·프로토콜·IPC 연결
    ipc/trust.ts                    IPC 송신자·문서 신뢰 검사
    platform/adapter.ts            OS별 창 정책
    windows/resize-controller.ts   모서리 크기 조절 제스처·bounds
    windows/hide-shortcut.ts        전역 숨김/복원 단축키 등록
  preload/preload.ts                신뢰 경계 안의 제한된 Renderer API
  renderer/
    main.tsx                        창·메뉴·공용 잔액·복구 UI
    games/blackjack.tsx              블랙잭 카드·베팅·행동 UI
    games/baccarat.tsx               바카라 카드·베팅·결과·기록 UI
    games/bigwheel.tsx               빅휠 회전·복수 베팅·결과 UI
    styles.css                      오버레이와 최소 크기 레이아웃
  shared/
    app-contracts.ts                앱 명령·공개 상태·API
    contracts.ts                    창·오버레이와 블랙잭 계약
    i18n.ts                         한국어·영어 카탈로그·오류/빅휠 이름 번역
    env.d.ts                        빌드 환경 타입
```

### 테스트·빌드

```text
tests/
  main/                              trust.test.ts, resize-controller.test.ts,
                                     hide-shortcut.test.ts, native-menu.test.ts,
                                     preferences-repository.test.ts
  shared/contracts.test.ts           창·오버레이 명령 계약도 포함
  e2e/                               overlay-resize.spec.ts, overlay-state.spec.ts,
                                     dock-lifecycle.spec.ts, ipc-state.spec.ts,
                                     ipc-subscription.spec.ts
    app-menu.spec.ts                 메뉴·이전·공용 저장·초기화
    localization.spec.ts             네이티브 메뉴 전환·설정 보존·영어 화면·실패 경계
    support/                         app.ts, app-game.ts, resize.ts
    tsconfig.json, window-api.d.ts
resources/icons/                     앱 아이콘 원본·플랫폼 산출물
.github/workflows/ci.yml             macOS·Windows 검사·패키징
.github/workflows/build-distributables.yml  배포 산출물 빌드
package.json, package-lock.json, .nvmrc
forge.config.cjs, vite.*.config.mts, vitest.config.mts, playwright.config.ts
```

N04는 공통 테이블 레벨·한도와 Renderer 순차 공개를 연결한다. 현재 정책은 [메인 제품 설계](../main/product-design.md#6-공통-테이블-레벨과-카드-공개), 실제 검증 결과와 남은 범위는 [N04 보고서](../session-reports/N04-gameplay-improvements.md)를 따른다.
