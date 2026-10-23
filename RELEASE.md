# 배포 확인

릴리스 버전은 다음 명령으로 올립니다. `app-updates.js`의 표시 버전,
`version.json`의 감지 버전, `sw.js`의 설치 캐시 버전을 함께 맞춥니다.

```sh
node scripts/set-release-version.mjs v457
node --test tests/*.test.cjs
```

버전 불일치는 테스트와 아래 배포 검사에서 실패로 처리합니다.
업데이트 로직은 `app-updates.js`에서 관리합니다. 새 파일 설치가 끝나고
사용자가 업데이트를 선택하면, 편집 내용과 로컬 저장 완료를 기다린 후 새 버전으로 전환합니다.
설정의 업데이트 확인 버튼에서 확인 실패 또는 새 버전 준비 상태를 볼 수 있습니다.

`git push origin main`이 성공해도 Vercel 자동 배포가 생성되지 않을 수 있습니다.
수정 반영을 완료했다고 보고하기 전에 아래 명령으로 실제 서비스 파일을 확인합니다.

```sh
node scripts/verify-production-release.mjs
```

현재 체크아웃과 서비스 워커에 등록된 모든 배포 파일의 SHA-256을 비교합니다.
불일치하면 Vercel에서 프로젝트 `pt-status-pwa`의 최신 `main` 커밋을 배포하고
명령을 다시 실행합니다. 검사 자체는 서버·브라우저 저장소·Supabase 데이터를 변경하지 않습니다.

기기별 열 너비·로컬 백업·자동 PDF 설정은 Chrome, Edge와 Playwright가 설치된 환경에서
`node scripts/verify-device-widths.cjs`로 검증합니다. Playwright를 별도 폴더에
설치했다면 `NODE_PATH`를 해당 `node_modules` 경로로 지정합니다.
가상 기록과 임시 프로필 두 개를 사용하며 외부 요청과 서비스워커를 차단합니다.
Chrome과 Edge에서 실제 드래그·설정 입력, 완전 재실행, 테스트 브라우저와
자식 프로세스 강제 종료, 빠른 저장본 제거 후 IndexedDB 복원, 폴더 핸들 복원,
여러 창의 설정 저장 충돌을 검사합니다. 저장소 초기 연결 실패, 저장 실패,
빠른 저장소 용량 부족, 이전 durability API, Windows 플랫폼은 오류 주입으로
검증합니다. 실제 운영체제 재부팅이나 Windows 실기기 검사는 아닙니다.
다른 조합은 `PT_TEST_BROWSER_CHANNELS=chrome,chrome`처럼 지정할 수 있습니다.

설정 복원과 저장 실패는 화면 상단 및 설정 창에 표시되며 자동 재시도합니다.
읽기에 실패한 저장본에는 기본값을 덮어쓰지 않습니다. 이미 읽힌 열 너비는
먼저 표시하고, 다른 부가 기능의 복원 실패가 백업·PDF 설정 화면을 막지 않습니다.
브라우저가 사이트 데이터를 모두 삭제하는 정책이나 별도 프로필·주소의 저장소는
앱에서 동일한 기기 저장소로 복원할 수 없으므로 해당 환경에서는 구분해 확인합니다.
