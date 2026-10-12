# 배포 확인

`git push origin main`이 성공해도 Vercel 자동 배포가 생성되지 않을 수 있습니다.
수정 반영을 완료했다고 보고하기 전에 아래 명령으로 실제 서비스 파일을 확인합니다.

```sh
node scripts/verify-production-release.mjs
```

현재 체크아웃과 서비스 워커에 등록된 모든 배포 파일의 SHA-256을 비교합니다.
불일치하면 Vercel에서 프로젝트 `pt-status-pwa`의 최신 `main` 커밋을 배포하고
명령을 다시 실행합니다. 검사 자체는 서버·브라우저 저장소·Supabase 데이터를 변경하지 않습니다.
