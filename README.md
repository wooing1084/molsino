# molsino

**목적:** molsino의 실행·개발 방법과 상세 문서의 위치를 안내합니다.

**요약:** molsino는 macOS와 Windows에서 다른 앱 위에 떠 있는 카지노 게임입니다. 블랙잭·기본 수수료 바카라·빅휠을 하나의 공용 잔액으로 플레이할 수 있습니다. 게임 세션은 로컬에 저장해 재실행 후 복원할 수 있습니다.

## 목차

- [릴리즈 다운로드와 실행](#릴리즈-다운로드와-실행)
- [개발 환경](#개발-환경)
- [명령](#명령)
- [구조와 기준 문서](#구조와-기준-문서)
- [구현과 검증 현황](#구현과-검증-현황)

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

표시 언어는 기본 한국어이며 영어를 선택할 수 있습니다. macOS는 상단 애플리케이션 메뉴 또는 상태 아이콘 메뉴, Windows는 알림 영역의 `molsino` 메뉴에서 **언어 / Language → English**를 선택합니다. 작은 오버레이 안에는 별도 언어 설정을 두지 않습니다. 선택한 언어와 저장된 게임 세션은 앱을 다시 실행해도 각각 복원됩니다.

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

메뉴에서 블랙잭·바카라·빅휠을 선택합니다. 판을 마치면 메뉴로 돌아갈 수 있고, 메뉴의 새 시작에서 전체 잔액과 기록을 초기화합니다. 초기 잔액은 $100이며 모든 게임이 공유합니다. 블랙잭에서는 `−/+` 또는 금액칸을 눌러 베팅을 정하고 딜한 뒤, 화면에 표시되는 합법 행동으로 히트·스탠드·더블·스플릿·서렌더와 보험·이븐 머니를 플레이할 수 있습니다.

빅휠에서는 7구역 중 원하는 구역의 금액을 편집하고 회전합니다. 여러 구역에 베팅할 수 있으며 0 입력이나 제거 버튼으로 구역 베팅을 취소합니다. 한도는 전체 베팅 합계에 적용하고, 강원랜드의 54칸 배분과 구역별 배당을 따릅니다. 회전이 끝나면 당첨 구역·반환금·순손익을 표시합니다.

바카라에서는 `P`(Player)·`B`(Banker)·`T`(Tie) 중 한 곳과 금액을 선택한 뒤 딜합니다. 추가 카드는 자동 배분하며 Banker 승리 수수료 5%, Tie 순이익 8배를 적용합니다. 결과와 최근 20판 기록을 유지하고 다음 판은 직접 시작합니다.

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
| `npm run test:e2e` | 프로덕션 패키지를 만들고 Playwright Electron E2E 실행 |

`smoke`는 GUI 세션과 실행 중인 다른 앱 인스턴스가 없는 상태에서 실행합니다. 테스트가 띄운 앱은 종료합니다. 배포 서명·공증은 아직 구성하지 않았으며 생성물은 로컬 개발용입니다.

## 구조와 기준 문서

- `src/main`: 공통 창·트레이·플랫폼·IPC 경계와 공용 잔액·게임 상태·메뉴를 소유하는 `AppStore`.
- `src/preload`: Renderer에 기능별 API만 노출.
- `src/renderer`: 공개 게임 상태만 소비하는 React + CSS 플레이 화면.
- `src/core`: Electron에 의존하지 않는 블랙잭 엔진. 6덱 슈, 점수, 카지노 행동, 딜러 S17, 정산 원장을 구현.
- `src/shared`: 타입·Zod 스키마·채널 이름.
- `tests`: P1 게임 규칙·원장·슈/점수, GameStore·IPC 신뢰 경계, 리사이즈와 대표 플레이 Electron E2E.
- `.github/workflows/ci.yml`: macOS/Windows 공통 검사·패키징. GitHub에 연결하면 실행됩니다.

메인 기능과 블랙잭의 기준 문서: [문서 안내](docs/README.md)

제품 규칙: [블랙잭 제품 설계](docs/games/blackjack/product-design.md)

구현 계약: [메인 기술 설계](docs/main/technical-design.md), [블랙잭 기술 설계](docs/games/blackjack/technical-design.md)

배포 산출물과 OS별 빌드 방법: [빌드·배포 가이드](docs/main/building-distribution.md)

## 구현과 검증 현황

완료된 작업과 당시 검증·미검증 사항은 [세션 목록](docs/session-reports/session-list.md)에서 해당 보고서로 이동해 확인하세요. 현재 코드 구조와 E2E 범위는 [문서 안내](docs/README.md)에서 메인 기능과 게임별로 나누어 찾을 수 있습니다. 다음 작업은 [작업 세션 로드맵](docs/work-session-roadmap.md)을 따릅니다.
