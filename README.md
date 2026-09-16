# Overlay Blackjack

macOS와 Windows용 작은 투명 블랙잭 오버레이. 투명 창, **순수 TypeScript Blackjack core**, Main GameStore와 실제 게임 UI까지 연결된 인메모리 MVP입니다. 로컬 저장·재기동 복원은 다음 단계입니다.

## 개발 환경

- Node.js 22.22.1 (`.nvmrc`), npm 10 이상
- macOS 또는 Windows 데스크톱 환경
- Electron 44.3.0, Forge 7.11.2, Vite 8.3.0, React 19.3.0, TypeScript 7.0.2
- 의존성 버전은 `package-lock.json`을 기준으로 재현합니다.

```sh
npm ci
npm start
```

`npm start`는 투명 창과 메뉴 막대/트레이 아이콘을 띄웁니다. 상단을 드래그해 이동하고, `◐`로 흰색/검정을 바꿀 수 있습니다. `−`로 숨긴 창은 트레이의 **보이기 / 클릭 통과 해제**로 복원합니다. 종료도 트레이 메뉴에서 합니다.

초기 잔액은 $100입니다. `−/+`로 베팅을 정하고 딜한 뒤, 화면에 표시되는 합법 행동으로 히트·스탠드·더블·스플릿·서렌더와 보험·이븐 머니를 플레이할 수 있습니다. 상태는 앱 프로세스 메모리에만 있으므로 재실행하면 초기화됩니다.

## 명령

| 명령 | 역할 |
| --- | --- |
| `npm start` | Forge + Vite 개발 실행 |
| `npm run typecheck` | TypeScript 검사 |
| `npm test` | 코어·IPC 신뢰 경계 단위 테스트 |
| `npm run check` | 타입 검사 + 테스트 |
| `npm run package` | 현재 OS용 실행 앱 생성 (`out/`) |
| `npm run make` | macOS ZIP / Windows 설치 EXE 생성 |
| `npm run make:mac` | Intel·Apple Silicon 공용 macOS Universal ZIP 생성 |
| `npm run make:windows` | Windows에서 설치 EXE와 포터블 ZIP 생성 |
| `npm run make:windows:portable` | 어느 OS에서든 Windows x64 포터블 ZIP 생성 |
| `npm run smoke` | package 이후 번들 UI·Preload·IPC를 실제 Electron에서 확인 |

`smoke`는 GUI 세션과 실행 중인 다른 앱 인스턴스가 없는 상태에서 실행합니다. 테스트가 띄운 앱은 종료합니다. 배포 서명·공증은 아직 구성하지 않았으며 생성물은 로컬 개발용입니다.

## 구조

- `src/main`: 창·트레이·플랫폼 설정·IPC와 게임 상태를 소유하는 `GameStore`.
- `src/preload`: Renderer에 기능별 API만 노출.
- `src/renderer`: 공개 게임 상태만 소비하는 React + CSS 플레이 화면.
- `src/core`: Electron에 의존하지 않는 P1 게임 엔진. 6덱 슈, 점수, 전체 카지노 행동, 딜러 S17, 정산 원장을 구현.
- `src/shared`: 타입·Zod 스키마·채널 이름.
- `tests`: P1 게임 규칙·원장·슈/점수, GameStore·IPC 신뢰 경계, 리사이즈와 대표 플레이 Electron E2E.
- `.github/workflows/ci.yml`: macOS/Windows 공통 검사·패키징. GitHub에 연결하면 실행됩니다.

제품 규칙: [제품 설계서](docs/blackjack-design.md)

구현 계약: [기술 설계서](docs/blackjack-technical-design.md)

배포 산출물과 OS별 빌드 방법: [빌드·배포 가이드](docs/building-distribution.md)

## 초기 세팅과 정식 구현의 경계

현재 제공: 투명 창, 비활성 표시, 상단 유지, 드래그/커스텀 리사이즈, 숨기기/복원, 트레이의 전체 클릭 통과와 크기 프리셋, 순수 Blackjack core, GameStore, strict 게임 IPC, 전체 기본 행동 UI.

후속 구현: SessionRepository와 재기동 복원, 전체 게임 여정 E2E, 접힘 모드, 금액 직접 입력창, 다중 모니터 위치 복구, Renderer 장애 복구, 자동 부분 클릭 통과.

프리셋은 임의 크기 조절을 대체하지 않습니다. 포커스·클릭 통과·다중 모니터·전체 화면의 실제 OS 동작은 P0 검증 항목입니다. Windows는 코드·CI 대상이며 실제 검증 여부는 아래 기록을 확인하세요.

## 검증 기록

- S01 리사이즈: 프로덕션 Electron E2E 4/4 통과.
- P1 Blackjack core: `npm run check` 9개 테스트 파일 78/78 및 macOS arm64 `npm run package` 통과. P1 E2E는 사용자 지시에 따른 이번 작업 예외로 S09/S14 통합 단계에 이관.
- S07 플레이 수직 통합: `npm run check` 10개 파일 87/87, 프로덕션 Electron E2E 5/5, `npm run smoke` 통과.
