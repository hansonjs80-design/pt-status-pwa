# 코드 구조

빌드 단계 없이 `index.html`의 일반 스크립트 순서대로 실행합니다. 기능 파일은
클래스 메서드를 정의하고, `app.js`가 앱 생성 전에 그 메서드를 `PTApp.prototype`에
설치합니다. 각 기능의 `this`는 동일한 `PTApp` 인스턴스입니다. 기능 파일을 별도로
생성하거나 상태를 복제하지 않습니다. 전역 상수는 메서드 실행 시 참조합니다.

| 파일 | 담당 영역 |
| --- | --- |
| `app.js` | 앱 초기화, 이벤트 연결, 데이터·편집 이력, 표 렌더링과 탐색 |
| `history-search.js` | 환자 이력 검색과 기록 적용 |
| `table-formatting.js` | 글자·배경·서식과 색상 도구 |
| `summary.js` | 일일 현황 집계와 표시 |
| `cell-input-tools.js` | 셀 입력 보조 도구 |
| `device-layout.js` | 기기별 열 너비, 현황창·도구 모음 접기와 저장·복원 |
| `document-tools.js` | 인쇄 미리보기, CSV 내보내기, 백업·복원 |
| `cloud-sync.js` | 클라우드 연결, 실시간 통신, 기록·프리셋 병합과 동기화 |
| `context-menu.js` | 우클릭 메뉴, 모바일 길게 터치, 메뉴 작업 실행 |
| `preset-manager.js` | 빠른 입력 관리, 목록 편집·정렬·숨김과 관리 창 |
| `autocomplete.js` | 자동완성 검색·후보 표시·선택과 입력 문구 수정 |
| `cell-editor.js` | 네이티브 셀 편집, 입력·IME·확정·포커스 처리 |
| `sheet-selection.js` | 셀·행·열·범위 선택, 헤더 강조와 정렬 |
| `sheet-actions.js` | 표 복사·잘라내기·붙여넣기, 행 추가·삭제와 내용 지우기 |
| `sheet-keyboard.js` | 표 키보드 단축키, 선택 이동과 이력 적용 단축키 |
| `column-settings.js` | 열 기본 서식 설정 창, 저장·검증·공유 동기화 |
| `local-tools.js` | 기기 저장소와 로컬 도구 초기화 |

기능 파일은 `index.html`에서 `app.js`보다 먼저 로드하고, `app.js`의 기능 설치
목록에 등록합니다. 같은 이름의 메서드를 여러 기능에 정의하지 않습니다.
`local-tools.js`는 앱 이후에 로드하는 별도 초기화 도구입니다.

새 파일을 추가하면 `sw.js`의 오프라인 캐시 목록, 캐시 버전,
`tests/helpers/load-app-source.cjs`의 로딩 순서도 함께 갱신합니다.
`tests/feature-modules.test.cjs`가 브라우저와 테스트의 로딩 순서, 캐시 누락,
기능 간 메서드 충돌과 설치 상태를 검사합니다.

검증: `node --test tests/*.test.cjs`, `git diff --check`.
실제 클라우드 데이터는 테스트에 사용하지 않습니다.

브라우저 검증은 가상 기록으로 진행합니다. 검색창 Enter 후 이전 내역 마지막 행 선택, 현재 적용 대상의 배경·테두리·화면 위치, 복사·붙여넣기, 날짜 간 열 서식을 확인합니다. 실제 데이터 작업은 `AGENTS.md`의 백업 규칙을 따릅니다.
