# Persistence boundary

`session-repository.ts`가 `userData/session.json`과 `session.backup.json`을 관리합니다.
스키마와 원자 저장·복구 계약은 기술 설계서 7절, 세션 검증 기록은 `docs/session-reports/S08-session-repository.md`를 참고합니다.
`preferences.json`은 S11 범위이며 이 저장소에서 다루지 않습니다.
