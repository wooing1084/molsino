# S09 — IPC·Preload·상태 구독 회귀

상태: 완료
완료일: 2026-09-16
브랜치: `feature/s09-ipc-state-sync`

## 작업 범위와 계약

- Renderer는 `onState`를 먼저 구독한 뒤 `getSnapshot`을 요청하고, 더 낮은 revision의 늦은 응답을 버린다. 동일 revision의 저장 오류 갱신은 허용한다.
- `reload` 뒤 새 문서는 Main의 최신 committed snapshot을 읽는다. 이전 구독은 cleanup되고, 명시적으로 해제한 listener는 다음 push를 받지 않는다.
- Main은 overlay의 실제 webContents·mainFrame·정확한 문서 URL이 모두 일치할 때만 IPC를 받는다. Preload는 제한된 `BlackjackAPI`만 노출하며 사용자 명령은 strict Zod 스키마를 통과해야 한다.
- 공개 상태에는 슈 순서와 미공개 딜러 홀 카드가 없다. 복구·창 명령에도 같은 sender 검증을 적용한다.

## 테스트 설계

1. 프로덕션 E2E에서 처음 snapshot 응답만 지연시켜 최신 push보다 늦게 오도록 한다. 테스트 전용 지연은 격리된 `userData`가 있을 때만 허용하고 응답 데이터는 요청 시점의 실제 snapshot이다.
2. 프로덕션 E2E에서 IPC/Preload의 Node 격리, 내부·비정상 payload 거부, 공개 상태 경계, 구독 해제와 reload 복원을 확인한다.
3. 하위 테스트에서 sender·frame·URL 조합을 독립적으로 검증한다.

## 검증 결과

- 선작성 red: 새 E2E 4건 중 역순 snapshot 1건은 테스트용 지연 경계 부재로 예상 실패, 나머지 보안·구독·비공개 상태 3건은 기존 코드로 통과했다. 이후 실제 비신뢰 문서 1건을 추가했다.
- 최종 재검증 중 1회 15/16: 기존 S08-06이 두 번째 판에서 `스탠드` 버튼을 기다리다 실패했다. 재기동 시 새 슈 fixture를 지정하지 않아 재셔플은 실제 무작위 슈였고, 보험 선택/즉시 결과 등도 가능한데 테스트가 항상 `playerTurn`을 가정한 오류였다. UI phase 가정 대신 저장된 새 슈의 소비 인덱스가 4가 되는지 기다리도록 수정했다.
- 공식 완료 검증: `npm run test:e2e` — macOS arm64, Electron 44.3.0, Forge 프로덕션 패키지, 4개 spec 16/16 통과 (S09 5건). 실패/스킵 0.
- 보조 검증: `npm run check` — TypeScript root/E2E 검사 통과, Vitest 11파일 108/108 통과. `git diff --check` 통과.

## 변경사항

- `src/main/ipc/trust.ts`, `src/main/main.ts`: overlay webContents·mainFrame identity·정확한 URL 검증을 한 함수로 분리하고 상태 push도 현재 문서가 신뢰될 때만 보낸다. `MOLSINO_TEST_USER_DATA`가 설정된 격리 테스트에서만 최대 2초 snapshot 응답 지연 허용. 응답은 요청 시점에 캡처한 실제 상태다.
- `tests/e2e/support/app.ts`, `tests/e2e/ipc-state.spec.ts`: 지연 snapshot과 push 역순, 구독 해제/reload, E2E-21 Node 격리·strict payload, 슈·홀 카드 은닉, 직접 로드된 비신뢰 문서의 실제 IPC 거부.
- `tests/main/trust.test.ts`, `tests/shared/contracts.test.ts`: 다른 contents·subframe·URL·포트와 내부/비정상 명령 거부.

## 관련 이슈와 다음 시작점

- Windows GUI·실제 외부 앱 포커스는 macOS 패키지 E2E로 검증하지 못한다. CSP가 iframe을 막으므로 실제 subframe invoke 대신 frame identity의 하위 테스트로 거부를 검증했다.
- Renderer 프로세스 종료·unresponsive 후 창 재생성과 재동기화는 S16 범위다. 이번 reload 검증은 정상 Renderer reload만 다룬다.
- 다음 시작점은 S10 접힘·펼침과 창 상태 모델이다. 140×30 DIP 경로, 진행 중 판 보존, 펼친 크기 복원, 중복 전환 방지를 E2E부터 설계한다.
