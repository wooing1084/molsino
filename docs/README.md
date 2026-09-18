# 프로젝트 문서 안내

**목적:** 앱의 메인 기능과 게임별 기준 문서와 신규 설계를 구분해 찾는다.

**요약:** `main/`은 오버레이·창·IPC 신뢰 경계·빌드 등 앱 기능을, `games/blackjack/`은 현재 블랙잭, `games/baccarat/`는 신규 바카라 설계를 다룬다. 메인 메뉴·공용 잔액의 신규 계약은 메인 제품·기술 설계에 있다. 세션 로드맵과 보고서는 작업 순서 및 당시 검증 이력을 기록한다.

## 목차

- [메인 기능](#메인-기능)
- [게임별 문서](#게임별-문서)
- [문서 운영과 세션 이력](#문서-운영과-세션-이력)

## 메인 기능

| 필요한 정보 | 기준 문서 |
| --- | --- |
| 오버레이의 제품 동작·조작 | [제품 설계](main/product-design.md) |
| Electron 창·플랫폼·IPC 신뢰 경계 | [기술 설계](main/technical-design.md) |
| 현재 구현 범위·파일 위치 | [구현 현황](main/implementation-status.md) |
| 오버레이·보안 E2E 기준과 현재 범위 | [E2E 설계](main/e2e-test-plan.md), [E2E 현황](main/e2e-implementation-status.md) |
| 패키징·배포 | [빌드와 배포](main/building-distribution.md) |

## 게임별 문서

### 블랙잭

| 필요한 정보 | 기준 문서 |
| --- | --- |
| 게임 규칙·베팅·화면·완료 기준 | [제품 설계](games/blackjack/product-design.md) |
| 엔진·게임 상태·저장 계약 | [기술 설계](games/blackjack/technical-design.md) |
| 현재 구현 범위·파일 위치 | [구현 현황](games/blackjack/implementation-status.md) |
| 게임 여정 E2E 기준과 현재 범위 | [E2E 설계](games/blackjack/e2e-test-plan.md), [E2E 현황](games/blackjack/e2e-implementation-status.md) |

### 바카라 — 설계 단계

현재 코드·테스트는 없다. N02에서 구현한다.

| 필요한 정보 | 기준 문서 |
| --- | --- |
| 게임 규칙·한 곳 베팅·P/B/T 기록 | [제품 설계](games/baccarat/product-design.md) |
| 순수 규칙·공용 작성자 연결·복구 | [기술 설계](games/baccarat/technical-design.md) |
| 신규 시나리오와 완료 조건 | [E2E 설계](games/baccarat/e2e-test-plan.md) |

공용 잔액·메뉴 이동·전체 새 시작은 [메인 제품 설계](main/product-design.md#5-메인-메뉴와-공용-잔액의-신규-설계), 이전 형식 이관·원자 저장·명령 경계는 [메인 기술 설계](main/technical-design.md#9-여러-게임과-공용-잔액의-신규-계약)를 따른다.

## 문서 운영과 세션 이력

- [문서 작성 가이드](documentation-guide.md): 문서별 SSOT와 작성·갱신 규칙.
- [작업 세션 로드맵](work-session-roadmap.md): N02 바카라 구현·N03 사용성 개선의 순서·완료 조건. 이전 미진행 계획은 폐기.
- [세션 보고서 목록](session-reports/session-list.md): 세션 당시 변경·검증 기록으로 이동하는 색인.
