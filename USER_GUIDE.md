# molsino 사용 설명서 / User Guide

**목적 / Purpose:** 설치한 molsino의 창을 조작하고 게임을 플레이하는 방법을 안내합니다. Learn how to control the molsino window and play its games.

**요약 / Summary:** 게임들은 로컬에 저장되는 하나의 잔액을 사용합니다. `$`는 구매·환전·현금 보상이 없는 가상 게임 머니입니다. The games share one locally saved bankroll. `$` represents virtual game money with no purchases, cash exchange, or cash prizes.

## 목차 / Contents

- [한국어](#한국어)
  - [1. 빠른 시작](#1-빠른-시작)
  - [2. 창 조작과 클릭 통과](#2-창-조작과-클릭-통과)
  - [3. 언어 선택](#3-언어-선택)
  - [4. 잔액·레벨·금액 입력](#4-잔액레벨금액-입력)
  - [5. 블랙잭](#5-블랙잭)
  - [6. 바카라](#6-바카라)
  - [7. 빅휠](#7-빅휠)
  - [8. 저장·이동·새 시작](#8-저장이동새-시작)
  - [9. 문제 해결](#9-문제-해결)
- [English](#english)
  - [1. Quick start](#1-quick-start)
  - [2. Window controls and click-through](#2-window-controls-and-click-through)
  - [3. Language](#3-language)
  - [4. Bankroll, levels, and amount entry](#4-bankroll-levels-and-amount-entry)
  - [5. Blackjack](#5-blackjack)
  - [6. Baccarat](#6-baccarat)
  - [7. Big Wheel](#7-big-wheel)
  - [8. Saving, switching games, and starting over](#8-saving-switching-games-and-starting-over)
  - [9. Troubleshooting](#9-troubleshooting)

## 한국어

### 1. 빠른 시작

molsino는 다른 앱을 사용하는 동안 작은 투명 창에서 즐기는 로컬 싱글플레이 게임입니다. 설치 파일과 OS별 실행 방법은 [README의 릴리즈 다운로드와 실행](README.md#릴리즈-다운로드와-실행)을 따르세요.

1. 앱을 실행합니다. 첫 실행은 시스템 선호 언어에 따라 한국어 또는 영어로 시작하며 초기 잔액은 **$100.00**, 레벨은 **Lv.1**입니다. 한국어 화면으로 따라 하려면 [언어 선택](#3-언어-선택)에서 **한국어**를 선택하세요.
2. 메뉴에서 플레이할 게임을 선택합니다.
3. 베팅 금액칸을 눌러 `1.00`처럼 입력하고 **Enter**로 확정합니다. 블랙잭·바카라는 **딜**, 빅휠은 **회전**으로 판을 시작합니다.
4. 블랙잭에서는 **히트** 또는 **스탠드** 등 표시된 행동을 선택합니다. 바카라의 카드 배분과 빅휠의 회전·정산은 자동으로 진행됩니다.
5. 결과가 표시되고 저장이 끝나면 **다음 판** 또는 **메뉴**를 선택합니다. 다음 판을 눌러도 새 베팅은 자동으로 시작하지 않습니다.

창이 보이지 않거나 버튼을 누를 수 없다면 macOS 메뉴 막대 또는 Windows 알림 영역의 `molsino` 아이콘 메뉴에서 **보이기 / 클릭 통과 해제**를 선택하세요. 저장된 미완료 판이 있으면 메뉴 대신 그 게임에서 이어집니다.

### 2. 창 조작과 클릭 통과

| 하고 싶은 일 | 조작 |
| --- | --- |
| 창 이동 | 상단의 `⠿ molsino` 영역을 드래그합니다. |
| 크기 조절 | 네 모서리를 드래그합니다. 아이콘 메뉴의 **작게**, **기본 크기**, **크게**로도 조절할 수 있습니다. |
| 흰색/검정 전환 | 상단의 **◐**를 클릭합니다. |
| 불투명도 조절 | **◐**에 마우스를 올리고 나타난 슬라이더로 이동해 조절합니다. 범위는 20~100%입니다. |
| 숨기기 | 상단의 **−** 또는 아이콘 메뉴의 **숨기기**를 선택합니다. |
| 숨김·복원 토글 | macOS는 **Option + 백틱**, Windows는 **Alt + 백틱**을 누릅니다. 백틱은 기호 <code>&#96;</code> 키입니다. |
| 창 복원·클릭 통과 해제 | 아이콘 메뉴의 **보이기 / 클릭 통과 해제**를 선택합니다. |
| 아래 앱으로 클릭 전달 | 아이콘 메뉴의 **클릭 통과**를 선택합니다. |
| 완전 종료 | 상단의 **×** 또는 아이콘 메뉴의 **종료**를 선택합니다. |

macOS의 아이콘은 화면 상단 메뉴 막대에 있고 Windows의 아이콘은 작업 표시줄 알림 영역에 있습니다. Windows에서 아이콘이 숨겨져 있으면 알림 영역의 숨겨진 아이콘 목록도 확인하세요.

**클릭 통과는 창 전체에 적용되므로 게임 버튼도 누를 수 없습니다.** 다시 플레이하려면 아이콘 메뉴에서 **보이기 / 클릭 통과 해제**를 선택하세요. 숨겨진 창을 단축키로 복원할 때도 클릭 통과가 해제됩니다. 단축키가 다른 앱과 충돌하면 아이콘 메뉴를 사용하세요.

숨겨도 진행 판은 취소되지 않으며 자동 진행과 저장은 계속됩니다. 불투명도를 낮춘 것만으로 클릭 통과가 켜지지는 않습니다.

### 3. 언어 선택

- macOS: 화면 상단 애플리케이션 메뉴 또는 `molsino` 상태 아이콘 메뉴의 **언어 / Language**를 엽니다.
- Windows: 알림 영역의 `molsino` 아이콘 메뉴에서 **언어 / Language**를 엽니다.
- **한국어** 또는 **English**를 선택합니다. 저장에 성공하면 표시가 바로 바뀝니다.

언어 설정이 없는 첫 실행은 시스템 선호 언어 목록에서 먼저 나오는 한국어 또는 영어로 시작합니다. `ko-KR`은 한국어, `en-US`·`en-GB`는 영어이며 지원 언어가 없거나 목록을 조회하지 못하면 영어를 사용합니다. 이후에는 저장된 선택을 우선하므로 시스템 언어를 바꿔도 앱 언어가 바뀌지 않습니다. 이전 버전에서 저장한 한국어도 유지됩니다.

선택한 언어는 재실행·화면 새로고침·**새 시작**과 앱 데이터가 유지되는 업데이트 후에도 유지되며 게임 규칙이나 잔액은 바뀌지 않습니다. 첫 언어 설정이나 복구한 언어를 저장하지 못해도 이번 실행에는 결정한 언어를 사용하지만 다음 실행의 보존은 보장되지 않습니다. 메뉴에서 언어를 바꿀 때 저장 실패 안내가 나오면 기존 언어가 유지되므로 나중에 다시 선택하세요.

### 4. 잔액·레벨·금액 입력

게임들은 같은 잔액을 사용합니다. 게임을 바꿔도 돈이 추가되지 않으며 기본 베팅액은 **딜** 또는 **회전**을 시작할 때 차감됩니다. 블랙잭의 더블·스플릿·보험 추가금은 해당 행동을 선택할 때 차감됩니다.

메뉴 상단의 **Lv.n** 버튼을 누르면 레벨 선택 화면이 열립니다. 좌우 버튼이나 가로 스크롤로 카드를 찾고 **적용**을 눌러 변경합니다. **뒤로**는 적용하지 않고 메뉴로 돌아갑니다.

| 레벨 | 다른 레벨에서 이 레벨을 선택할 때 필요한 잔액 | 최소 베팅 | 최대 기본 베팅 |
| --- | ---: | ---: | ---: |
| Lv.1 | $1 | $1 | $50 |
| Lv.2 | $500 | $5 | $250 |
| Lv.3 | $2,500 | $25 | $1,000 |
| Lv.4 | $10,000 | $100 | $5,000 |
| Lv.5 | $50,000 | $500 | $10,000 |
| Lv.6 | $100,000 | $1,000 | $25,000 |

입장한 뒤 잔액이 입장 조건보다 줄어도 선택 레벨을 유지합니다. 자동 승급·강등은 없으며 **최고 달성**은 현재 선택 레벨과 별개의 기록입니다. 기본 베팅은 레벨 한도와 현재 잔액 안에서 정해야 합니다. 블랙잭의 더블·스플릿·보험 추가금은 별도이므로 한 판의 총 투입금은 최대 기본 베팅보다 커질 수 있습니다.

금액 입력은 다음 순서로 합니다.

1. **베팅 금액** 버튼, 즉 현재 금액이 쓰인 칸을 누릅니다. 빅휠은 선택 구역의 이름과 금액이 쓰인 칸입니다.
2. `5`, `5.5`, `5.50`처럼 숫자와 소수점만 입력합니다. 최대 소수 둘째 자리까지 허용하며 `$`, 쉼표, 음수는 넣지 않습니다.
3. **Enter**로 확정합니다. **Escape** 또는 다른 곳 클릭은 입력을 취소하고 이전 확정액으로 돌아갑니다.

오류가 표시되면 금액을 고친 뒤 Enter를 다시 누르세요. 편집 중에는 딜·회전이 비활성화됩니다. 블랙잭은 **− / +**로도 금액을 조절하고, 바카라·빅휠은 금액을 직접 입력합니다.

현재 레벨 최소액이 부족하면 진행 판의 정산을 마친 뒤 **메뉴**에서 하위 레벨을 선택하세요. 잔액이 **$1 미만**이면 [새 시작](#8-저장이동새-시작)을 이용합니다.

### 5. 블랙잭

카드 점수·승패·행동·배당 등 일반적인 규칙은 [Wikipedia의 Blackjack — Rules of play at casinos](https://en.wikipedia.org/wiki/Blackjack#Rules_of_play_at_casinos)(영문)를 참조하세요. 카지노와 테이블마다 세부 규칙은 다를 수 있습니다.

1. 금액을 정하고 **딜**을 누릅니다.
2. 보험·이븐 머니 선택이 나오면 **보험 $금액 / 안 함** 또는 **이븐 머니 / BJ 유지**에서 선택합니다.
3. **히트**, **스탠드**, **더블**, **스플릿**, **서렌더** 등 화면에 나타난 행동을 선택합니다. 가능한 행동만 버튼으로 표시됩니다.
4. 모든 내 패의 행동이 끝나면 딜러가 자동으로 진행합니다. 결과와 하단 **라운드 ±$금액**을 확인하고 **다음 판** 또는 **메뉴**를 선택합니다. 라운드 금액은 모든 패와 보험을 합친 순손익입니다.

molsino에서는 보험 금액을 별도로 입력하지 않고 화면에 제시된 금액을 구매하거나 거절합니다. `18s`처럼 `s`가 붙은 점수는 소프트 점수 표시입니다. 센트 미만의 반환금은 가장 가까운 센트로 반올림하며 정확히 반 센트면 올립니다.

### 6. 바카라

카드 점수·추가 카드·승패·배당은 [Wikipedia의 Baccarat — Punto banco](https://en.wikipedia.org/wiki/Baccarat#Punto_banco)(영문)를 참조하세요. 점수는 같은 문서의 **Valuation of hands**, 추가 카드와 기본 수수료 방식은 **Punto banco** 절을 참고하세요.

화면의 **P**는 Player, **B**는 Banker, **T**는 Tie(동점)입니다. molsino에서는 한 판에 한 곳만 선택합니다.

1. **P / B / T** 중 한 곳을 선택합니다.
2. 금액칸을 눌러 입력하고 Enter로 확정한 뒤 **딜**을 누릅니다.
3. 자동 카드 배분과 결과 표시를 기다립니다.
4. 결과·반환금·순손익을 확인하고 **다음 판** 또는 **메뉴**를 선택합니다.

molsino에서는 Banker 수수료를 승리 시 바로 반영하고, 수수료를 차감한 이익을 센트로 반올림하며 정확히 반 센트면 올립니다. 최근 최대 20개의 **P B T**는 내 베팅의 승패가 아니라 어느 패가 이겼는지 나타내는 기록이며 다음 결과를 예측하거나 보장하지 않습니다.

### 7. 빅휠

휠의 베팅·당첨·배당 등 일반적인 규칙은 [Wikipedia의 Big Six wheel — Money wheel](https://en.wikipedia.org/wiki/Big_Six_wheel#Money_wheel)(영문)를 참조하세요. 휠의 구역 구성과 배당은 변형에 따라 다르므로 molsino에 적용되는 구역명과 배당은 게임 화면에서 확인하세요.

1. 구역 목록에서 편집할 구역을 선택합니다. 작은 창에서는 목록을 스크롤해 나머지 구역을 찾습니다.
2. 아래의 구역명·금액칸을 눌러 금액을 입력하고 Enter로 확정합니다. 구역을 선택하기만 해서는 베팅액이 추가되지 않습니다.
3. 다른 구역에도 반복해 베팅할 수 있습니다. 선택 구역에 **0**을 확정하거나 **제거**를 누르면 그 구역 베팅을 취소합니다.
4. **Σ** 합계를 확인합니다. 최소·최대 베팅과 잔액 한도는 **전체 합계**에 적용됩니다. 개별 구역은 $0.01부터 입력할 수 있지만 합계가 레벨 최소액 이상이어야 회전할 수 있습니다.
5. **회전**을 누릅니다. 회전 중에는 베팅을 바꿀 수 없습니다. 멈추면 중앙 포인터 아래의 당첨 구역과 반환금·순손익을 확인합니다.
6. **다음 판** 또는 **메뉴**를 선택합니다. 다음 판에서는 가능한 경우 직전 베팅 구성을 유지하므로 합계를 확인하고 다시 회전하세요.

결과 화면의 **반환금**은 받은 금액, **순손익**은 반환금에서 전체 베팅액을 뺀 값입니다.

molsino의 좌·중앙·우 세 칸은 같은 휠의 당첨 칸과 이웃 칸을 확대한 표시입니다. 최근 세 판을 뜻하지 않으며 당첨은 중앙 포인터로 읽습니다. 별도의 최근 기록은 최대 20개이며 다음 결과를 예측하거나 보장하지 않습니다.

### 8. 저장·이동·새 시작

게임은 진행 단계와 결과를 자동으로 로컬에 저장합니다. 다시 실행하면 마지막 저장 상태를 사용합니다. 미완료 판은 해당 게임에서 이어지고, 미완료 판이 없으면 메뉴로 시작합니다. 게임별 카드 묶음(슈)과 최근 기록은 메뉴 이동이나 재실행으로 지워지지 않습니다.

베팅 전 또는 결과 공개와 저장이 끝난 뒤에 **메뉴**로 이동할 수 있습니다. 판 진행·결과 연출·저장 중에는 기다리세요. 숨김은 판을 취소하지 않습니다. 확정하지 않은 금액 입력은 숨김이나 메뉴 이동 시 취소됩니다.

처음부터 다시 플레이하려면 다음 순서로 합니다.

1. 진행 판의 정산과 저장이 끝난 뒤 **메뉴**로 돌아갑니다.
2. **새 시작**을 누르고 초기화 범위를 확인합니다.
3. **초기화 확정**을 누릅니다. **취소**하면 데이터는 바뀌지 않습니다.

초기화하면 공용 잔액은 **$100**, 선택 레벨은 **Lv.1**, 최고 잔액 기록은 **$100**으로 돌아갑니다. 모든 게임의 판·슈·최근 기록·베팅 설정을 새로 시작합니다. 선택한 언어는 유지됩니다.

언어와 게임 데이터는 저장되지만 창 위치·크기·흰색/검정·불투명도 조절은 재실행 후 보존되지 않습니다.

### 9. 문제 해결

| 상황 | 할 일 |
| --- | --- |
| 창이 숨겨졌거나 게임 버튼을 누를 수 없음 | 아이콘 메뉴의 **보이기 / 클릭 통과 해제**를 선택합니다. 숨겨진 창은 단축키로도 복원할 수 있습니다. |
| 딜·회전이 비활성 | 금액 편집을 Enter로 확정하거나 Escape로 취소합니다. 레벨 최소액·최대액·잔액을 확인합니다. 빅휠은 Σ 합계가 기준입니다. 진행·카드 공개·저장 중이면 기다립니다. |
| 메뉴 버튼이 비활성 | 현재 판과 결과 공개·저장이 끝날 때까지 기다립니다. 저장 실패라면 **저장 재시도**를 누릅니다. |
| 입력한 금액이 사라짐 | 다른 곳 클릭이나 Escape는 취소입니다. 금액을 다시 입력하고 Enter로 확정하세요. |
| 금액 입력 오류 | `$`나 쉼표 없이 소수 둘째 자리까지 입력하고 한도·잔액 안의 금액인지 확인합니다. |
| 잔액이 현재 레벨 최소액보다 적음 | 판 정산 뒤 메뉴에서 하위 레벨을 선택합니다. $1 미만이면 **새 시작**을 이용합니다. |
| 저장 실패 | **저장 재시도**로 같은 변경을 다시 저장합니다. 재시도는 새 판을 뽑지 않습니다. 저장하지 못한 채 종료를 확정하면 미확정 변경은 사라지고 다음 실행은 마지막 저장 상태로 돌아갑니다. |
| 진행 오류·앱 연결 실패·복원 후 빈 창 | 아이콘 메뉴에서 **종료**한 뒤 다시 실행합니다. 진행 오류에는 자동 복구를 기다리기보다 재실행을 이용하세요. |

앱 시작 때 저장 복구 화면이 나오면 표시된 선택지를 확인하세요. 손상되었거나 지원하지 않는 원본은 백업 복구 또는 새 게임 시작을 선택할 때 별도 보존합니다.

- **불러오기 재시도:** 저장 파일을 읽거나 저장할 수 없는 경우에 표시됩니다. 접근 문제가 해결된 뒤 다시 시도합니다. 이 화면에는 백업 복구나 새 게임 시작 버튼이 없습니다.
- **백업 복구:** 손상되었거나 지원하지 않는 저장 버전에서 유효한 백업이 있을 때 표시됩니다. 공용 잔액·레벨과 모든 게임의 판·슈·기록·베팅 설정을 백업 시점으로 되돌리므로 최신 변경은 빠질 수 있습니다.
- **새 게임 시작:** 손상되었거나 지원하지 않는 저장 버전에서 [새 시작과 같은 범위](#8-저장이동새-시작)의 게임 데이터를 초기화하고 $100·Lv.1로 시작합니다. **이 복구 버튼은 별도 확인 화면 없이 실행됩니다.** 기존 진행과 기록을 포기할 때 선택하세요. 선택한 언어는 유지됩니다.

## English

### 1. Quick start

molsino is a local single-player game in a small transparent window that floats over other apps. For downloads and installation, follow the [README's release instructions](README.md#릴리즈-다운로드와-실행). On macOS, extract the Universal ZIP and open `molsino.app`. On Windows, use the installer or extract the entire portable ZIP and open `molsino.exe`.

1. Open the app. First launch follows your system language preferences, with **$100.00** and **Lv.1**. If needed, choose **언어 / Language → English** from the macOS application menu or status icon menu, or the Windows notification area icon menu.
2. Select the game you want to play from the menu.
3. Click the amount field, enter a number such as `1.00`, and press **Enter** to confirm. Use **Deal** for Blackjack or Baccarat, or **Spin** for Big Wheel.
4. In Blackjack, choose an available action such as **Hit** or **Stand**. Baccarat deals automatically, and Big Wheel spins and settles automatically.
5. Once the result appears and saving finishes, choose **Next Round** or **Menu**. Next Round prepares betting; it does not place the next bet automatically.

If the window is hidden or its buttons do not respond, use the `molsino` icon in the macOS menu bar or Windows notification area and choose **Show / Disable Click-through**. Before switching from Korean, this item is **보이기 / 클릭 통과 해제**. An unfinished saved round opens in its game instead of the menu.

### 2. Window controls and click-through

| Action | Control |
| --- | --- |
| Move | Drag the `⠿ molsino` area at the top. |
| Resize | Drag any of the four corners, or choose **Small**, **Default Size**, or **Large** in the icon menu. |
| Switch black/white | Click **◐** at the top. |
| Adjust opacity | Hover over **◐**, then move onto the slider that appears. The range is 20–100%. |
| Hide | Click **−** or choose **Hide** in the icon menu. |
| Toggle hidden/visible | Press **Option + backtick** on macOS or **Alt + backtick** on Windows. Backtick is the <code>&#96;</code> key. |
| Show and disable click-through | Choose **Show / Disable Click-through** in the icon menu. |
| Pass clicks to the app underneath | Choose **Click-through** in the icon menu. |
| Quit completely | Click **×** or choose **Quit** in the icon menu. |

The macOS status icon is in the top menu bar. On Windows, look in the taskbar notification area, including its hidden icons list.

**Click-through applies to the whole window, including game buttons.** To play again, choose **Show / Disable Click-through**. Restoring a hidden window with the shortcut also disables click-through. If another app has already claimed the shortcut, use the icon menu.

Hiding does not cancel a round. Automatic play and saving continue while hidden. Lowering opacity does not enable click-through.

### 3. Language

- macOS: open **언어 / Language** in the application menu at the top of the screen or the `molsino` status icon menu.
- Windows: open **언어 / Language** in the `molsino` notification area icon menu.
- Select **한국어** or **English**. The display changes as soon as the setting is saved successfully.

When no language setting exists, first launch uses the first Korean or English entry in your system language preferences. `ko-KR` means Korean, and `en-US` or `en-GB` means English. If neither language is listed or the list cannot be read, the app uses English. After that, the saved choice takes priority, even if you change your system language. Korean saved by an earlier version is also retained.

Your choice is retained after restarting, reloading the screen, using **Start Over**, or updating while keeping the app's data. Switching language does not change game rules or your bankroll. If the initial or recovered language setting cannot be saved, the chosen language is still used for that run, but retention on the next launch is not guaranteed. If a language-saving warning appears when you change language from the menu, the previous language stays active; try selecting the language again later.

### 4. Bankroll, levels, and amount entry

The games share one bankroll. Switching games does not add money. Base bets are deducted when you start **Deal** or **Spin**. Blackjack doubles, splits, and insurance deduct additional money when you choose those actions.

Click **Lv.n** at the top of the menu to open the level selector. Browse with the arrows or horizontal scrolling, then choose **Apply** to change levels. **Back** returns to the menu without applying your selection.

| Level | Bankroll needed to select this level from another level | Minimum bet | Maximum base bet |
| --- | ---: | ---: | ---: |
| Lv.1 | $1 | $1 | $50 |
| Lv.2 | $500 | $5 | $250 |
| Lv.3 | $2,500 | $25 | $1,000 |
| Lv.4 | $10,000 | $100 | $5,000 |
| Lv.5 | $50,000 | $500 | $10,000 |
| Lv.6 | $100,000 | $1,000 | $25,000 |

Your selected level stays active if your bankroll later falls below its entry requirement. Levels do not change automatically. **Personal best** records your highest achievement separately from the selected level. Base bets must fit the level limits and available bankroll. Blackjack doubles, splits, and insurance require additional money, so the total committed in a round can exceed the maximum base bet.

To enter an amount:

1. Click **Bet amount**, the button showing the current amount. In Big Wheel, it shows the selected area's name and amount.
2. Enter numbers such as `5`, `5.5`, or `5.50`. Use only digits and a decimal point, with up to two decimal places. Omit `$`, commas, and negative signs.
3. Press **Enter** to confirm. **Escape** or clicking elsewhere cancels editing and restores the previously confirmed amount.

If an error appears, correct the amount and press Enter again. Deal and Spin are disabled while editing. Blackjack also has **− / +** buttons; Baccarat and Big Wheel use direct amount entry.

If you cannot cover the selected level's minimum, finish settlement and select a lower level from **Menu**. If your bankroll is **below $1**, use [Start Over](#8-saving-switching-games-and-starting-over).

### 5. Blackjack

For standard card values, outcomes, actions, and payouts, refer to [Wikipedia's Blackjack — Rules of play at casinos](https://en.wikipedia.org/wiki/Blackjack#Rules_of_play_at_casinos). Details can vary by casino and table.

1. Set your amount and choose **Deal**.
2. If insurance or even money is offered, choose from **Insurance $amount / No Thanks** or **Even Money / Keep BJ**.
3. Choose an action shown on screen, such as **Hit**, **Stand**, **Double**, **Split**, or **Surrender**. Only available actions appear as buttons.
4. The dealer plays automatically after you finish all your hands. Read the result and **Round ±$amount** at the bottom, then choose **Next Round** or **Menu**. The round amount is the combined net result of all hands and insurance.

In molsino, you accept or decline the displayed insurance amount rather than enter a separate amount. An `s` in a total such as `18s` marks a soft total. Fractional-cent returns are rounded to the nearest cent, with exact half cents rounded up.

### 6. Baccarat

For card values, extra cards, outcomes, and payouts, refer to [Wikipedia's Baccarat — Punto banco](https://en.wikipedia.org/wiki/Baccarat#Punto_banco). See **Valuation of hands** in the same article for scoring and **Punto banco** for drawing rules and the standard commission game.

On screen, **P** means Player, **B** means Banker, and **T** means Tie. In molsino, select one betting target per round.

1. Select one of **P / B / T**.
2. Click the amount field, enter your amount, confirm with Enter, and choose **Deal**.
3. Wait for automatic dealing and the result display.
4. Read the result, return, and net result, then choose **Next Round** or **Menu**.

In molsino, Banker commission is applied immediately on a win. Profit after commission is rounded to the nearest cent, with exact half cents rounded up. The recent **P B T** history contains up to 20 results. It records which hand won, rather than whether your own bet won, and does not predict or guarantee future results.

### 7. Big Wheel

For standard wagers, winning outcomes, and payouts, refer to [Wikipedia's Big Six wheel — Money wheel](https://en.wikipedia.org/wiki/Big_Six_wheel#Money_wheel). Wheel layouts and payouts vary by version; check the game screen for the area names and payouts used in molsino.

1. Select an area in the list to edit. In a small window, scroll the list to reach the other areas.
2. Click the area-name-and-amount field below, enter an amount, and confirm with Enter. Selecting an area alone does not add a bet.
3. Repeat for other areas if desired. Confirm **0** or choose **Remove** to clear the selected area's bet.
4. Check the **Σ** total. The minimum, maximum, and bankroll limit apply to the **combined total**. An individual area can have as little as $0.01, but the total must meet the level minimum to spin.
5. Choose **Spin**. Bets cannot change during the spin. When it stops, read the winning area under the center pointer, return, and net result.
6. Choose **Next Round** or **Menu**. Next Round keeps the previous bet layout when possible; check the total before spinning again.

On the result screen, **return** is the amount received, and **net result** is the return minus your combined bet.

molsino's left, center, and right segments are a close-up of the winning segment and its neighbors on the same wheel. They are not the last three rounds; read the winner at the center pointer. A separate history keeps up to 20 results and does not predict or guarantee the next result.

### 8. Saving, switching games, and starting over

Game progress and results are saved automatically on your computer. Restarting uses the last saved state. An unfinished round resumes in its game; otherwise the app starts at the menu. Each game's card shoe and recent history survive menu changes and restarts.

Use **Menu** before betting or after the result is fully shown and saved. Wait during a round, result animation, or saving. Hiding does not cancel a round. Unconfirmed amount edits are canceled when hiding or switching to the menu.

To start again from the beginning:

1. Finish the current round's settlement and saving, then return to **Menu**.
2. Choose **Start Over** and read the reset details.
3. Choose **Confirm Reset**. **Cancel** leaves your data unchanged.

Resetting returns the shared bankroll to **$100**, the selected level to **Lv.1**, and the highest bankroll record to **$100**. All games' rounds, shoes, recent history, and bet settings start fresh. Your selected language is retained.

Language and game data are saved. Window position, size, black/white choice, and opacity adjustments are not retained after restarting.

### 9. Troubleshooting

| Situation | What to do |
| --- | --- |
| Window is hidden or game buttons do not respond | Choose **Show / Disable Click-through** from the icon menu. The shortcut can also restore a hidden window. |
| Deal or Spin is disabled | Confirm an amount edit with Enter or cancel with Escape. Check minimum, maximum, and bankroll. In Big Wheel, use the Σ total. Wait if play, card reveals, or saving is underway. |
| Menu is disabled | Wait for the round, result display, and saving to finish. If saving failed, choose **Retry Save**. |
| Entered amount disappeared | Clicking elsewhere or pressing Escape cancels editing. Enter the amount again and confirm with Enter. |
| Amount input error | Use up to two decimal places without `$` or commas, and stay within the limits and bankroll. |
| Bankroll is below the current level's minimum | After settlement, select a lower level from the menu. Below $1, use **Start Over**. |
| Saving failed | Choose **Retry Save** to save the same change again. This does not draw a new round. If you confirm quitting with unsaved changes, those changes are lost and the next launch uses the last saved state. |
| Progress error, connection error, or blank window after restoring | Choose **Quit** in the icon menu and restart the app. Restart for a progress error instead of waiting for automatic recovery. |

If a recovery screen appears at startup, use the options shown. When you choose Restore Backup or Start New Game, the damaged or unsupported original is preserved separately.

- **Retry Loading:** appears when the app cannot read or save the game file. Retry after resolving the access problem. This screen does not offer Restore Backup or Start New Game.
- **Restore Backup:** appears for damaged or unsupported saved data when a valid backup exists. It restores the shared bankroll, level, and all games' rounds, shoes, history, and bet settings to the backup's point in time; recent changes may be missing.
- **Start New Game:** appears for damaged or unsupported saved data. It resets the [same game data as Start Over](#8-saving-switching-games-and-starting-over) to $100 and Lv.1. **This recovery button acts immediately without a separate confirmation screen.** Choose it when you accept losing prior progress and history. Your selected language is retained.
