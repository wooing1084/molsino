# AGENT.md — 개발 시작 안내

**목적:** 개발 전에 프로젝트 배경을 파악하고 작업에 필요한 기준 문서를 찾는다.

**요약:** molsino는 다른 앱 위에 떠 있는 카지노 게임이다. 현재 블랙잭을 제공하며, 다른 게임도 추가할 예정이다. 메인 기능과 블랙잭의 구현·설계 문서는 [문서 안내](docs/README.md)에서 구분해 찾는다.

## 목차

- [프로젝트 배경](#프로젝트-배경)
- [작업 전 확인할 문서](#작업-전-확인할-문서)
- [문서 작성](#문서-작성)

## 프로젝트 배경

다른 앱을 사용하는 동안 작은 투명 창에서 짧게 즐기는 로컬 싱글플레이 게임이다. 아래 앱의 입력을 방해하지 않는 것이 중요한 제품 요구다. macOS·Windows 공통 Electron 앱이며 Main 프로세스가 창과 게임 세션을 소유한다. 자세한 동작과 책임 경계는 제품·기술 설계에 있다.

## 작업 전 확인할 문서

| 필요한 정보 | 읽을 문서 |
| --- | --- |
| 메인 기능·블랙잭 문서의 전체 경로 | [문서 안내](docs/README.md) |
| 세션별 완료 내용·검증 기록·남은 이슈 | [세션 목록](docs/session-reports/session-list.md)에서 해당 보고서 |
| 현재 코드 구성·실제 파일 위치 | [메인 구현 현황](docs/main/implementation-status.md), [블랙잭 구현 현황](docs/games/blackjack/implementation-status.md) |
| 오버레이 동작·블랙잭 규칙 | [메인 제품 설계](docs/main/product-design.md), [블랙잭 제품 설계](docs/games/blackjack/product-design.md) |
| 창·IPC 신뢰 경계·블랙잭 엔진과 저장 계약 | [메인 기술 설계](docs/main/technical-design.md), [블랙잭 기술 설계](docs/games/blackjack/technical-design.md) |
| 작업 순서·다음 세션·완료 조건 | [작업 세션 로드맵](docs/work-session-roadmap.md) |
| E2E 시나리오와 스위트 구현 현황 | [메인 E2E 설계](docs/main/e2e-test-plan.md)·[현황](docs/main/e2e-implementation-status.md), [블랙잭 E2E 설계](docs/games/blackjack/e2e-test-plan.md)·[현황](docs/games/blackjack/e2e-implementation-status.md) |
| 로컬 설치·개발 실행 | [README](README.md) |
| 빌드·배포 절차 | [빌드와 배포](docs/main/building-distribution.md) |
| 문서의 담당 범위·작성·갱신 규칙 | [문서 작성 가이드](docs/documentation-guide.md) |
| 세션 종료 보고서 작성·목록 갱신 | [세션 보고서 운영 방침](docs/session-reports/README.md) |

해당 작업의 기준 문서와 최근 세션 보고서를 읽은 뒤 실제 코드·테스트를 확인한다. 실행 명령과 의존성 버전은 [`package.json`](package.json)과 [`package-lock.json`](package-lock.json)을 기준으로 한다.

## 문서 작성

각 사실과 결정은 담당 문서 한 곳에서 관리하고, 이 문서에는 간략한 안내와 링크만 둔다. 문서는 제목 다음에 **목적 → 내용 요약 → 목차** 순서로 시작한다. 세션 종료 기록과 검증 결과의 작성 위치는 [문서 작성 가이드](docs/documentation-guide.md)를 따른다.
