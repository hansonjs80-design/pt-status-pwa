#!/usr/bin/env python3
"""Inspect Chrome/Edge retention; --apply adds only the PT site exception.

No browser databases, records, credentials, or global deletion preferences are
read or changed. Apply requires both browsers to be fully closed. Full private
Preferences backups stay outside the repository and must never be shared.
"""
import argparse
import csv
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ORIGIN = 'https://pt-status-pwa.vercel.app'
PATTERN = ORIGIN + ',*'


def browser_roots(platform=None, home=None, environ=None):
    platform = platform or sys.platform
    home = Path(home or Path.home())
    environ = os.environ if environ is None else environ
    if platform == 'darwin':
        base = home / 'Library/Application Support'
        return {'Chrome': base / 'Google/Chrome', 'Edge': base / 'Microsoft Edge'}
    if platform == 'win32':
        base = Path(environ.get('LOCALAPPDATA', home / 'AppData/Local'))
        return {'Chrome': base / 'Google/Chrome/User Data', 'Edge': base / 'Microsoft/Edge/User Data'}
    raise RuntimeError('이 도구는 macOS와 Windows의 Chrome·Edge를 지원합니다.')


def profiles(roots):
    for browser, root in roots.items():
        for file in sorted(root.glob('*/Preferences')):
            if file.parent.name in ('System Profile', 'Guest Profile') or file.is_symlink():
                continue
            yield browser, file


def retention(data):
    profile = data.get('profile', {})
    default = profile.get('default_content_setting_values', {}).get('cookies', 1)
    exceptions = profile.get('content_settings', {}).get('exceptions', {}).get('cookies', {})
    exact = exceptions.get(PATTERN, {}).get('setting')
    # Always add an explicit site exception on apply; parent-domain rules and
    # Edge's separate clear-on-exit policy cannot be inferred from defaults.
    return {'defaultSiteData': {1: 'allow', 2: 'block', 4: 'delete-on-exit'}.get(default, 'unknown'),
            'ptSiteException': {1: 'allow', 2: 'block', 4: 'delete-on-exit'}.get(exact, 'not-set')}


def allow_pt(data):
    profile = data.setdefault('profile', {})
    cookies = profile.setdefault('content_settings', {}).setdefault('exceptions', {}).setdefault('cookies', {})
    entry = cookies.setdefault(PATTERN, {})
    entry.update(setting=1, last_modified=str(time.time_ns() // 1000 + 11644473600000000))


def ensure_browsers_closed(platform=None):
    platform = platform or sys.platform
    if platform == 'win32':
        result = subprocess.run(['tasklist', '/FO', 'CSV', '/NH'], capture_output=True, text=True, check=True)
        running = {row[0].lower() for row in csv.reader(io.StringIO(result.stdout)) if row}
        active = running.intersection({'chrome.exe', 'msedge.exe'})
    else:
        result = subprocess.run(['ps', '-A', '-o', 'comm='], capture_output=True, text=True, check=True)
        active = {line for line in result.stdout.splitlines()
                  if any(name in line for name in ('Google Chrome', 'Microsoft Edge'))}
    if active:
        raise RuntimeError('Chrome·Edge가 실행 중입니다. 작업을 저장하고 두 브라우저와 설치한 앱을 완전히 종료한 뒤 --apply를 다시 실행하세요. 설정 파일은 변경하지 않았습니다.')


def write_verified(file, original, updated, backup_dir, browser):
    # Abort rather than overwrite a browser that wrote Preferences since reading.
    if file.read_bytes() != original:
        raise RuntimeError('브라우저 설정 파일이 변경되어 중단했습니다: ' + str(file))
    target = backup_dir / browser / file.parent.name
    target.mkdir(parents=True, mode=0o700)
    backup = target / 'Preferences'
    with backup.open('xb') as stream:
        os.chmod(backup, 0o600)
        stream.write(original)
        stream.flush()
        os.fsync(stream.fileno())
    if backup.read_bytes() != original:
        raise RuntimeError('설정 원본 백업 검증 실패')
    fd, temporary = tempfile.mkstemp(prefix='.pt-preferences-', dir=file.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            os.chmod(temporary, file.stat().st_mode & 0o777)
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
        if file.read_bytes() != original:
            raise RuntimeError('적용 직전 브라우저 설정이 변경되어 중단했습니다.')
        os.replace(temporary, file)
        if file.read_bytes() != updated:
            raise RuntimeError('설정 저장 검증 실패. 백업 위치: ' + str(backup))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='브라우저 종료 확인·백업 후 PT 사이트의 저장 허용 예외 등록')
    args = parser.parse_args()
    candidates = []
    for browser, file in profiles(browser_roots()):
        original = file.read_bytes()
        data = json.loads(original)
        status = retention(data)
        print(json.dumps({'browser': browser, 'profile': file.parent.name, **status}, ensure_ascii=False))
        if args.apply and status['ptSiteException'] != 'allow':
            allow_pt(data)
            candidates.append((browser, file, original, json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()))
    if not args.apply:
        print('읽기 전용 점검 완료. 적용: 두 브라우저를 완전히 종료한 뒤 같은 명령에 --apply 추가.')
        return
    if not candidates:
        print('모든 프로필에 PT현황 저장 허용 예외가 있습니다.')
        return
    ensure_browsers_closed()
    base = Path.home() / '.pt-status-browser-backups'
    base.mkdir(mode=0o700, exist_ok=True)
    backup_dir = Path(tempfile.mkdtemp(prefix=time.strftime('%Y%m%d-%H%M%S-'), dir=base))
    for browser, file, original, updated in candidates:
        ensure_browsers_closed()
        write_verified(file, original, updated, backup_dir, browser)
        print(f'{browser} / {file.parent.name}: PT현황 저장 허용 적용·검증 완료')
    print('원본 백업 (공유하지 마세요): ' + str(backup_dir))
    print('Edge의 별도 종료 시 삭제 목록을 사용한다면 쿠키 및 기타 사이트 데이터 → 지우지 않음에도 ' + ORIGIN + ' 등록이 필요합니다.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
