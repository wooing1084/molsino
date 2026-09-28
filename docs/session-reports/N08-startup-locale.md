# N08 실행 언어 유지와 첫 실행 언어 선택

**목적:** 설정이 없는 첫 실행의 시스템 선호 언어 선택, 저장된 선택의 우선과 시작·저장·첫 표시 실패 경계를 구현하고 검증한 결과를 기록한다.

**요약:** 첫 실행에만 시스템 선호 목록의 첫 한국어·영어를 선택하고 기존 설정·백업을 우선한다. 초기·복원 저장 실패에도 이번 실행의 언어를 유지하며, 메인 화면과 불투명도 창은 언어를 확인하기 전 번역 UI를 표시하지 않는다. 타입·단위 검사와 프로덕션 패키지의 N08·관련 회귀 E2E를 통과했고 실제 macOS 조회와 같은 userData의 이전 패키지 설정 승계를 확인했다.

## 목차

- [1. 작업 범위와 구현](#1-작업-범위와-구현)
- [2. 변경 전 실패 확인](#2-변경-전-실패-확인)
- [3. 구현 후 검증](#3-구현-후-검증)
- [4. 확인한 범위와 한계](#4-확인한-범위와-한계)
- [5. 전달과 다음 시작점](#5-전달과-다음-시작점)

날짜: 2026-09-28 · 상태: 구현·검증·원격 push·DEV 대상 PR 완료 · 브랜치: `codex/n08-startup-locale` · 기준 `DEV`: `889aeea` · [PR #16](https://github.com/wooing1084/molsino/pull/16).

## 1. 작업 범위와 구현

- `AGENT.md`, N08 제품·기술·E2E 기준과 N06·N07 보고서, 실제 시작·설정 저장·Renderer·테스트를 읽었다. N07 PR이 반영된 `DEV`를 fetch하고 로컬과 원격 차이 `0 / 0`을 확인한 뒤 지정 작업 브랜치를 만들었다.
- `src/main/startup-locale.ts`는 순서를 유지한 선호 목록에서 공백·대소문자·지역 구분을 정규화하고 전체 언어 태그를 검증해 첫 `ko`·`en`을 찾는다. 지원 언어 없음·빈 목록·조회 예외는 영어다. Main은 준비 완료 후 Electron의 실제 선호 언어 API를 호출한다.
- `PreferencesRepository`는 primary·backup이 모두 없는 `missing`에만 계산한 언어를 사용한다. 기존 v1 설정과 유효한 backup은 시스템보다 우선하며, 읽기 예외와 유효 backup 없는 손상·미래 형식은 한국어다. 읽기와 저장 예외를 분리해 초기·복원 저장 실패는 결정한 언어를 반환하고 로그를 남긴다.
- `useOverlayView`는 구독을 먼저 등록하고 조회하며, 유효성·revision·정리된 effect의 응답을 검사한다. 수락한 언어를 문서 `lang`에 적용한 뒤 UI를 연다. App과 불투명도 창은 준비 중 텍스트·번역 접근성 이름 없이 대기하며, 최초 조회 실패는 한국어·영어 오류 안내를 표시하고 후속 정상 push로 회복한다. 기본 HTML의 한국어 표식을 제거했다.
- 게임 snapshot 수신과 공개 타임라인은 계속 유지하고, 언어 변경으로 구독·연출을 재시작하지 않는다. 메뉴의 명시적 언어 변경은 기존처럼 저장 성공 후에만 확정한다. preferences v1·게임 저장 v4·게임 규칙·잔액·revision 계약을 유지한다.
- 공용 E2E 런처는 기본 선호를 `ko-KR`로 명시한다. 선호 목록·조회 오류·창 상태 지연/오류·preferences rename 실패 입력은 격리 `MOLSINO_TEST_USER_DATA` 실행에만 적용하며 일반 시작은 실제 OS API와 파일 작업을 사용한다.
- README·사용 설명서의 한국어·English 안내와 담당 기준 문서를 실제 정책에 맞춰 갱신했다. 정책 상세는 [제품 설계 §7.1](../main/product-design.md#71-n08-실행-언어-유지와-첫-실행-언어-선택), 구현 계약은 [기술 설계 §10.5](../main/technical-design.md#105-n08-첫-실행-언어-결정과-보존)가 담당한다.

## 2. 변경 전 실패 확인

제품 동작 변경 전에 N08 단위·E2E 기대를 작성했다. Main에는 격리 테스트 후크만 연결하고 기존 한국어 초기화·저장 실패 처리·Renderer 표시를 유지한 채 macOS arm64 프로덕션 패키지를 만들었다.

- `npm test -- tests/main/preferences-repository.test.ts tests/main/startup-locale.test.ts`: 설정 22건 중 17통과·5실패. 영어 첫 초기화와 영어 초기/백업 복원 저장 실패가 기대 `en`/실제 `ko`로 실패했다. 새 판별 함수 스위트는 아직 제품 소스가 없어 import 단계 실패였으며 기능 실패 수에 합산하지 않는다.
- `./node_modules/.bin/playwright test tests/e2e/startup-locale.spec.ts --grep 'N08-01 en-US|N08-05|N08-08 저장된 영어 game'`: 4실패. 첫 3건은 영어 최초 시작·초기/복원 저장 실패의 실제 한국어 동작을 확인했다. DOM 사례 1건은 테스트 fixture의 `nextId`에 `randomUUID`를 직접 전달한 준비 오류였다.
- fixture를 `() => randomUUID()`로 수정한 후 같은 변경 전 패키지에서 `--grep 'N08-08 저장된 영어 game'`으로 재실행: 1실패. 영어 설정이 있어도 게임 snapshot이 먼저 도착하면 초기 본문·버튼·`aria-label`·`title`에 한국어가 노출됨을 DOM 기록으로 확인했다. 그 뒤 Renderer를 수정했다.

제한된 네트워크의 첫 `npm run package`는 `getaddrinfo ENOTFOUND github.com`으로 실패했다. Forge의 필요한 네트워크 접근을 허용한 실행은 성공했다. 이후 RED와 GREEN 모두 실행 가능한 프로덕션 패키지를 사용했다.

## 3. 구현 후 검증

환경: macOS arm64 · Node.js **22.22.1** · npm **10.9.4**. 기존 실제 사용자 데이터와 OS 언어 설정은 변경하지 않았다.

| 명령·검증 범위 | 결과 |
| --- | --- |
| 집중 설정·언어 단위 테스트 | 2파일·43테스트 통과 |
| `npm run check` | 앱/E2E 타입 검사 및 24파일·326단위 테스트 통과 |
| `npm run package` | macOS arm64 프로덕션 패키지 생성 성공 |
| N08 `startup-locale.spec.ts` | 29통과·0실패·0스킵, 59.6초 |
| 관련 9개 파일 E2E 회귀 | 97통과·0실패·0스킵, 4.1분 |
| 실제 macOS 선호 언어 조회 | `['ko-KR']` → UI·`lang`·메뉴 체크·저장 설정이 `ko`로 일치 |
| 변경 Markdown 링크·앵커·구조와 `git diff --check` | 통과. 상세 문서 검사 명령은 아래에 기록 |

N08 실행 명령은 다음과 같다. 앞서 생성한 패키지에서 Playwright를 직접 실행했으며 패키징을 생략한 개발 서버 검증이 아니다.

```sh
MOLSINO_E2E_PREVIOUS_EXECUTABLE_PATH=/private/tmp/molsino-n08-baseline-889aeea/molsino.app/Contents/MacOS/molsino ./node_modules/.bin/playwright test tests/e2e/startup-locale.spec.ts
```

관련 회귀 실행 명령은 다음과 같다.

```sh
./node_modules/.bin/playwright test tests/e2e/localization.spec.ts tests/e2e/app-menu.spec.ts tests/e2e/ipc-state.spec.ts tests/e2e/ipc-subscription.spec.ts tests/e2e/overlay-state.spec.ts tests/e2e/gameplay-improvements.spec.ts tests/e2e/baccarat.spec.ts tests/e2e/bigwheel.spec.ts tests/e2e/playable-mvp.spec.ts
```

N07 시점의 실제 패키지를 변경 전 별도 경로에 보존했다. 이 패키지에서 메뉴로 영어를 저장하고 새 N08 패키지를 같은 임시 userData로 실행해 언어와 게임 저장 파일의 승계를 확인했다. 단순한 같은 바이너리 재실행과 구분한다.

새 N08 사례는 시작 화면·설정/백업 우선·시스템 선호 변경 후 보존·초기 저장 실패와 후속 재시도·메뉴 변경 실패를 다룬다. 창 상태 응답과 push를 함께 지연해 게임/복구 snapshot을 먼저 전달하고, 첫 실행·reload·불투명도 창·조절창 reload의 DOM 기록에서 한국어 노출 없음과 첫 번역 controls의 `lang=en`을 확인했다. 기록에는 번역 이전의 중립 상태도 포함하도록 요구했다. 최초 조회 실패의 병기 오류와 정상 push 뒤 영어 회복도 확인했다.

관련 회귀는 N06 전환·보존·진행 판 불변·명시 변경 저장 실패, 메뉴 시작/복구, 세 게임 플레이·공용 잔액·저장 재시도, 레벨·카드 공개 순서, IPC 신뢰/구독·snapshot 순서와 창 표시/불투명도를 포함한다. 위 두 E2E 실행은 서로 다른 126개 사례이며 각각 실패·스킵 없이 통과했다. 저장소에 있는 모든 E2E를 실행했다는 뜻은 아니다.

실제 macOS 관찰은 `node /private/tmp/molsino-n08-os-probe.cjs`로 수행했다. 선호 목록·실패·지연 입력을 제거한 격리 실행에서 실제 API 반환과 첫 화면·설정 파일을 확인하고 화면 캡처를 직접 검토했다.

문서 검사는 `python3 /private/tmp/molsino-n08-check-markdown.py`로 변경 Markdown 12개·상대 링크/앵커 365개·표 32개와 목적→요약→목차 구조를 확인했으며 오류 0이었다. `git diff --check`도 통과했다. README와 설명서의 한국어·English 시작 안내를 실제 N08 경로와 대조했다.

실행 로그와 OS 화면은 `/private/tmp/molsino-n08-*`, 집중 단위 로그는 `/private/tmp/n08-unit-*.log`에 있다. 임시 파일과 Playwright 산출물의 영구 보관은 보장하지 않으며 재현 가능한 검증 코드는 저장소의 테스트가 기준이다.

## 4. 확인한 범위와 한계

- 언어 목록 주입은 결정·저장·첫 DOM의 자동화 증거다. 실제 macOS 조회 관찰은 현재 호스트의 `ko-KR` 목록에 한정하며 실제 영어 OS 설정으로 바꾸지는 않았다.
- macOS 메뉴는 실제 Electron 메뉴 객체의 callback·체크 상태를 확인했다. 물리 상태 아이콘 클릭이나 OS 접근성 읽기 결과는 아니다.
- 초기 DOM 기록은 번역 UI의 노출 순서를 확인한다. 실제 macOS 합성 프레임의 깜빡임 측정은 수행하지 않았다.
- Windows 메뉴 구조는 기존 단위 테스트로 확인한다. 실제 Windows 시스템 선호 조회·GUI·알림 영역 물리 클릭은 이번 macOS 환경에서 검증하지 않았다.
- 패키지 교체는 같은 userData의 N07→N08 경로다. ZIP→MAS 컨테이너 간 데이터 이전은 포함하지 않았다. 외부 앱 포커스·실제 클릭 전달·물리 키·다중 모니터·투명 합성의 새 검증도 수행하지 않았다.

## 5. 전달과 다음 시작점

구현·관련 회귀·문서 검증을 마친 변경을 `2c35737`에 커밋하고 작업 브랜치를 push한 뒤 `DEV` 대상 [PR #16](https://github.com/wooing1084/molsino/pull/16)을 생성했다. 이 전달 기록은 후속 문서 커밋으로 같은 PR에 반영한다. 다음 작업은 N08 PR 반영 후 [로드맵](../work-session-roadmap.md)의 N09 macOS 서명과 Mac App Store 제출이다.
