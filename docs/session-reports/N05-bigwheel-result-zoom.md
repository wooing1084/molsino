# N05 후속 — 빅휠 결과 세 칸 확대 구현

**목적:** 54칸 고정 배열을 순환하며 결과 주변 세 칸을 확대하는 표시 개선의 구현·검증을 기록한다.

**요약:** D03 설계를 기준으로 전체 원형 휠을 연속 칸 표시로 바꿨다. 화면·타임라인·QA를 분리하고 기존 게임 규칙·저장·정산을 유지한다. 단위·패키지 테스트와 최소 창 시각 확인을 완료했다.

## 목차

- [변경 범위](#변경-범위)
- [검증 기록](#검증-기록)
- [다음 단계와 한계](#다음-단계와-한계)

날짜: 2026-09-23 · 상태: 구현·검증 완료 · 브랜치: `codex/n05-big-wheel`.

## 변경 범위

[D03](D03-bigwheel-result-zoom.md)의 제품·기술·검증 설계를 `653118d`로 먼저 기록했다. 현재 54칸 배열의 순서를 유지하고 같은 심볼도 서로 다른 칸으로 처리한다. 공식 휠의 물리적 배열을 새로 확인하거나 배열 순서를 바꾼 작업은 아니다.

- 화면 담당: 세 칸 확대·고정 포인터·중앙 이름과 배당·최소 창 배치.
- 타임라인 담당: 연속 표시 위치·결과 대기·감속·정지·동시 결과 공개·수명 검증.
- QA 담당: 패키지 RED, BW-11~14와 기존 빅휠·공용 카드 연출 회귀, 화면 캡처.
- 주 담당: 계약 조율·독립 코드/시각 검토·문서·작업 브랜치 통합.

규칙·베팅·배당·추첨·정산·저장·공개 IPC는 기존 N05 구현을 유지한다. 결과와 이웃 칸의 기준은 [제품 설계](../games/bigwheel/product-design.md), 타임라인과 매핑의 기준은 [기술 설계](../games/bigwheel/technical-design.md)다.

## 검증 기록

### 변경 전 RED

기존 소스로 프로덕션 패키지를 생성한 뒤 `npx playwright test tests/e2e/bigwheel-zoom.spec.ts`를 실제 macOS arm64 Electron 앱에서 실행했다. ‘빅휠 세 칸 확대’ 요소가 없어 5초 timeout으로 1개 실패했다. 이 실패를 확인한 뒤 제품 코드를 구현했다.

패키징은 기존 캐시를 사용했다.

```sh
MOLSINO_ELECTRON_ZIP_DIR=/Users/curvc/Library/Caches/electron/f9c7436ab4a2c1ed6ac6cea2902187de75bd5b7a60c0973ad8967c318a6313c3 npm run package
```

### 구현 후 검증

- `npm run check`: 타입 검사와 단위 테스트 21파일·278개 통과. 신규 모션 테스트는 모든 54개 인덱스와 여섯 결과 수신 시점에서 순환·전진·감속·최종 정렬을 검사했다.
- 최신 소스로 `npm run package`: macOS arm64 프로덕션 패키지 생성 성공.
- `npx playwright test tests/e2e/bigwheel.spec.ts tests/e2e/bigwheel-zoom.spec.ts --output=/tmp/molsino-bigwheel-zoom-results`: 28개 통과, 실패·스킵 0.
- `npx playwright test tests/e2e/gameplay-improvements.spec.ts tests/e2e/bigwheel-zoom.spec.ts --grep 'N04-|BW-12 빠른' --output=/tmp/molsino-bigwheel-zoom-regression-results`: 21개 통과, 실패·스킵 0. 고유 사례는 총 48개이며 모션 캡처를 추가한 빠른 정산 1개를 다시 실행했다.
- 테스트 캡처 추가 후 `npm run typecheck:e2e` 통과. `git diff --check` 통과.

구현 후 검증은 첫 실행에서 모두 통과했다. 빠른 정산 trace는 217프레임·1,801ms 동안 연속 위치 0.252→108을 기록했으며, 회전 중 최종 결과 속성 노출은 없었다. 실제 셀 좌표와 끝 구간 감속·포인터 중앙 정렬을 검사했다. 늦은 결과·같은 심볼 이웃·0↔53 순환·동작 줄이기·중복 상태·저장 재시도·reload·다음 판·리사이즈도 통과했다.

시각 증거는 첫 출력 디렉터리의 `bigwheel-zoom-BW-14-최소·기본-창과-흑백에서-세-칸-이름·배당·포인터·기존-조작을-확인한다/`에 `bigwheel-zoom-{220x150,280x180}-{light,dark}.png`로 생성했다. 화면 담당이 네 장을 직접 확인했고 주 담당도 두 크기의 light 이미지를 독립 확인했다. 중앙 ‘다이아몬드’·10:1·고정 포인터와 양옆 일부, 합계·한도·다음 판·결과가 보인다. 시작/중간/완료 캡처와 `motion-geometry.json`은 두 번째 출력 디렉터리의 BW-12 빠른 정산 폴더에 있다. 임시 경로의 산출물은 영구 보관을 보장하지 않는다.

## 다음 단계와 한계

사용자 지시에 따라 작업 브랜치를 유지하며 DEV 반영·PR 생성은 이번 범위에서 제외한다. macOS 패키지 자동화·캡처를 Windows GUI·외부 앱 포커스·물리 입력·OS 투명 합성 검증으로 간주하지 않는다.
