# 빅휠 E2E 구현 현황

**목적:** 빅휠의 실제 테스트 위치와 검증 경계를 확인한다.

**요약:** 프로덕션 Electron 패키지의 7개 배당·복수 베팅·진행 잠금·저장 복구·표시·세 게임 왕복을 검사한다. 실제 실행 결과는 N05 보고서가 담당한다.

## 목차

- [테스트 위치와 범위](#테스트-위치와-범위)
- [검증 경계](#검증-경계)

## 테스트 위치와 범위

기대 동작은 [E2E 설계](e2e-test-plan.md)를 따른다.

| 파일 | 검증 범위 |
| --- | --- |
| [`bigwheel.spec.ts`](../../../tests/e2e/bigwheel.spec.ts) | BW-01~10: 메뉴, 7배당의 실제 UI 입력, 복수 베팅, 명령 경계, spinning/result 강제 종료, 정산 저장 실패, 0ms Main 정산의 표시 지연, 최소 창·Lv6 최대 금액, 세 게임 왕복 |
| [`support/app.ts`](../../../tests/e2e/support/app.ts) | 격리 userData와 `bigwheelFixture` 전달·앱 재실행 |
| [`bigwheel.test.ts`](../../../tests/core/bigwheel.test.ts) | 총 54칸 배분, 모든 칸 정산, 조커/메가 구분, 정수 경계, 상태 불일치, 최근 20개 기록, 공개 명령·정보 은닉 |
| [`bigwheel-store.test.ts`](../../../tests/main/bigwheel-store.test.ts) | 모든 레벨 합계 한도, 미완성 베팅, 시작·정산 저장 실패, 중복 요청, 저장된 결과 복원, 다음 판 정규화 |
| [`app-session-repository.test.ts`](../../../tests/main/app-session-repository.test.ts) | v2/v3 진행 판의 v4 이전, 백업 제공, 이전 실패 재시도·원본 보존 |
| [`presentation.test.ts`](../../../tests/renderer/presentation.test.ts) | 휠 표시 지연과 잔액·기록·달성 일괄 공개, 숨김/reload snap, 기존 카드 연출 회귀 |

## 검증 경계

배당 기대값은 E2E에서 공식 수치로 고정해 구현 상수와 독립적으로 비교한다. 테스트 fixture는 칸 인덱스를 정하며 일반 공개 IPC에 결과 조작 기능을 추가하지 않는다. 실제 파일 저장을 확인한 뒤 강제 종료·재실행하거나 백업 경로를 방해하여 저장 실패를 만든다.

시각 캡처는 레이아웃 확인이며 외부 앱 클릭 전달·물리 키/트레이·실제 OS 투명 합성이나 Windows GUI 검증으로 간주하지 않는다. 실행 명령·통과/실패 수·개발 중 실패 원인·환경은 [N05 보고서](../../session-reports/N05-bigwheel.md)를 따른다.
