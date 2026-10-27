"""Build a portable Windows package using only Python's standard library."""
import argparse
import hashlib
import pathlib
import shutil
import urllib.request
import zipfile

VERSION = '45.0.0'
EXPECTED_SHA256 = 'ae53887a23bb640369c93dbd38c408a2af5c0deb86f2fa76c6c244cb444b7f47'
ROOT = pathlib.Path(__file__).resolve().parent

def read(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'MusicOne-Windows-build'}), timeout=120)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / 'dist' / 'MusicOne-Windows')
    parser.add_argument('--runtime-archive',type=pathlib.Path,help='Use an already downloaded official runtime archive')
    args = parser.parse_args()
    target = args.output.resolve()
    if target.exists():
        raise SystemExit('Output directory already exists; choose a new --output directory.')
    name = f'electron-v{VERSION}-win32-x64.zip'
    cache = ROOT / '.build-cache'
    if not args.runtime_archive:cache.mkdir(exist_ok=True)
    archive = args.runtime_archive.resolve() if args.runtime_archive else cache / name
    base = f'https://github.com/electron/electron/releases/download/v{VERSION}/'
    if not archive.exists():
        with read(base + name) as response, archive.open('wb') as out:
            while chunk := response.read(1024 * 1024):
                out.write(chunk)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != EXPECTED_SHA256:
        raise SystemExit('Runtime checksum mismatch. Delete the cached archive and retry.')
    with zipfile.ZipFile(archive) as z:
        z.extractall(target)
    (target / 'electron.exe').rename(target / 'MusicOne.exe')
    app = target / 'resources' / 'app'
    app.mkdir(parents=True, exist_ok=True)
    for name in ['package.json','main.js','preload.js','renderer.js','services.js','playback.js','media.js','palette.js','diagnostics.js','lyric-parser.js','visuals.js','appearance.js','appearance-client.js','lyrics-layout.js','volume-menu.js','index.html','style.css','theme.css','appearance.css','player-layout.css','README.md','LICENSE','LICENSE-MusicOne','NOTICE.md']:
        shutil.copy2(ROOT / name, app / name)
    shutil.copytree(ROOT / 'assets', app / 'assets')
    shutil.copy2(ROOT / 'README.md', target / '使用说明.md')
    shutil.copy2(ROOT / 'LICENSE-MusicOne', target / 'LICENSE-MusicOne')
    shutil.copy2(ROOT / 'LICENSE', target / 'LICENSE-Application')
    shutil.copytree(ROOT / 'docs',target / 'docs')
    shutil.copy2(ROOT / 'NOTICE.md',target / 'NOTICE.md')
    for name in ['更新说明.md','验证记录.md']:
        shutil.copy2(ROOT / name,target / name)
    print(target)

if __name__ == '__main__':
    main()
