from pathlib import Path
import json

ROOT = Path('public')

# Canonical product data confirmed from the four approved MING EAGLE product artworks.
MASTER = {
    'p1': {
        'name': 'Flocked Silent Basketball Set',
        'sizes_tag': 'Sizes 3 / 5 / 7',
        'sizes': 'No. 3 / No. 5 / No. 7',
        'colors': 'Orange / Blue / Green / Yellow',
        'colorways': '4 colorways',
    },
    'p2': {
        'name': 'Fabric-Cover Silent Basketball Set',
        'sizes_tag': 'Sizes 3 / 5 / 7',
        'sizes': 'No. 3 / No. 5 / No. 7',
        'colors': 'Orange / Green',
        'colorways': '2 colors',
    },
    'p3': {
        'name': 'Weighted Flocked Silent Basketball',
        'sizes_tag': 'Sizes 3 / 4 / 6 / 7',
        'sizes': 'No. 3 / No. 4 / No. 6 / No. 7',
        'colors': 'Orange / Brown / Black / Aqua Blue',
        'colorways': '4 colors',
    },
    'p4': {
        'name': 'Flocked Silent Soccer Ball',
        'sizes_tag': 'Size 5',
        'sizes': 'No. 5',
        'colors': 'Black/White / Black/Green / Black/Red / Yellow/Green / Black/Gold',
        'colors_dots': 'Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold',
        'colorways': '5 colorways',
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

# Product listing and comparison table.
replace_in('products.html', [
    ('<span class="tag" data-i18n="p1.tags.2">Orange / Blue</span>', '<span class="tag" data-i18n="p1.tags.2">Orange / Blue / Green / Yellow</span>'),
    ('<span class="tag" data-i18n="p3.tags.1">Sizes 3 / 5 / 7</span>', '<span class="tag" data-i18n="p3.tags.1">Sizes 3 / 4 / 6 / 7</span>'),
    ('<span class="tag" data-i18n="p3.tags.2">Orange / Brown / Black</span>', '<span class="tag" data-i18n="p3.tags.2">Orange / Brown / Black / Aqua Blue</span>'),
    ('<span class="tag" data-i18n="p4.tags.2">4 colorways</span>', '<span class="tag" data-i18n="p4.tags.2">5 colorways</span>'),
    ('Orange / Coffee Brown / Black / Lake Blue', 'Orange / Brown / Black / Aqua Blue'),
])

# Product 1: flocked silent basketball set.
replace_in('silent-basketball.html', [
    ('>Orange / Blue<', '>Orange / Blue / Green / Yellow<'),
    ('Orange / Blue.</span>', 'Orange / Blue / Green / Yellow.</span>'),
    ('Website colors</b><span>Orange / Blue.</span>', 'Website colors</b><span>Orange / Blue / Green / Yellow.</span>'),
])

# Product 2 is already correct: Sizes 3/5/7, Orange/Green.

# Product 3: weighted flocked basketball.
replace_in('weighted-flocked-basketball.html', [
    ('Sizes 3 / 5 / 7', 'Sizes 3 / 4 / 6 / 7'),
    ('No. 3 / No. 5 / No. 7', 'No. 3 / No. 4 / No. 6 / No. 7'),
    ('No. 3 / 5 / 7', 'No. 3 / 4 / 6 / 7'),
    ('Orange / Coffee Brown / Black / Lake Blue', 'Orange / Brown / Black / Aqua Blue'),
    ('Orange / Brown / Black', 'Orange / Brown / Black / Aqua Blue'),
    ('orange, brown and black', 'orange, brown, black and aqua blue'),
    ('three colors', 'four colors'),
    ('Three colors', 'Four colors'),
])

# Product 4: flocked silent soccer ball.
replace_in('silent-soccer.html', [
    ('4 colorways', '5 colorways'),
    ('four colorways', 'five colorways'),
    ('Four colorways', 'Five colorways'),
    ('Black/White · Black/Green · Black/Orange · Black/Gold', 'Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold'),
    ('Black/White / Black/Green / Black/Orange / Black/Gold', 'Black/White / Black/Green / Black/Red / Yellow/Green / Black/Gold'),
    ('black/white, black/green, black/orange and black/gold', 'black/white, black/green, black/red, yellow/green and black/gold'),
])

# Update every locale's product-specific master strings so language initialization
# cannot overwrite the corrected English product specification values.
i18n_path = ROOT / 'i18n.json'
data = json.loads(i18n_path.read_text(encoding='utf-8'))
for locale, d in data.items():
    # P1
    if 'p1.tags' in d: d['p1.tags'] = 'Sizes 3 / 5 / 7|Orange / Blue / Green / Yellow|Adhesive hoop|Soft flocked feel'
    if 'p1.tags.2' in d: d['p1.tags.2'] = 'Orange / Blue / Green / Yellow'
    if 'p1.spec3' in d: d['p1.spec3'] = 'Orange / Blue / Green / Yellow'
    if 'p1.g3' in d: d['p1.g3'] = 'Three size options: No. 3, No. 5 and No. 7. Available in orange, blue, green and yellow.'
    # P2
    if 'p2.tags' in d: d['p2.tags'] = 'Sizes 3 / 5 / 7|Orange / Green|Fabric cover|Ball + hoop set'
    if 'p2.tags.1' in d: d['p2.tags.1'] = 'Sizes 3 / 5 / 7'
    if 'p2.tags.2' in d: d['p2.tags.2'] = 'Orange / Green'
    if 'p2.spec1' in d: d['p2.spec1'] = 'No. 3 / No. 5 / No. 7'
    if 'p2.spec2' in d: d['p2.spec2'] = 'Orange / Green'
    # P3
    if 'p3.tags' in d: d['p3.tags'] = 'Sizes 3 / 4 / 6 / 7|Orange / Brown / Black / Aqua Blue|Weighted feel|Training use'
    if 'p3.tags.1' in d: d['p3.tags.1'] = 'Sizes 3 / 4 / 6 / 7'
    if 'p3.tags.2' in d: d['p3.tags.2'] = 'Orange / Brown / Black / Aqua Blue'
    if 'p3.spec1' in d: d['p3.spec1'] = 'No. 3 / No. 4 / No. 6 / No. 7'
    if 'p3.spec2' in d: d['p3.spec2'] = 'Orange / Brown / Black / Aqua Blue'
    if 'p3.g2' in d: d['p3.g2'] = 'Four confirmed colors: orange, brown, black and aqua blue.'
    # P4
    if 'p4.tags' in d: d['p4.tags'] = 'Size 5|5 colorways|Indoor play|Soft flocked surface'
    if 'p4.tags.2' in d: d['p4.tags.2'] = '5 colorways'
    if 'p4.spec1' in d: d['p4.spec1'] = 'No. 5'
    if 'p4.spec2' in d: d['p4.spec2'] = 'Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold'
    if 'p4.g2' in d: d['p4.g2'] = 'Five confirmed colorways: black/white, black/green, black/red, yellow/green and black/gold.'
    if 'p4.notes.3' in d: d['p4.notes.3'] = 'Available in five colorways. Contact us for sample and packaging details.'
i18n_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Machine-readable master for backup/admin migration.
(ROOT / 'product-master.json').write_text(json.dumps(MASTER, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Canonical product specifications applied.')
