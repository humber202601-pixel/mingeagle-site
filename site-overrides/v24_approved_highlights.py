from pathlib import Path
import re, sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'public')

HIGHLIGHTS = {
    'silent-basketball.html': ('assets/product1-highlights-v24.webp', 'Flocked Silent Basketball Set — approved MING EAGLE product highlights'),
    'fabric-silent-basketball.html': ('assets/product2-highlights-v24.webp', 'Fabric-Cover Silent Basketball Set — approved MING EAGLE product highlights'),
    'weighted-flocked-basketball.html': ('assets/product3-highlights-v24.webp', 'Weighted Flocked Silent Basketball — approved MING EAGLE product highlights'),
    'silent-soccer.html': ('assets/product4-highlights-v24.webp', 'Flocked Silent Soccer Ball — approved MING EAGLE product highlights'),
}

# Replace only the image gallery inside REAL PRODUCT HIGHLIGHTS with the four user-approved designed images.
# Keep the surrounding specifications, copy, selling-point cards and CTAs unchanged.
for filename, (src, alt) in HIGHLIGHTS.items():
    path = root / filename
    text = path.read_text(encoding='utf-8')
    pattern = re.compile(r'<div class="realPhotoGrid">.*?<div class="sellingPointGrid">', re.S)
    replacement = f'<div class="approvedHighlightImage"><img src="{src}" alt="{alt}" loading="eager" decoding="async"></div><div class="sellingPointGrid">'
    text, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise SystemExit(f'V24 highlight gallery marker missing or ambiguous: {filename} ({count})')
    path.write_text(text, encoding='utf-8')


def apply(pathname, replacements):
    path = root / pathname
    text = path.read_text(encoding='utf-8')
    for old, new in replacements:
        text = text.replace(old, new)
    path.write_text(text, encoding='utf-8')

# Product cards: current confirmed master data.
CARD_FIXES = [
    ('<span class="tag" data-i18n="p1.tags.2">Orange / Blue</span>', '<span class="tag" data-i18n="p1.tags.2">Orange / Blue / Green / Yellow</span>'),
    ('<span class="tag" data-i18n="p3.tags.1">Sizes 3 / 5 / 7</span>', '<span class="tag" data-i18n="p3.tags.1">Sizes 3 / 4 / 6 / 7</span>'),
    ('<span class="tag" data-i18n="p3.tags.2">Orange / Brown / Black</span>', '<span class="tag" data-i18n="p3.tags.2">Orange / Coffee Brown / Black / Lake Blue</span>'),
    ('<span class="tag" data-i18n="p4.tags.2">4 colorways</span>', '<span class="tag" data-i18n="p4.tags.2">5 colorways</span>'),
]
for f in ['index.html', 'products.html']:
    apply(f, CARD_FIXES)

# Product 1 detail page.
apply('silent-basketball.html', [
    ('<span class="tag" data-i18n="p1.tags.2">Orange / Blue</span>', '<span class="tag" data-i18n="p1.tags.2">Orange / Blue / Green / Yellow</span>'),
    ('No. 3 / No. 5 / No. 7 · Orange / Blue', 'No. 3 / No. 5 / No. 7 · Orange / Blue / Green / Yellow'),
    ('<span data-i18n="p1.spec3">Orange / Blue</span>', '<span data-i18n="p1.spec2">Orange / Blue / Green / Yellow</span>'),
    ('<span>Orange / Blue.</span>', '<span>Orange / Blue / Green / Yellow.</span>'),
    ('<span>Orange / Blue</span>', '<span>Orange / Blue / Green / Yellow</span>'),
])

# Product 3 detail page — confirmed sizes 3 / 4 / 6 / 7 and four confirmed colors.
apply('weighted-flocked-basketball.html', [
    ('<span class="tag" data-i18n="p3.tags.1">Sizes 3 / 5 / 7</span>', '<span class="tag" data-i18n="p3.tags.1">Sizes 3 / 4 / 6 / 7</span>'),
    ('<span class="tag" data-i18n="p3.tags.2">Orange / Brown / Black</span>', '<span class="tag" data-i18n="p3.tags.2">Orange / Coffee Brown / Black / Lake Blue</span>'),
    ('<span data-i18n="p3.spec1">No. 3 / No. 5 / No. 7</span>', '<span data-i18n="p3.spec1">No. 3 / No. 4 / No. 6 / No. 7</span>'),
    ('<span data-i18n="p3.spec2">Orange / Brown / Black</span>', '<span data-i18n="p3.spec2">Orange / Coffee Brown / Black / Lake Blue</span>'),
    ('No. 3 / No. 5 / No. 7', 'No. 3 / No. 4 / No. 6 / No. 7'),
    ('Sizes 3 / 5 / 7', 'Sizes 3 / 4 / 6 / 7'),
    ('Sizes 3/5/7', 'Sizes 3/4/6/7'),
    ('Orange / Brown / Black', 'Orange / Coffee Brown / Black / Lake Blue'),
    ('Three color choices: orange, brown and black.', 'Four color choices: orange, coffee brown, black and lake blue.'),
])

# Product 4 detail page — size 5 only, five confirmed colors.
apply('silent-soccer.html', [
    ('<span class="tag" data-i18n="p4.tags.2">4 colorways</span>', '<span class="tag" data-i18n="p4.tags.2">5 colorways</span>'),
    ('Black/White · Black/Green · Black/Orange · Black/Gold', 'Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold'),
    ('Four website colorways', 'Five website colorways'),
    ('Black/White, Black/Green, Black/Orange and Black/Gold', 'Black/White, Black/Green, Black/Red, Yellow/Green and Black/Gold'),
    ('Available in four colorways.', 'Available in five colorways.'),
    ('Four colorways', 'Five colorways'),
    ('4 colorways', '5 colorways'),
])

# Inquiry form product summaries.
apply('inquiry.html', [
    ('Sizes 3 / 5 / 7 · Orange / Blue</small>', 'Sizes 3 / 5 / 7 · Orange / Blue / Green / Yellow</small>'),
    ('Weighted Flocked Silent Basketball</b><small>Sizes 3 / 5 / 7 · Training use</small>', 'Weighted Flocked Silent Basketball</b><small>Sizes 3 / 4 / 6 / 7 · Orange / Coffee Brown / Black / Lake Blue</small>'),
    ('Flocked Silent Soccer Ball</b><small>Size 5 · Four colorways</small>', 'Flocked Silent Soccer Ball</b><small>Size 5 only · 5 colorways</small>'),
])

# Translation data overrides visible HTML after page load, so synchronize these keys in every language block.
def patch_translation_file(name):
    path = root / name
    if not path.exists():
        return
    text = path.read_text(encoding='utf-8')
    keyed = {
        'p1.tags': 'Sizes 3 / 5 / 7|Orange / Blue / Green / Yellow|Adhesive hoop|Soft flocked feel',
        'p1.tags.1': 'Sizes 3 / 5 / 7',
        'p1.tags.2': 'Orange / Blue / Green / Yellow',
        'p1.spec1': 'No. 3 / 5 / 7',
        'p1.spec2': 'Orange / Blue / Green / Yellow',
        'p1.g3': 'Available in Orange, Blue, Green and Yellow, in sizes 3 / 5 / 7.',
        'p3.tags': 'Sizes 3 / 4 / 6 / 7|Orange / Coffee Brown / Black / Lake Blue|Weighted feel|Training use',
        'p3.tags.1': 'Sizes 3 / 4 / 6 / 7',
        'p3.tags.2': 'Orange / Coffee Brown / Black / Lake Blue',
        'p3.spec1': 'No. 3 / 4 / 6 / 7',
        'p3.spec2': 'Orange / Coffee Brown / Black / Lake Blue',
        'p3.g2': 'Four color choices: orange, coffee brown, black and lake blue.',
        'p4.tags': 'Size 5|5 colorways|Indoor play|Soft flocked surface',
        'p4.tags.1': 'Size 5',
        'p4.tags.2': '5 colorways',
        'p4.spec1': 'No. 5',
        'p4.spec2': 'Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold',
        'p4.g2': 'Five colorways shown in the updated product line.',
    }
    for key, value in keyed.items():
        pattern = re.compile(r'("' + re.escape(key) + r'"\s*:\s*")[^"]*(")')
        text = pattern.sub(lambda m, v=value: m.group(1) + v + m.group(2), text)
    path.write_text(text, encoding='utf-8')

patch_translation_file('site.js')
patch_translation_file('i18n.json')

# Final sanity checks for known stale values.
checks = {
    'index.html': ['data-i18n="p1.tags.2">Orange / Blue</span>', 'data-i18n="p3.tags.1">Sizes 3 / 5 / 7</span>', 'data-i18n="p3.tags.2">Orange / Brown / Black</span>', 'data-i18n="p4.tags.2">4 colorways</span>'],
    'products.html': ['data-i18n="p1.tags.2">Orange / Blue</span>', 'data-i18n="p3.tags.1">Sizes 3 / 5 / 7</span>', 'data-i18n="p3.tags.2">Orange / Brown / Black</span>', 'data-i18n="p4.tags.2">4 colorways</span>'],
    'weighted-flocked-basketball.html': ['No. 3 / No. 5 / No. 7', 'Orange / Brown / Black'],
    'silent-soccer.html': ['4 colorways', 'Four colorways', 'Black/Orange'],
    'inquiry.html': ['Weighted Flocked Silent Basketball</b><small>Sizes 3 / 5 / 7', 'Flocked Silent Soccer Ball</b><small>Size 5 · Four colorways'],
}
for filename, bads in checks.items():
    text = (root / filename).read_text(encoding='utf-8')
    found = [bad for bad in bads if bad in text]
    if found:
        raise SystemExit(f'V24 stale master data remains in {filename}: {found}')

for filename in HIGHLIGHTS:
    text = (root / filename).read_text(encoding='utf-8')
    if 'approvedHighlightImage' not in text:
        raise SystemExit(f'V24 approved highlight image missing: {filename}')
    if '<div class="realPhotoGrid">' in text:
        raise SystemExit(f'V24 old raw-photo grid still present: {filename}')

print('V24 approved highlights + final product master data applied.')
