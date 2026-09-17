# Persistence boundary

**목적:** 게임 세션 저장 코드의 책임과 기준 문서를 안내합니다.

**요약:** `session-repository.ts`가 게임 세션 파일을 관리합니다. 저장 계약과 검증 근거는 기술 설계와 S08 보고서에 있습니다.

## 목차

- [저장 경계](#저장-경계)

## 저장 경계

`session-repository.ts`가 `userData/session.json`과 `session.backup.json`을 관리합니다.
스키마와 원자 저장·복구 계약은 [기술 설계서 7절](../../../docs/blackjack-technical-design.md#7-명령-직렬화와-저장), 세션 검증 기록은 [S08 보고서](../../../docs/session-reports/S08-session-repository.md)를 참고합니다.
창 표시 설정은 앱 재실행 때 기본값으로 초기화하므로 `preferences.json`을 만들지 않습니다. 게임 판·잔액·베팅 설정만 `session.json`에서 복원합니다.
