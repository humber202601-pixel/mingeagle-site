from pathlib import Path
import json
import re

ROOT = Path('public')

# Canonical product data confirmed from the latest approved MING EAGLE product artworks.
MASTER = {
    'p1': {
        'name': 'Flocked Silent Basketball Set',
        'sizes_tag': 'Sizes 3 / 5 / 7',
        'sizes': 'No. 3 / No. 5 / No. 7',
        'colors': 'Orange / Blue / Green / Yellow',
        'colorways': '4 colors',
        'hero': 'assets/hero-flocked-silent-basketball-set.webp',
    },
    'p2': {
        'name': 'Fabric-Cover Silent Basketball Set',
        'sizes_tag': 'Sizes 3 / 5 / 7',
        'sizes': 'No. 3 / No. 5 / No. 7',
        'colors': 'Orange / Green',
        'colorways': '2 colors',
        'hero': 'assets/hero-fabric-cover-silent-basketball-set.webp',
    },
    'p3': {
        'name': 'Weighted Flocked Silent Basketball',
        'sizes_tag': 'Sizes 3 / 4 / 6 / 7',
        'sizes': 'No. 3 / No. 4 / No. 6 / No. 7',
        'colors': 'Orange / Brown / Black / Aqua Blue',
        'colorways': '4 colors',
        'hero': 'assets/hero-weighted-flocked-silent-basketball.webp',
    },
    'p4': {
        'name': 'Flocked Silent Soccer Ball',
        'sizes_tag': 'Size 5',
        'sizes': 'No. 5',
        'colors': 'Black/White / Black/Green / Black/Red / Yellow/Green / Black/Gold',
        'colors_dots': 'Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold',
        'colorways': '5 colorways',
        'hero': 'assets/hero-flocked-silent-soccer-ball.webp',
    },
}


def replace_in(path, pairs):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    old = text
    for a, b in pairs:
        text = text.replace(a, b)
    p.write_text(text, encoding='utf-8')
    print(f'{path}:', 'updated' if text != old else 'no changes needed')


# Homepage product collection: 2 columns x 2 rows, new approved hero images, canonical specs.
replace_in('index.html', [
    ('<link href="styles.css" rel="stylesheet"/>', '<link href="styles.css" rel="stylesheet"/><link href="product-grid-2x2.css" rel="stylesheet"/>'),
    ('<div class="grid4">', '<div class="grid4 productGrid2">'),
    ('src="assets/silent-set.jpg"', f'src="{MASTER["p1"]["hero"]}"'),
    ('src="assets/fabric-ball.jpg"', f'src="{MASTER["p2"]["hero"]}"'),
    ('src="assets/flocked-ball.jpg"', f'src="{MASTER["p3"]["hero"]}"'),
    ('src="assets/flocked-soccer.jpg"', f'src="{MASTER["p4"]["hero"]}"'),
    ('<span class="tag" data-i18n="p1.tags.2">Orange / Blue</span>', '<span class="tag" data-i18n="p1.tags.2">Orange / Blue / Green / Yellow</span>'),
    ('<span class="tag" data-i18n="p3.tags.1">Sizes 3 / 5 / 7</span>', '<span class="tag" data-i18n="p3.tags.1">Sizes 3 / 4 / 6 / 7</span>'),
    ('<span class="tag" data-i18n="p3.tags.2">Orange / Brown / Black</span>', '<span class="tag" data-i18n="p3.tags.2">Orange / Brown / Black / Aqua Blue</span>'),
    ('<span class="tag" data-i18n="p4.tags.2">4 colorways</span>', '<span class="tag" data-i18n="p4.tags.2">5 colorways</span>'),
])

# Products page: same 2 x 2 presentation and canonical product data.
replace_in('products.html', [
    ('<link href="styles.css" rel="stylesheet"/>', '<link href="styles.css" rel="stylesheet"/><link href="product-grid-2x2.css" rel="stylesheet"/>'),
    ('<div class="grid4">', '<div class="grid4 productGrid2">'),
    ('src="assets/silent-set.jpg"', f'src="{MASTER["p1"]["hero"]}"'),
    ('src="assets/fabric-ball.jpg"', f'src="{MASTER["p2"]["hero"]}"'),
    ('src="assets/flocked-ball.jpg"', f'src="{MASTER["p3"]["hero"]}"'),
    ('src="assets/flocked-soccer.jpg"', f'src="{MASTER["p4"]["hero"]}"'),
    ('<span class="tag" data-i18n="p1.tags.2">Orange / Blue</span>', '<span class="tag" data-i18n="p1.tags.2">Orange / Blue / Green / Yellow</span>'),
    ('<span class="tag" data-i18n="p3.tags.1">Sizes 3 / 5 / 7</span>', '<span class="tag" data-i18n="p3.tags.1">Sizes 3 / 4 / 6 / 7</span>'),
    ('<span class="tag" data-i18n="p3.tags.2">Orange / Brown / Black</span>', '<span class="tag" data-i18n="p3.tags.2">Orange / Brown / Black / Aqua Blue</span>'),
    ('<span class="tag" data-i18n="p4.tags.2">4 colorways</span>', '<span class="tag" data-i18n="p4.tags.2">5 colorways</span>'),
    ('Orange / Coffee Brown / Black / Lake Blue', 'Orange / Brown / Black / Aqua Blue'),
])

# Product 1: flocked silent basketball set.
replace_in('silent-basketball.html', [
    ('src="assets/silent-set.jpg"', f'src="{MASTER["p1"]["hero"]}"'),
    ('>Orange / Blue</span>', '>Orange / Blue / Green / Yellow</span>'),
    ('· Orange / Blue</span>', '· Orange / Blue / Green / Yellow</span>'),
    ('Orange / Blue.</span>', 'Orange / Blue / Green / Yellow.</span>'),
    ('Website colors</b><span>Orange / Blue.</span>', 'Website colors</b><span>Orange / Blue / Green / Yellow.</span>'),
])

# Product 2: fabric-cover basketball set.
replace_in('fabric-silent-basketball.html', [
    ('src="assets/fabric-ball.jpg"', f'src="{MASTER["p2"]["hero"]}"'),
])

# Product 3: weighted flocked basketball.
replace_in('weighted-flocked-basketball.html', [
    ('src="assets/flocked-ball.jpg"', f'src="{MASTER["p3"]["hero"]}"'),
    ('Sizes 3 / 5 / 7', 'Sizes 3 / 4 / 6 / 7'),
    ('No. 3 / No. 5 / No. 7', 'No. 3 / No. 4 / No. 6 / No. 7'),
    ('No. 3 / 5 / 7', 'No. 3 / 4 / 6 / 7'),
    ('Orange / Coffee Brown / Black / Lake Blue', 'Orange / Brown / Black / Aqua Blue'),
    ('>Orange / Brown / Black</span>', '>Orange / Brown / Black / Aqua Blue</span>'),
    ('Website colors</b><span>Orange / Brown / Black.</span>', 'Website colors</b><span>Orange / Brown / Black / Aqua Blue.</span>'),
    ('orange, brown and black', 'orange, brown, black and aqua blue'),
    ('three colors', 'four colors'),
    ('Three colors', 'Four colors'),
])

# Product 4: flocked silent soccer ball.
replace_in('silent-soccer.html', [
    ('src="assets/flocked-soccer.jpg"', f'src="{MASTER["p4"]["hero"]}"'),
    ('4 colorways', '5 colorways'),
    ('four colorways', 'five colorways'),
    ('Four colorways', 'Five colorways'),
    ('Black/White · Black/Green · Black/Orange · Black/Gold', 'Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold'),
    ('Black/White / Black/Green / Black/Orange / Black/Gold', 'Black/White / Black/Green / Black/Red / Yellow/Green / Black/Gold'),
    ('black/white, black/green, black/orange and black/gold', 'black/white, black/green, black/red, yellow/green and black/gold'),
])

# Update every locale's product strings so language initialization cannot restore outdated specs.
i18n_path = ROOT / 'i18n.json'
data = json.loads(i18n_path.read_text(encoding='utf-8'))
for locale, d in data.items():
    if 'p1.tags' in d: d['p1.tags'] = 'Sizes 3 / 5 / 7|Orange / Blue / Green / Yellow|Adhesive hoop|Soft flocked feel'
    if 'p1.tags.1' in d: d['p1.tags.1'] = 'Sizes 3 / 5 / 7'
    if 'p1.tags.2' in d: d['p1.tags.2'] = 'Orange / Blue / Green / Yellow'
    if 'p1.spec1' in d: d['p1.spec1'] = 'No. 3 / No. 5 / No. 7'
    if 'p1.spec3' in d: d['p1.spec3'] = 'Orange / Blue / Green / Yellow'
    if 'p1.g3' in d: d['p1.g3'] = 'Three size options: No. 3, No. 5 and No. 7. Available in orange, blue, green and yellow.'

    if 'p2.tags' in d: d['p2.tags'] = 'Sizes 3 / 5 / 7|Orange / Green|Fabric cover|Ball + hoop set'
    if 'p2.tags.1' in d: d['p2.tags.1'] = 'Sizes 3 / 5 / 7'
    if 'p2.tags.2' in d: d['p2.tags.2'] = 'Orange / Green'
    if 'p2.spec1' in d: d['p2.spec1'] = 'No. 3 / No. 5 / No. 7'
    if 'p2.spec2' in d: d['p2.spec2'] = 'Orange / Green'

    if 'p3.tags' in d: d['p3.tags'] = 'Sizes 3 / 4 / 6 / 7|Orange / Brown / Black / Aqua Blue|Weighted feel|Training use'
    if 'p3.tags.1' in d: d['p3.tags.1'] = 'Sizes 3 / 4 / 6 / 7'
    if 'p3.tags.2' in d: d['p3.tags.2'] = 'Orange / Brown / Black / Aqua Blue'
    if 'p3.spec1' in d: d['p3.spec1'] = 'No. 3 / No. 4 / No. 6 / No. 7'
    if 'p3.spec2' in d: d['p3.spec2'] = 'Orange / Brown / Black / Aqua Blue'
    if 'p3.g2' in d: d['p3.g2'] = 'Four confirmed colors: orange, brown, black and aqua blue.'

    if 'p4.tags' in d: d['p4.tags'] = 'Size 5|5 colorways|Indoor play|Soft flocked surface'
    if 'p4.tags.1' in d: d['p4.tags.1'] = 'Size 5'
    if 'p4.tags.2' in d: d['p4.tags.2'] = '5 colorways'
    if 'p4.spec1' in d: d['p4.spec1'] = 'No. 5'
    if 'p4.spec2' in d: d['p4.spec2'] = 'Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold'
    if 'p4.g2' in d: d['p4.g2'] = 'Five confirmed colorways: black/white, black/green, black/red, yellow/green and black/gold.'
    if 'p4.notes.3' in d: d['p4.notes.3'] = 'Available in five colorways. Contact us for sample and packaging details.'

# Keep specification keys aligned across languages with the detail-page fields.
# Some older locales used p1.spec3 for the surface instead of the color list.
data['en']['p1.spec2'] = 'No. 3 / No. 5 / No. 7 · Orange / Blue / Green / Yellow'
for d in data.values():
    for key, value in data['en'].items():
        if re.fullmatch(r'p[1-4]\.spec\d+', key):
            d[key] = value

for locale in data.values():
    locale.update(json.loads(Path('admin/inquiry-copy.json').read_text(encoding='utf-8')))

i18n_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# site.js embeds the dictionaries used by the browser; updating i18n.json alone
# does not change the live text when the page initializes or switches language.
js_path = ROOT / 'site.js'
js = js_path.read_text(encoding='utf-8')
js = re.sub(r'^const I18N=.*?;\n', lambda _: 'const I18N=' + json.dumps(data, ensure_ascii=False) + ';\n', js, count=1)
js_path.write_text(js, encoding='utf-8')

images = {
    'assets/silent-set.jpg': MASTER['p1']['hero'],
    'assets/fabric-ball.jpg': MASTER['p2']['hero'],
    'assets/flocked-ball.jpg': MASTER['p3']['hero'],
    'assets/flocked-soccer.jpg': MASTER['p4']['hero'],
}
replacements = {
    'Orange / Coffee Brown / Black / Lake Blue': MASTER['p3']['colors'],
    'Coffee Brown': 'Brown',
    'Lake Blue': 'Aqua Blue',
    'Black/White · Black/Green · Black/Orange · Black/Gold': MASTER['p4']['colors_dots'],
    'Black/White, Black/Green, Black/Orange and Black/Gold': 'Black/White, Black/Green, Black/Red, Yellow/Green and Black/Gold',
    'Four website colorways': 'Five colorways',
    'four colorways': 'five colorways',
    'Four colorways': 'Five colorways',
    '4 colorways': '5 colorways',
}
for path in ROOT.glob('*.html'):
    page = path.read_text(encoding='utf-8')
    for old, new in {**images, **replacements}.items():
        page = page.replace(old, new)
    # Update the static fallback text as well as the browser dictionaries.
    def canonical_text(match):
        key = match.group(2)
        if re.fullmatch(r'p[1-4]\.(?:tags\.[12]|spec\d+|g[23])', key) or key == 'p4.notes.3':
            value = data['en'].get(key)
            if value is not None:
                return match.group(1) + value + match.group(4)
        return match.group(0)
    page = re.sub(r'(<[^>]+data-i18n="([^"]+)"[^>]*>)([^<]*)(</[^>]+>)', canonical_text, page)
    if path.name == 'inquiry.html':
        page = page.replace('Sizes 3 / 5 / 7 · Orange / Blue</small>', 'Sizes 3 / 5 / 7 · Orange / Blue / Green / Yellow</small>')
        page = page.replace('Sizes 3 / 5 / 7 · Training use', 'Sizes 3 / 4 / 6 / 7 · Orange / Brown / Black / Aqua Blue')
        page = page.replace('Size 5 · Five colorways', 'Size 5 · Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold')
    # Avoid duplicate CSS links when the script runs again during deployment.
    page = re.sub(r'(?:<link href="product-grid-2x2\.css(?:\?[^"]*)?" rel="stylesheet"/>)+', '<link href="product-grid-2x2.css?v=20261007-1" rel="stylesheet"/>', page)
    page = re.sub(r'src="site\.js(?:\?[^"]*)?"', 'src="site.js?v=20261010-growth1"', page)
    page = re.sub(r'src="forms-core\\.js(?:\\?[^\"]*)?"', 'src="forms-core.js?v=20261010-growth1"', page)
    for hero in images.values():
        page = re.sub(r'src="' + re.escape(hero) + r'(?:\?[^"]*)?"', 'src="' + hero + '?v=20261007-1"', page)
    path.write_text(page, encoding='utf-8')

# Machine-readable product master for backup/admin migration.
(ROOT / 'product-master.json').write_text(json.dumps(MASTER, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Canonical product images, specifications and 2x2 collection layout applied.')
