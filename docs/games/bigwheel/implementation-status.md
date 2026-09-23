# 빅휠 구현 현황과 파일 지도

**목적:** 빅휠의 실제 구현 범위와 파일 위치를 확인한다.

**요약:** 순수 54칸 코어·복수 베팅·공용 저장과 자동 정산·게임 화면을 연결했다. N05의 실제 실행 결과는 세션 보고서에서 관리한다.

## 목차

- [현재 구현 범위](#현재-구현-범위)
- [실제 파일 지도](#실제-파일-지도)
- [검증과 한계](#검증과-한계)

2026-09-23 후속 설계: [좌·중앙·우 세 칸 확대 표시](product-design.md#31-결과-주변-세-칸-확대--후속-구현-예정)는 **미구현·미검증**이다. 아래 내용은 기존 전체 휠 구현과 검증 범위다.

## 현재 구현 범위

| 영역 | 구현 |
| --- | --- |
| 규칙 | 7구역·54칸 균등 추첨, 구역별 순이익 배당, 당첨 원금 반환, 복수 구역 합산 손익 |
| 베팅 | 센트 단위 구역별 입력·제거, 한 판 총액의 공통 레벨 한도, 가능한 모든 지급의 안전 정수 검사 |
| Main | 차감·미공개 당첨 칸·진행 잠금을 함께 저장하고 내부 자동 전이로 한 번 정산 |
| 저장 | v4, 기존 v1/v2/v3 이전, 실패 후보 재시도, 저장된 회전 결과로 재기동 재개 |
| 공개 상태 | 회전 중 칸 인덱스·당첨 구역 비공개, 현재 게임만 노출, 최근 20개 결과 |
| 화면 | 메뉴·54칸 휠·포인터·7구역 선택·금액 편집·합계·한도·결과, 1.8초 표시 타임라인 |

규칙과 앱 운영 결정의 기준은 [제품 설계](product-design.md), 상태 무결성과 공개 경계는 [기술 설계](technical-design.md)다.

## 실제 파일 지도

| 파일 | 책임 |
| --- | --- |
| [`core.ts`](../../../src/core/bigwheel/core.ts) | 배분·배당·베팅·순수 전이·strict 상태 검증 |
| [`bigwheel-segment-source.ts`](../../../src/main/game/bigwheel-segment-source.ts) | crypto 난수와 격리 테스트 fixture |
| [`bigwheel-adapter.ts`](../../../src/main/game/bigwheel-adapter.ts) | 결과 은닉·공개 상태·허용 동작 |
| [`app-store.ts`](../../../src/main/game/app-store.ts) | 공용 지갑·총액 한도·저장·자동 진행 |
| [`app-session-repository.ts`](../../../src/main/persistence/app-session-repository.ts) | v4·이전·잠금/게임 검증 |
| [`app-contracts.ts`](../../../src/shared/app-contracts.ts), [`bigwheel-view.ts`](../../../src/shared/bigwheel-view.ts) | 앱 명령·공개 상태 계약 |
| [`bigwheel.tsx`](../../../src/renderer/games/bigwheel.tsx) | 휠·구역·입력·결과·기록 화면 |
| [`presentation.ts`](../../../src/renderer/presentation.ts) | 공개 연출과 결과·잔액·기록 동시 표시 |

## 검증과 한계

게임 시나리오는 [E2E 설계](e2e-test-plan.md), 테스트 위치와 자동화 경계는 [E2E 현황](e2e-implementation-status.md), 실제 명령과 결과는 [N05 보고서](../../session-reports/N05-bigwheel.md)를 따른다. 최근 결과와 정산 키 검증은 전체 과거 판의 영구 원장 또는 암호학적 변조 방지를 의미하지 않는다. OS 물리 입력·외부 앱 포커스·투명 합성·Windows GUI는 실제 관찰한 범위만 세션 보고서에 기록한다.
