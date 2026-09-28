# S09 — IPC·Preload·상태 구독

목적: IPC 송신자와 상태 push의 신뢰 경계를 보강한다.

요약: 후속 회귀에서 상태 역전 방지, 문서 URL 검증, 구독 수명과 공개 상태 경계를 확인했다.

## 목차

- [작업 범위와 설계](#작업-범위와-설계)
- [변경사항](#변경사항)
- [검증 결과](#검증-결과)
- [관련 이슈와 한계](#관련-이슈와-한계)
- [다음 시작점](#다음-시작점)

상태: 완료 · 완료일: 2026-09-16 · 브랜치: `codex/feature/s09-ipc-regression`

## 작업 범위와 설계

- 기존 `BlackjackAPI`의 snapshot/dispatch/onState와 Main 단일 작성자 구조를 유지하면서, 늦게 도착한 상태가 최신 화면을 되돌리지 않도록 한다.
- 등록된 WebContents의 현재 최상위 frame과 앱 문서 URL만 IPC를 호출할 수 있게 검증한다. Renderer 명령은 기존 Zod schema를 통과해야 한다.
- 상태 push도 전송 직전에 현재 최상위 문서 URL을 검증한다.
- 같은 revision에서 복구 화면 → 새 게임 전이는 허용하되, 늦은 복구 snapshot의 역전은 막는다. 같은 revision의 저장 실패 알림은 반영하고, 이전 정상 snapshot이 실패 알림을 지우지 못하게 한다.
- 지연된 snapshot 재현은 격리된 E2E `userData`가 있을 때만 최대 2초 동안 활성화되는 테스트 환경변수로 만든다. 지연 전에 상태를 캡처해 실제 역순 응답을 검증한다.

## 변경사항

- `src/main/ipc/trust.ts`, `src/main/main.ts`: 송신자의 WebContents·최상위 frame·URL 검증을 순수 함수로 분리하고 모든 IPC handler에 적용. 정기 구독과 복구 완료의 상태 push도 현재 문서 URL을 검사한다. E2E snapshot 응답 지연 지점 추가.
- `src/renderer/main.tsx`: 상태 적용에 revision 및 복구·저장 실패 동률 규칙을 사용하고, 구독 effect가 정리된 뒤 도착한 snapshot 응답은 버린다.
- `tests/main/trust.test.ts`, `tests/shared/contracts.test.ts`: 다른 sender, subframe, 낯선 URL, 내부 명령, 비정상 숫자와 추가 필드 거부 회귀.
- `tests/e2e/ipc-subscription.spec.ts`: 이전 snapshot보다 새 push 우선, 같은 revision의 복구 역순, 구독 해제·reload, 비공개 카드/슈, Node 격리·잘못된 IPC payload와 비신뢰 문서의 상태 push 차단을 실제 패키지에서 검증하는 6건.
- `tests/e2e/persistence.spec.ts`: S08-06의 재셔플 뒤 새 판은 무작위 카드에 따라 phase가 달라지므로 `스탠드` 버튼 대신 저장된 슈 소비 인덱스 4를 기다린다.
- `tests/e2e/support/app.ts`: 지연 옵션을 격리된 E2E 프로세스에 전달.

## 검증 결과

- 최초 완료 검증은 전체 16/16이었다. 2026-09-17 PR 재검토에서 S08-06의 무작위 카드 가정 때문에 15/16 실패를 재현하고 수정했다. 상태 push 보안 E2E는 수정 전 실제 게임 상태 revision 3~9 수신으로 실패한 뒤, 수정 후 통과했다.
- 최종 검증: `npm run test:e2e` — Node 22.22.1, macOS arm64, Electron 44.3.0, Forge 프로덕션 패키지. 전체 17/17 통과 (기존 11건 + S09 6건), 실패/스킵 0.
- 구현 보조 검사: `npm run check` — TypeScript root/E2E 통과, Vitest 11파일 98/98 통과.
- S09 최초 작업에서는 E2E 선작성 red 단계를 수행하지 않았다. 2026-09-17 추가한 상태 push 보안 시나리오는 수정 전 실패를 확인한 뒤 수정하고 재검증했다.

## 관련 이슈와 한계

- macOS 패키지 E2E에서 IPC·DOM 경계를 검증했다. Windows GUI, 실제 외부 앱 포커스, OS 투명 합성은 이 검증으로 판단하지 않는다.
- iframe 생성은 배포 CSP의 `frame-src 'none'`으로 차단된다. subframe 송신자 거부는 분리한 Main 검증 함수의 단위 테스트로 확인했다.
- 새 창·UtilityWindow가 도입되면 등록 창별 허용 frame과 보안 E2E를 확장해야 한다.

## 다음 시작점

S10 — 140×30 DIP 접힘·펼침 상태 모델. 펼친 크기 보존, 게임 진행 상태 유지, 중복 전이와 창 복원 회귀를 먼저 설계·E2E로 작성한다.
