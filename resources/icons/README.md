# molsino 앱 아이콘

업무용 서류 폴더 뒤에 스페이드 카드를 숨긴 흑백 아이콘. 제품의 조용한 투명 블랙잭 오버레이 컨셉을 반영했다. 둥근 사각형 타일 바깥은 투명하다.

| 파일 | 크기 / 용도 |
| --- | --- |
| `molsino.png` | 1024×1024 RGBA PNG 원본 |
| `molsino.icns` | macOS 앱 아이콘. 16·32·128·256·512pt의 1× / 2× 표현, 최대 1024px |
| `molsino.ico` | Windows 앱 및 설치 프로그램. 16·20·24·32·40·48·64·128·256px 포함 |
| `png/molsino-<크기>.png` | 16·20·24·32·40·48·64·128·256·512px 개별 PNG |

`forge.config.cjs`의 `packagerConfig.icon`은 확장자 없는 `molsino` 경로로 연결되어 대상 OS에 맞는 파일을 사용한다. Squirrel의 `setupIcon`에도 ICO를 지정했다. `npm run package` 또는 OS별 `make` 명령으로 다시 빌드하면 앱 패키지에 반영된다. 기존 배포 파일은 다시 빌드해야 한다.

`npm start` 개발 실행과 패키지 실행 모두 같은 PNG를 창 아이콘으로 사용하며, macOS Dock에도 명시적으로 적용한다. 패키징 시 PNG는 `extraResource`로 앱의 리소스 폴더에 복사한다. 변경 전에 실행 중이던 앱은 재시작해야 반영된다. 메뉴 막대/트레이는 작은 크기에서의 가독성을 위해 기존 전용 아이콘을 유지한다.

내장 ImageGen으로 생성했으며 실제 생성 프롬프트는 `generation-prompt.txt`에 보관했다. 생성 이미지의 구성을 바꾸지 않고 macOS `sips`로 PNG를 리사이즈하고 `iconutil`로 ICNS를 만들었다. ICO는 각 크기의 RGBA PNG를 포함한다.
