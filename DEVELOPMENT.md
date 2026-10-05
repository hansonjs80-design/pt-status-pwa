# 코드 구성과 검증

이 앱은 빌드 과정 없이 정적 HTML과 JavaScript로 실행합니다.

- `app.js`: 앱 초기화, 일일 테이블, 편집·키보드·클립보드, 통계와 동기화
- `history-search.js`: 환자 검색창, 이전 내역, 적용 대상 표시와 검색 테이블
- `table-formatting.js`: 열 기본 서식, 개별 셀 서식, 글자 크기·굵기·색 메뉴
- `local-tools.js`: 기기별 저장 및 빠른 입력 도구

`index.html`은 기능 파일을 먼저 로드한 뒤 `app.js`를 로드합니다. 기능 클래스의 메서드는 앱 시작 전에 `PTApp.prototype`에 연결하며, 모든 기능은 동일한 앱 상태와 기존 이벤트 흐름을 사용합니다. 클래스의 `constructor`는 복사하지 않습니다.

파일을 추가하거나 로드 순서를 바꾸면 `index.html`, `sw.js`의 캐시 목록, `tests/helpers/load-app-source.cjs`를 함께 수정합니다. 배포마다 서비스워커 캐시 버전을 올려 HTML과 스크립트가 같은 버전으로 설치되게 합니다.

검증 명령:

```bash
node --check app.js
node --check history-search.js
node --check table-formatting.js
node --test tests/*.test.cjs
```

브라우저 검증은 가상 기록으로 진행합니다. 검색창 Enter 후 이전 내역 마지막 행 선택, 현재 적용 대상의 배경·테두리·화면 위치, 복사·붙여넣기, 날짜 간 열 서식을 확인합니다. 실제 데이터 작업은 `AGENTS.md`의 백업 규칙을 따릅니다.
