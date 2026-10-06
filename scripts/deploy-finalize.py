from pathlib import Path
import base64
import subprocess
import sys

ROOT = Path('public')
SOURCE = Path('source-assets/heroes')
ASSETS = ROOT / 'assets'

# Single source-of-truth hero images. They are stored as text in GitHub so the
# repository remains self-contained while preserving binary image quality.
HERO_SOURCES = {
    'hero-flocked-silent-basketball-set.webp': SOURCE / 'hero-flocked-silent-basketball-set.webp.b64',
    'hero-fabric-cover-silent-basketball-set.webp': SOURCE / 'hero-fabric-cover-silent-basketball-set.webp.b64',
    'hero-weighted-flocked-silent-basketball.webp': SOURCE / 'hero-weighted-flocked-silent-basketball.webp.b64',
    'hero-flocked-silent-soccer-ball.webp': SOURCE / 'hero-flocked-silent-soccer-ball.webp.b64',
}

ASSETS.mkdir(parents=True, exist_ok=True)
for output_name, source_path in HERO_SOURCES.items():
    payload = ''.join(source_path.read_text(encoding='utf-8').split())
    output_path = ASSETS / output_name
    output_path.write_bytes(base64.b64decode(payload, validate=True))
    print(f'hero restored: {output_path} ({output_path.stat().st_size} bytes)')

# Apply the product-specific canonical values to homepage, collection page,
# detail pages, translations and product-master.json.
subprocess.run([sys.executable, 'scripts/apply-product-specs.py'], check=True)

# Full-site cleanup for legacy values which are unambiguous. This catches old
# text that may exist outside the known product pages without risking valid
# values shared by other products (e.g. Sizes 3/5/7).
LEGACY_REPLACEMENTS = {
    'Orange / Coffee Brown / Black / Lake Blue': 'Orange / Brown / Black / Aqua Blue',
    'Coffee Brown': 'Brown',
    'Lake Blue': 'Aqua Blue',
    'Black/White / Black/Green / Black/Orange / Black/Gold': 'Black/White / Black/Green / Black/Red / Yellow/Green / Black/Gold',
    'Black/White · Black/Green · Black/Orange · Black/Gold': 'Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold',
    'black/white, black/green, black/orange and black/gold': 'black/white, black/green, black/red, yellow/green and black/gold',
}

text_suffixes = {'.html', '.json', '.js', '.css', '.txt'}
for path in ROOT.rglob('*'):
    if not path.is_file() or path.suffix.lower() not in text_suffixes:
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')
    updated = text
    for old, new in LEGACY_REPLACEMENTS.items():
        updated = updated.replace(old, new)
    if updated != text:
        path.write_text(updated, encoding='utf-8')
        print(f'legacy cleanup: {path}')

# Final deployment assertions. If any old product values return in a future
# edit, deployment fails instead of silently publishing inconsistent specs.
all_text = '\n'.join(
    p.read_text(encoding='utf-8', errors='ignore')
    for p in ROOT.rglob('*')
    if p.is_file() and p.suffix.lower() in text_suffixes
)
for forbidden in ('Coffee Brown', 'Lake Blue', 'Black/Orange'):
    if forbidden in all_text:
        raise SystemExit(f'Legacy product value remains: {forbidden}')

required = (
    'Orange / Blue / Green / Yellow',
    'No. 3 / No. 4 / No. 6 / No. 7',
    'Orange / Brown / Black / Aqua Blue',
    'Black/White / Black/Green / Black/Red / Yellow/Green / Black/Gold',
    '5 colorways',
)
for value in required:
    if value not in all_text:
        raise SystemExit(f'Required canonical product value missing: {value}')

for output_name in HERO_SOURCES:
    p = ASSETS / output_name
    if not p.exists() or p.stat().st_size < 10000:
        raise SystemExit(f'Hero image invalid or too small: {p}')

print('FINALIZE PASS: staged hero images restored; product specs synchronized; legacy values cleared.')
