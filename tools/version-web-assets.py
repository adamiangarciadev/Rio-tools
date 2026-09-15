"""Fingerprint local CSS/JS assets for the static GitHub Pages preview."""
from pathlib import Path
import re
import hashlib

for page in [Path('index.html'), *Path('apps').rglob('*.html')]:
    source = page.read_text(encoding='utf-8-sig')
    def version(match):
        path = match[2].split('?')[0]
        if path.startswith(('http', '//')):
            return match[0]
        target = page.parent / path
        if not target.is_file() or target.suffix not in ('.css', '.js'):
            return match[0]
        digest = hashlib.sha256(target.read_bytes()).hexdigest()[:10]
        return match[1] + path + '?v=' + digest + match[3]
    page.write_text(re.sub(r'((?:href|src)=")([^"]+)(")', version, source), encoding='utf-8')
