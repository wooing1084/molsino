# molsino

macOS와 Windows용 작은 투명 게임 오버레이. `molsino`에서 제공하는 첫 번째 게임은 Blackjack입니다. 투명 창, **순수 TypeScript Blackjack core**, Main GameStore와 실제 게임 UI까지 연결된 인메모리 MVP이며 이후 다른 게임을 추가할 수 있는 제품 이름과 배포 체계를 사용합니다. 로컬 저장·재기동 복원은 다음 단계입니다.

## 릴리즈 다운로드와 실행

[최신 GitHub Release](https://github.com/wooing1084/molsino/releases/latest)에서 사용하는 OS에 맞는 파일을 다운로드합니다.

### macOS

1. `molsino-darwin-universal-<version>.zip`을 다운로드합니다.
2. ZIP을 풀고 `molsino.app`을 실행합니다.
3. 필요하면 앱을 `/Applications` 폴더로 옮깁니다.

Universal 빌드는 Intel Mac과 Apple Silicon Mac을 모두 지원합니다. 현재 앱은 Apple Developer 서명·공증 전이므로 Gatekeeper 경고가 표시될 수 있습니다. 출처와 파일이 신뢰되는지 확인한 뒤 Finder에서 앱을 우클릭해 **열기**를 선택할 수 있습니다.

### Windows

설치형과 포터블 중 하나를 선택합니다.

- `molsino-Setup.exe`: 권장 설치 파일. 다운로드한 파일을 실행해 설치합니다.
- `molsino-win32-x64-<version>.zip`: 설치하지 않는 포터블 버전. ZIP을 **전부 압축 해제**한 뒤 폴더 안의 `molsino.exe`를 실행합니다.

포터블 버전은 EXE 하나만 분리하면 필요한 DLL과 리소스를 찾지 못하므로 폴더 전체를 유지해야 합니다. 현재 Windows 코드 서명 전이므로 SmartScreen 경고가 표시될 수 있으며, 출처를 신뢰할 수 있을 때만 실행합니다.

앱은 화면 오른쪽 아래에 나타납니다. 창을 숨기거나 클릭 통과 상태가 됐다면 macOS 메뉴 막대 또는 Windows 알림 영역의 `molsino` 아이콘에서 **보이기 / 클릭 통과 해제**를 선택합니다. 완전히 종료하려면 창의 `×` 또는 트레이 메뉴의 **종료**를 사용합니다.

현재 버전은 앱을 종료하면 잔액과 진행 중인 판이 초기화됩니다.

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
