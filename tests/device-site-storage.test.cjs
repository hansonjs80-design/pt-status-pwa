const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');

test('browser retention repair preserves unrelated preferences, verifies backup, and refuses live browsers', () => {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-B','-c', `
import copy, importlib.util, json, pathlib, tempfile
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('repair', 'scripts/device-site-storage.py')
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
data = {'profile': {'default_content_setting_values': {'cookies': 4}, 'content_settings': {'exceptions': {'cookies': {'https://unrelated.test,*': {'setting': 4}}}}}, 'other': {'untouched': True}}
original = copy.deepcopy(data)
assert r.retention(data)['defaultSiteData'] == 'delete-on-exit'
r.allow_pt(data)
assert r.retention(data)['ptSiteException'] == 'allow'
removed = copy.deepcopy(data)
del removed['profile']['content_settings']['exceptions']['cookies'][r.PATTERN]
assert removed == original
assert 'Microsoft/Edge/User Data' in str(r.browser_roots('win32', '/home/virtual', {'LOCALAPPDATA':'/local'})['Edge'])
assert 'Google/Chrome' in str(r.browser_roots('darwin', '/home/virtual')['Chrome'])
with tempfile.TemporaryDirectory() as tmp:
    root = pathlib.Path(tmp); file = root / 'Default' / 'Preferences'; file.parent.mkdir()
    before = json.dumps(original).encode(); after = json.dumps(data).encode(); file.write_bytes(before)
    r.write_verified(file, before, after, root / 'backups', 'Chrome')
    assert file.read_bytes() == after
    assert (root / 'backups/Chrome/Default/Preferences').read_bytes() == before
    try:
        r.write_verified(file, before, after, root / 'more', 'Chrome')
        raise AssertionError('stale write allowed')
    except RuntimeError: pass
    assert not (root / 'more').exists()
for platform, output in [('darwin','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), ('win32','"msedge.exe","123","Console","1","123 K"')]:
    with patch.object(r.subprocess, 'run') as run:
        run.return_value.stdout = output
        try:
            r.ensure_browsers_closed(platform)
            raise AssertionError('live browser allowed')
        except RuntimeError: pass
with patch.object(r.subprocess, 'run') as run:
    run.return_value.stdout = '/bin/bash'
    r.ensure_browsers_closed('darwin')
print('browser retention repair checks passed')
`], {cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
