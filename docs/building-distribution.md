# molsino 빌드와 배포

갱신일: 2026-09-16

`molsino`는 Electron 데스크톱 게임 오버레이다. 현재 첫 게임으로 Blackjack을 제공한다. 최종 사용자에게는 Docker 이미지가 아니라 macOS 앱 ZIP 또는 Windows 설치 파일/포터블 ZIP을 전달한다.

## 1. 지원 산출물

| 대상 | 산출물 | 사용 방법 |
| --- | --- | --- |
| macOS Intel + Apple Silicon | Universal `.app`을 담은 ZIP | 압축 해제 후 `molsino.app` 실행 |
| macOS Apple Silicon 전용 | arm64 `.app`을 담은 ZIP | 압축 해제 후 `molsino.app` 실행 |
| Windows x64 설치형 | `molsino-Setup.exe` | 설치 프로그램 실행 |
| Windows x64 포터블 | 앱 폴더 전체를 담은 ZIP | 압축을 모두 해제하고 `molsino.exe` 실행 |

현재 산출물은 코드 서명되지 않은 개발 배포본이다. 다른 컴퓨터에서는 macOS Gatekeeper 또는 Windows SmartScreen 경고가 표시될 수 있다. 공개 배포 전에는 §7의 서명 작업이 필요하다.

## 2. 공통 준비

Node.js 버전은 `.nvmrc`의 22.22.1을 사용한다. 깨끗한 작업 디렉터리에서 다음을 실행한다.

```sh
npm ci
npm run check
```

버전은 `package.json`의 `version`에서 관리한다. 새 배포를 만들기 전에 버전을 올린다.

## 3. macOS 빌드

macOS에서 Intel과 Apple Silicon을 모두 지원하는 Universal 앱 ZIP을 만든다.

```sh
npm run make:mac
```

산출물:

```text
out/make/zip/darwin/universal/molsino-darwin-universal-<version>.zip
```

현재 Apple Silicon Mac만 대상으로 빠르게 만들려면 다음을 사용한다.

```sh
npm run make:mac:arm64
```

산출물:

```text
out/make/zip/darwin/arm64/molsino-darwin-arm64-<version>.zip
```

ZIP을 풀고 `molsino.app`을 실행한다. 로컬 패키지 폴더를 직접 실행하려면 다음과 같이 연다.

```sh
open "out/molsino-darwin-universal/molsino.app"
```

## 4. Windows 빌드

### Windows에서 설치 파일과 포터블 ZIP 만들기

Windows x64 환경에서 실행한다.

```powershell
npm ci
npm run check
npm run make:windows
```

주요 산출물:

```text
out/make/squirrel.windows/x64/molsino-Setup.exe
out/make/zip/win32/x64/molsino-win32-x64-<version>.zip
```

사용자에게는 일반적으로 `molsino-Setup.exe`를 전달한다. Squirrel 업데이트용 `RELEASES`와 `.nupkg`도 함께 생성되지만, 자동 업데이트 서버를 구성하기 전에는 직접 전달할 필요가 없다.

### macOS에서 Windows 포터블 ZIP 교차 빌드

이 프로젝트에는 네이티브 Node 모듈이 없으므로 macOS에서도 Windows x64 포터블 앱을 패키징할 수 있다.

```sh
npm run make:windows:portable
```

산출물:

```text
out/make/zip/win32/x64/molsino-win32-x64-<version>.zip
```

Windows 사용자는 ZIP을 전부 푼 뒤 폴더 안의 `molsino.exe`를 실행한다. EXE 하나만 떼어 전달하면 필요한 리소스가 없어 실행되지 않는다.

Windows 설치형 `Setup.exe`는 Windows에서 빌드한다. 현재 macOS에는 Squirrel.Windows가 요구하는 Wine과 Mono가 없으므로 로컬 Mac에서는 포터블 ZIP까지만 만든다.

## 5. GitHub Actions 자동 빌드

`.github/workflows/build-distributables.yml`은 다음 경우 두 OS에서 병렬 빌드한다.

- Actions 화면에서 `Build desktop distributables`를 수동 실행
- `v0.1.0` 같은 `v*` 태그 push

완료 후 해당 workflow run의 Artifacts에서 다음 묶음을 받는다.

- `molsino-macos-universal`
- `molsino-windows-x64`

이 저장소를 GitHub에 연결하기 전에는 workflow가 실행되지 않는다. 현재 작업 디렉터리에는 `.git` 저장소가 없으므로 우선 로컬 산출물을 사용한다.

## 6. 산출물 확인

배포 전에 최소한 다음을 확인한다.

1. `npm run check`가 통과했는지 확인한다.
2. macOS ZIP을 별도 폴더에 풀고 앱을 실행한다.
3. Windows ZIP을 Windows PC에 풀고 `molsino.exe`를 실행한다.
4. 베팅 → 딜 → 히트/스탠드 → 정산 → 다음 판을 확인한다.
5. 트레이에서 숨기기, 복원, 클릭 통과 해제, 종료를 확인한다.
6. 설치형은 설치 → 실행 → 종료 → 제거까지 확인한다.

`npm run test:e2e`는 현재 호스트용 프로덕션 패키지를 대상으로 자동 검증한다. Windows GUI 동작은 Windows 환경에서 별도로 확인해야 한다.

macOS 패키지 자체를 smoke 테스트하려면 실행 파일 경로를 지정할 수 있다.

```sh
MOLSINO_SMOKE_EXECUTABLE="out/molsino-darwin-universal/molsino.app/Contents/MacOS/molsino" npm run smoke
```

## 7. 공개 배포 전에 필요한 작업

### macOS

- Apple Developer Program 가입
- Developer ID Application 인증서로 앱 서명
- hardened runtime과 entitlements 검토
- Apple notarization 및 staple

### Windows

- 코드 서명 인증서 준비
- 앱과 Squirrel 설치 프로그램 서명
- SmartScreen 평판 형성 전 경고 가능성 안내

인증서 비밀번호나 키 파일은 저장소에 넣지 않고 GitHub Actions Secrets 또는 안전한 로컬 키체인에서 제공한다. 현재 Forge 설정에는 서명 자격 증명이 들어 있지 않다.

## 8. 현재 제품 제한

- 게임은 플레이할 수 있지만 SessionRepository가 아직 없어서 앱 종료 후 잔액과 진행 중인 판이 초기화된다.
- 자동 업데이트와 GitHub Release 게시 자동화는 아직 구성하지 않았다.
- 앱 전용 아이콘과 스토어 배포 설정은 후속 제품화 범위다.
- Windows 실장비 GUI 검증은 아직 완료되지 않았다.
