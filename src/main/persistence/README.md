# Persistence boundary

`session-repository.ts`가 `userData/session.json`과 `session.backup.json`을 관리합니다.
스키마와 원자 저장·복구 계약은 기술 설계서 7절, 세션 검증 기록은 `docs/session-reports/S08-session-repository.md`를 참고합니다.
창 표시 설정은 앱 재실행 때 기본값으로 초기화하므로 `preferences.json`을 만들지 않습니다. 게임 판·잔액·베팅 설정만 `session.json`에서 복원합니다.
