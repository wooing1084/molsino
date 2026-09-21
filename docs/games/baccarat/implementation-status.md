# 바카라 구현 현황과 파일 지도

**목적:** 바카라의 현재 플레이·저장·복구 범위와 실제 코드 위치를 확인한다.

**요약:** 메뉴에서 선택 가능한 기본 수수료 바카라를 공용 AppStore에 연결했다. 순수 코어가 카드·배당을 계산하고, Main이 단계별 저장과 자동 진행을 맡으며, Renderer가 베팅·두 패·결과·최근 기록을 표시한다.

## 목차

- [현재 구현 범위](#현재-구현-범위)
- [실제 파일 지도](#실제-파일-지도)
- [검증과 한계](#검증과-한계)

갱신일: 2026-09-21. 제품 규칙은 [제품 설계](product-design.md), 상태·저장 계약은 [기술 설계](technical-design.md)가 기준이다.

## 현재 구현 범위

| 영역 | 현재 동작 |
| --- | --- |
| 규칙·슈 | 독립된 8덱, 새 슈 버림, 402장 컷 경계, 최초 P→B→P→B 배분, 내추럴·세 번째 카드 규칙 |
| 베팅·정산 | P/B/T 한 곳, 공통 레벨 최소·최대·센트 입력, Banker 95% 이익 반올림, Tie 8배 순이익, P/B Tie 원금 반환. 딜 전에 최대 지급과 안전 정수 범위 검사 |
| 공용 작성자 | 지갑을 별도로 만들지 않고 AppStore가 차감·각 배분 단계·정산·최근 기록·잠금을 함께 저장 |
| 복구·중복 방지 | 저장된 배분 단계에서 자동 재개. 실패 후보 그대로 재시도. 현재 판·정산 키·순번·명령 ID/revision으로 재정산 방지 |
| 상태 검증 | 416장 구성·고유 ID·버림·소비 위치, 현재 판의 슈 prefix 재생, phase·베팅·최근 순번·최신 정산 증거 검사 |
| 공개 API | `baccarat {action}`의 setBet/deal/nextRound만 허용. 슈·버린 카드·미래 카드·정산 내부 필드는 공개하지 않음 |
| 화면 | 양쪽 패와 점수, 흑백 대상 선택, Enter 확정·Escape/blur 취소 금액 입력, 결과·순손익·반환금, 최근 20개 P/B/T 한 줄 |
| 앱 연결 | 두 게임 공용 잔액, 진행 중 이동 금지, 숨김 중 자동 진행, 정상/강제 종료 복원, 전체 새 시작에서 기록 제거 |

최근 20개 기록은 표시용이다. 내부 `number`·`settledRoundCount`는 순서를 검증하고 `lastResult`는 최신 정산 증거를 보존한다. 전체 과거 판의 영구 원장이나 암호학적 변조 방지를 제공하는 것은 아니다.

## 실제 파일 지도

| 파일 | 책임 |
| --- | --- |
| [`src/core/baccarat/core.ts`](../../../src/core/baccarat/core.ts) | 순수 규칙·스키마·금액·슈·단계별 전이·저장 검증 |
| [`src/main/game/baccarat-shoe-source.ts`](../../../src/main/game/baccarat-shoe-source.ts) | crypto 난수와 테스트 전용 결정론적 슈 |
| [`src/main/game/baccarat-adapter.ts`](../../../src/main/game/baccarat-adapter.ts) | 공개 상태·허용 동작 추출 |
| [`src/main/game/app-store.ts`](../../../src/main/game/app-store.ts) | 공용 명령·지갑·저장 후보·자동 진행 직렬화 |
| [`src/main/persistence/app-session-repository.ts`](../../../src/main/persistence/app-session-repository.ts) | v3 저장 검증과 두 게임 진행 잠금 |
| [`src/main/main.ts`](../../../src/main/main.ts) | 게임 환경 주입·신뢰 IPC·시작 복원·금액 편집 포커스 |
| [`src/shared/app-contracts.ts`](../../../src/shared/app-contracts.ts), [`baccarat-view.ts`](../../../src/shared/baccarat-view.ts) | strict 공개 명령·상태 계약 |
| [`src/renderer/games/baccarat.tsx`](../../../src/renderer/games/baccarat.tsx) | 바카라 UI·입력 수명·오류 안내 |
| [`src/renderer/main.tsx`](../../../src/renderer/main.tsx), [`styles.css`](../../../src/renderer/styles.css) | 게임 선택·공통 셸·최소 크기 배치 |

바카라는 기존 `app-session.json` 안에 저장한다. 별도 지갑 파일이나 별도 작성자를 만들지 않는다. 공용 저장·이전·복구는 [메인 기술 설계 §9](../../main/technical-design.md#9-여러-게임과-공용-잔액의-신규-계약)를 따른다.

## 검증과 한계

시나리오와 테스트 위치는 [바카라 E2E 현황](e2e-implementation-status.md), 실제 실행 결과와 환경은 [N03 보고서](../../session-reports/N03-baccarat.md)를 따른다. Windows GUI와 외부 앱 포커스·물리 키·트레이·OS 투명 합성의 검증 여부를 자동화 결과로 대체하지 않는다.

N04는 공통 테이블 레벨·한도와 Renderer 순차 공개를 연결한다. 현재 정책은 [메인 제품 설계](../../main/product-design.md#6-공통-테이블-레벨과-카드-공개), 실제 검증 결과와 남은 범위는 [N04 보고서](../../session-reports/N04-gameplay-improvements.md)를 따른다.
