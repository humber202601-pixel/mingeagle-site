from pathlib import Path
import re
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'public')


def read(name):
    return (root / name).read_text(encoding='utf-8')


def write(name, text):
    (root / name).write_text(text, encoding='utf-8')

# Copy navigation entry across all public pages without disturbing existing links.
for page in root.glob('*.html'):
    text = page.read_text(encoding='utf-8')
    if 'for-schools.html' not in text:
        needle = '<a href="silent-basketball-guide.html">Guide</a>'
        if needle in text:
            text = text.replace(needle, needle + '<a href="for-schools.html">For Schools</a>', 1)
    page.write_text(text, encoding='utf-8')

# Correct guide product master data to the user-confirmed final assortment.
guide = read('silent-basketball-guide.html')
guide = guide.replace('<td>No. 3 / 5 / 7</td><td>Orange / Blue</td>', '<td>No. 3 / 5 / 7</td><td>Orange / Blue / Green / Yellow</td>', 1)
guide = guide.replace('<td>Website assortment: No. 3 / 5 / 7</td><td>Orange / Brown / Black</td>', '<td>No. 3 / 4 / 6 / 7</td><td>Orange / Coffee Brown / Black / Lake Blue</td>', 1)
guide = guide.replace('<td>No. 5 · approx. 21.5 cm</td><td>Black/White · Black/Green · Black/Orange · Black/Gold</td>', '<td>No. 5 only</td><td>Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold</td>', 1)

# Add education audience guidance to the Guide before installation.
if 'id="guide-schools"' not in guide:
    marker = '<section class="guideSection" id="instructions">'
    schools = '''<section class="guideSection" id="guide-schools" style="background:#f7f8fb"><div class="wrap"><div class="eyebrow">HOME · SCHOOL · TRAINING</div><h2>WHO CAN USE SILENT-BALL PRODUCTS?</h2><p class="lead">The product range can support supervised indoor activities from family play through school and training environments. Choose size and model based on the user group and the type of activity rather than treating one ball as suitable for every purpose.</p><div class="guideGrid3"><article class="guideCard"><div class="guideNumber">K</div><h3>Kindergarten / Preschool</h3><p>Soft-touch, non-inflatable models for guided movement and simple indoor ball activities.</p></article><article class="guideCard"><div class="guideNumber">E</div><h3>Elementary School</h3><p>Size 3 and 5 basketball options for indoor PE, activity rooms and after-school programs.</p></article><article class="guideCard"><div class="guideNumber">M</div><h3>Middle & High School</h3><p>Larger basketball options and the weighted model for controlled indoor recreation and practice.</p></article><article class="guideCard"><div class="guideNumber">T</div><h3>Training Spaces</h3><p>The weighted flocked basketball is the training-oriented option for handling and coordination work.</p></article><article class="guideCard"><div class="guideNumber">F</div><h3>Families</h3><p>Quieter indoor play, no routine inflation and soft-touch surfaces for home recreation.</p></article><article class="guideCard"><div class="guideNumber">B</div><h3>Bulk Buyers</h3><p>Schools, distributors and activity centers can request samples and volume pricing before a larger order.</p></article></div><div class="actions"><a class="btn primary" href="for-schools.html">For Schools</a><a class="btn" href="inquiry.html?type=quote">Request a school quote</a></div></div></section>'''
    if marker not in guide:
        raise SystemExit('V23 guide insertion marker missing')
    guide = guide.replace(marker, schools + '\n' + marker, 1)
write('silent-basketball-guide.html', guide)

# Ensure home school CTA links to the dedicated school page.
home = read('index.html')
home = home.replace('<a class="btn primary" href="inquiry.html?type=quote">Request a school / bulk quote</a><a class="btn" href="products.html#compare">Compare products</a>', '<a class="btn primary" href="for-schools.html">For Schools</a><a class="btn" href="inquiry.html?type=quote">Request a school / bulk quote</a>', 1)
write('index.html', home)

# Validation.
if not (root / 'for-schools.html').exists():
    raise SystemExit('V23 for-schools page missing')
if 'Orange / Blue / Green / Yellow' not in read('silent-basketball-guide.html'):
    raise SystemExit('V23 guide first-product colors missing')
if 'No. 3 / 4 / 6 / 7' not in read('silent-basketball-guide.html'):
    raise SystemExit('V23 guide weighted sizes missing')
if 'Black/Red · Yellow/Green · Black/Gold' not in read('silent-basketball-guide.html'):
    raise SystemExit('V23 guide soccer colors missing')
if 'id="guide-schools"' not in read('silent-basketball-guide.html'):
    raise SystemExit('V23 guide schools section missing')
print('V23 schools page + guide master-data correction applied.')
