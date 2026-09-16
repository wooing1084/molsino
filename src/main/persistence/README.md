# Persistence boundary

SessionRepository가 들어갈 위치입니다. 초기 세팅은 게임을 저장하지 않습니다.
정수 센트, versioned snapshot, single writer, 원자 교체 및 복구 계약은 기술 설계서 7절을 따릅니다.
