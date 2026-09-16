# S08 — SessionRepository와 복구

상태: 완료
완료일: 2026-09-16
브랜치: `feature/s08-session-repository`

## 작업 범위와 설계

- Main 소유의 versioned session snapshot을 `userData`에 저장하고 재기동 시 검증·복원한다.
- 프로덕션 GameStore는 한 행동/딜러 한 단계의 후보 상태를 계산한 뒤 저장 성공 후에만 `committedState`·revision을 교체하고 Renderer에 push한다. 저장 실패 후보는 재계산하지 않고 보존하며 동일 command ID 또는 `retrySave`로 재시도한다.
- `session.json`이 손상되거나 미래 버전이면 자동 새 게임을 만들지 않는다. 유효한 `session.backup.json`이 있으면 복구를 선택할 수 있다. 명시적 복구/새 게임 선택 시 기존 primary를 `session.recovery-<UUID>.json`에 보존한다.
- `preferences.json`과 창 위치·설정 저장은 S11, E2E-17 체크포인트 10개 전체는 S15 범위로 유지한다.

## 변경사항

- `src/main/persistence/session-repository.ts`: 엄격한 Zod 파일 형식, core 무결성 검증, 같은 폴더 tmp → 파일 sync/close → rename, 기존 검증된 primary의 backup, EPERM/EACCES 제한 재시도, 남은 tmp 무시.
- `src/main/game/game-store.ts`: 비동기 저장 커밋, 실패 후보 보존·재시도, 재기동 command ID 멱등, 딜러 드로우별 별도 커밋과 복원 후 재개.
- `src/main/main.ts`, `src/preload/preload.ts`, `src/shared/contracts.ts`, `src/renderer/main.tsx`: 시작 시 세션 로드, recovery 화면/선택, 저장 재시도 버튼, 저장 중 정상 종료 대기, IPC 신뢰 검증 유지.
- `tests/main/session-repository.test.ts`, `tests/main/game-store.test.ts`: primary/backup 검증, 남은 tmp, 손상·미래 버전, EPERM 재시도, 쓰기 실패 뒤 이전 공개 상태 유지·동일 후보/딜러 저장 재시도·재기동 멱등.
- `tests/e2e/persistence.spec.ts`: 정상 종료/강제 종료 복원, backup 선택, 미래 schema 원본 보존, 양쪽 손상, 판 사이 컷 재셔플 6건.
- `scripts/smoke.cjs`: 비동기 명령의 UI 반영을 기다리도록 조정.
- `fixtures/blackjack/shoe-near-cut.json`: 컷에 걸치되 판 시작 때는 재셔플하지 않는 80장 잔여 fixture로 설명 정정.

## 검증 결과

- E2E 선작성 red: 프로덕션 패키지에서 새 3건 모두 `session.json`/backup 파일 부재로 예상 실패. 최초 sandbox 네트워크 차단 후 권한 승인 실행으로 확인.
- 공식 완료 검증: `npm run test:e2e` — macOS arm64, Electron 44.3.0, Forge 프로덕션 패키지, 3개 spec 11/11 통과 (기존 S01 4, S07 1, S08 6). 실패/스킵 0.
- 보조 검증: `npm run check` — TypeScript root/E2E 통과, Vitest 11파일 92/92 통과. `npm run smoke` 및 `git diff --check` 통과.

## 관련 이슈와 한계

- macOS에서 패키지 E2E만 검증했다. Windows rename/파일 잠금·실제 GUI와 전원 차단 내구성은 미검증이다. 파일 sync와 rename을 사용하지만 디렉터리 sync/전원 차단 완전 내구성은 보장하지 않는다.
- E2E-17의 히트 전 강제 종료 복원 대표 경로만 검증했다. 보험/스플릿/더블/딜러 드로우 중 등 나머지 체크포인트 9개는 S15에 남는다.
- `preferences.json`, 설정·위치 복원(E2E-18)은 S11에서 구현한다. Renderer 장애 복구는 S16이다.

## 다음 시작점

S09 — IPC·Preload·상태 구독의 남은 회귀. snapshot/push 역순, reload 이후 최신 revision, 구독 정리, 낯선 프레임/URL·비정상 payload/내부 명령 거부, 홀 카드·슈 미노출을 프로덕션 E2E와 하위 테스트로 확정한다.
