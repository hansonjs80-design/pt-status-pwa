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

기기별 열 너비 변경은 Chrome과 Playwright가 설치된 환경에서
`node scripts/verify-device-widths.cjs`로 검증합니다. Playwright를 별도 폴더에
설치했다면 `NODE_PATH`를 해당 `node_modules` 경로로 지정합니다.
가상 기록과 임시 프로필 두 개를 사용하며 외부 요청을 차단합니다.
실제 드래그, 브라우저 완전 재실행, 드래그 중 테스트 브라우저 강제 종료,
빠른 저장본·서비스워커 캐시 제거 후 IndexedDB 복원, 여러 창의 복원 충돌을
검사합니다. 이 검사는 실제 운영체제 재부팅을 수행하지 않습니다.
