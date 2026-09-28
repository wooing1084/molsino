# 로컬 세션 저장

**목적:** 저장 계층의 앱 공통 책임과 블랙잭 이전 경계를 안내한다.

**요약:** AtomicSessionRepository가 원자 파일 저장을, AppSessionRepository가 v4 검증·v1/v2/v3 이전을 맡는다. 기존 SessionRepository는 v1 형식 검증과 읽기에 사용한다.

## 목차

- [현재 저장 경계](#현재-저장-경계)

## 현재 저장 경계

- `atomic-session-repository.ts`: 검증된 primary/backup, 같은 폴더의 임시 파일·sync·rename, 복구 전 원본 보존.
- `app-session-repository.ts`: 공용 wallet·screen·게임 상태·잠금·revision의 v4 스키마, 새 파일 우선 로드, 기존 블랙잭 데이터와 v2/v3 공용 세션 이전.
- `session-repository.ts`: 기존 v1 스키마와 블랙잭 상태 검증. 구 파일은 이전 후에도 변경하지 않는다.

상세 계약은 [메인 기술 설계 §9](../../../docs/main/technical-design.md#9-여러-게임과-공용-잔액의-신규-계약)를 따른다.
