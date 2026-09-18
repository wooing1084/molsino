# 메인 기능 구현 현황과 실제 파일 지도

**목적:** 게임 종류와 무관한 앱 기능의 현재 구현 범위, 남은 작업, 실제 파일 위치를 개발 전에 확인한다.

**요약:** 2026-09-18 소스 기준으로 투명 오버레이, 크기 조절, 트레이와 단축키, 표시 상태·불투명도, IPC 신뢰 경계와 빌드·검증 기반이 연결돼 있다. 포커스·접근성 및 실제 클릭 통과 회귀, Renderer 장애 복구, Windows GUI 검증이 남았고 위치·다중 모니터 작업은 보류 중이다. 블랙잭의 코어·화면·저장 상태는 [블랙잭 구현 현황](../games/blackjack/implementation-status.md)에서 관리한다.

## 목차

- [확인 기준과 관련 문서](#확인-기준과-관련-문서)
- [현재 구현된 범위](#현재-구현된-범위)
- [남은 작업과 보류 항목](#남은-작업과-보류-항목)
- [실제 파일 지도](#실제-파일-지도)

## 확인 기준과 관련 문서

이 문서는 `src/`, `tests/`, `package.json`, `.github/workflows/`의 현재 파일을 기준으로 한 **메인 기능 구현 현황**이다. 설계의 생성 예정 트리와 현재 파일 배치는 다를 수 있으므로 파일을 찾을 때 아래 지도를 사용한다. 메인 기능의 동작과 구현 계약은 [제품 설계](product-design.md)와 [기술 설계](technical-design.md)를 따른다.

- 블랙잭 구현과 파일 위치: [블랙잭 구현 현황](../games/blackjack/implementation-status.md)
- 다음 세션과 작업 순서: [작업 세션 로드맵](../work-session-roadmap.md)
- 완료 세션의 변경·검증 근거: [세션 목록](../session-reports/session-list.md)에서 연결한 보고서
- 현재 E2E 범위: [메인 기능 E2E 현황](e2e-implementation-status.md)
- 빌드·배포 절차: [빌드와 배포](building-distribution.md)

## 현재 구현된 범위

| 영역 | 현재 코드에서 확인한 범위 | 상세 기록 |
| --- | --- | --- |
| 오버레이 창 | macOS·Windows용 투명 창, 모서리 크기 조절, 트레이의 표시·숨김·전체 클릭 통과·크기 프리셋, 접힘/펼침과 불투명도 조절창을 연결했다. Alt+백틱은 숨김·복원 토글로 동작한다. | [S01 보고서](../session-reports/S01-custom-resize.md), [S10 보고서](../session-reports/S10-overlay-state-opacity.md) |
| IPC·보안 경계 | 등록된 창의 최상위 문서만 IPC 명령을 보낼 수 있고 런타임 스키마를 검사한다. Preload는 제한된 API를 제공하며 상태 구독은 snapshot과 push의 순서 및 해제 수명을 처리한다. 현재 블랙잭 공개 상태의 구체적 필드는 [블랙잭 구현 현황](../games/blackjack/implementation-status.md)을 따른다. | [S09 상태 동기화](../session-reports/S09-ipc-state-sync.md), [S09 구독 보강](../session-reports/S09-ipc-subscription.md) |
| 빌드·검증 기반 | 주요 도구 버전과 Node 버전 파일, 타입 검사·하위 테스트·프로덕션 패키지 E2E 스크립트, macOS·Windows CI 및 배포 산출물 workflow가 있다. | [빌드와 배포](building-distribution.md), [메인 기능 E2E 현황](e2e-implementation-status.md) |

이 표는 현재 코드의 존재와 연결 상태를 나타낸다. 세션별 실행 환경·통과 수와 자동화가 확인하지 못한 OS 동작은 [세션 보고서](../session-reports/session-list.md)와 [메인 기능 E2E 현황](e2e-implementation-status.md)을 확인한다. S10 보고서의 Alt+백틱 숨기기 전용 설명은 당시 기록이다. 현재 숨김·복원 토글 계약은 [제품 설계](product-design.md)와 `src/main/main.ts`의 `toggleOverlay()`가 기준이다.

## 남은 작업과 보류 항목

| 항목 | 현재 경계와 다음 위치 |
| --- | --- |
| 포커스·접근성 회귀 | 금액 편집에서 일시적으로 창 포커스를 허용하는 경로는 있지만, 반복 입력과 숨김·복원 후 포커스, 키보드·보조 기술 경로, 실제 업무 앱으로의 포커스 복귀는 S12에서 검증한다. 금액 규칙은 [블랙잭 구현 현황](../games/blackjack/implementation-status.md)을 따른다. [로드맵](../work-session-roadmap.md) |
| 전체 클릭 통과·트레이 복구 | 명시적 전체 클릭 통과와 트레이 복구 경로는 코드에 있다. 실제 OS 클릭·스크롤 전달과 상태 전이 회귀는 S13에서 다룬다. 자동 부분 클릭 통과(`forward:true`)는 별도 실험이다. [메인 기술 설계](technical-design.md) |
| 위치·다중 모니터·창 시작 기본값 | 화면 변화에 따른 위치 보정과 전체 창 설정 재실행 초기화는 S11 전체 및 E2E-18과 함께 TOBE로 보류했다. 블랙잭 세션 저장과 별개로 `preferences.json`은 만들지 않았다. [로드맵](../work-session-roadmap.md), [메인 E2E 테스트 설계](e2e-test-plan.md) |
| Renderer 장애 복구 | 현재 `render-process-gone`은 오버레이를 숨기고 오류를 기록한다. 새 창 생성과 최신 게임 상태 재동기화는 S16 범위다. [메인 기술 설계](technical-design.md) |
| OS별 제품 검증 | 실제 투명 합성, 외부 앱 포커스, 물리 단축키·트레이 조작, Windows GUI와 다중 모니터는 기존 macOS 패키지 E2E만으로 판정하지 않는다. 접근성·DPI·성능·설치본 검증도 후속 세션에 남아 있다. [로드맵](../work-session-roadmap.md), [빌드와 배포](building-distribution.md) |

## 실제 파일 지도

아래는 소스에 존재하는 파일만 나열한다. 게임과 메인 기능을 함께 연결하는 파일은 여기서 **메인 기능 담당 부분**만 표시한다. 게임 담당 부분은 [블랙잭 파일 지도](../games/blackjack/implementation-status.md#실제-파일-지도)를 따른다.

### 앱·공통 코드

```text
src/
  main/
    main.ts                         앱 시작·오버레이 창/트레이·프로토콜·IPC 연결
    ipc/trust.ts                    IPC 송신자·문서 신뢰 검사
    platform/adapter.ts            OS별 창 정책
    windows/resize-controller.ts   모서리 크기 조절 제스처·bounds
    windows/hide-shortcut.ts        전역 숨김/복원 단축키 등록
  preload/preload.ts                신뢰 경계 안의 제한된 Renderer API
  renderer/
    main.tsx                        창 표시·오버레이 조작 UI
    styles.css                      오버레이와 최소 크기 레이아웃
  shared/
    contracts.ts                    창·오버레이 IPC 스키마/타입
    env.d.ts                        빌드 환경 타입
```

### 테스트·빌드

```text
tests/
  main/                              trust.test.ts, resize-controller.test.ts,
                                     hide-shortcut.test.ts
  shared/contracts.test.ts           창·오버레이 명령 계약도 포함
  e2e/                               overlay-resize.spec.ts, overlay-state.spec.ts,
                                     dock-lifecycle.spec.ts, ipc-state.spec.ts,
                                     ipc-subscription.spec.ts
    support/                         app.ts, resize.ts
    tsconfig.json, window-api.d.ts
resources/icons/                     앱 아이콘 원본·플랫폼 산출물
.github/workflows/ci.yml             macOS·Windows 검사·패키징
.github/workflows/build-distributables.yml  배포 산출물 빌드
package.json, package-lock.json, .nvmrc
forge.config.cjs, vite.*.config.mts, vitest.config.mts, playwright.config.ts
```
