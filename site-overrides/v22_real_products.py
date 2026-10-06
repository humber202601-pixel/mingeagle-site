from pathlib import Path
import re
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'public')


def read(name):
    return (root / name).read_text(encoding='utf-8')


def write(name, text):
    (root / name).write_text(text, encoding='utf-8')

BASE = 'https://ming-eagle-sports.floot.app'

PRODUCTS = {
    'silent-basketball.html': {
        'title': 'FLOCKED SILENT BASKETBALL — REAL PRODUCT HIGHLIGHTS',
        'lead': 'Every image in this section is based on the confirmed MING EAGLE product photography. The flocked silent basketball is non-inflatable, soft-touch and designed for quieter indoor play. It is available in four confirmed colors and three sizes, and can be paired with the orange mini hoop shown below.',
        'specs': [('Colors','Orange / Blue / Green / Yellow'),('Sizes','No. 3 / No. 5 / No. 7'),('Construction','Soft flocked silent-ball body'),('Set option','Ball + orange mini hoop')],
        'photos': [
            ('wide', '/_cdn/static/e91f95f7-3524-4c15-8c84-b234a19764fb-p1-set-orange.jpg', 'Actual orange set', 'Confirmed orange ball with the actual orange mini hoop and red/white/blue net.'),
            ('', '/_cdn/static/ea3fbbf6-15a9-4b79-acf8-9912e732a592-p1-ball-orange.jpg', 'Orange', 'Confirmed orange flocked silent basketball.'),
            ('wide', '/_cdn/static/59e67dc3-b6f6-4fd2-be9d-0834b71f834e-p1-set-blue.jpg', 'Blue set option', 'Confirmed blue ball photographed with the same hoop set.'),
            ('', '/_cdn/static/eba9f09b-83cb-4415-94cc-a5c113669f12-p1-ball-green.png', 'Green', 'Confirmed green colorway supplied for the first product.'),
            ('', '/_cdn/static/c3cae015-7cd9-4748-bbfd-2f9bae1c49fc-p1-ball-yellow.png', 'Yellow', 'Confirmed yellow colorway supplied for the first product.'),
            ('', '/_cdn/static/2c1d483a-bc80-469d-96b2-b842ce640766-p1-hoop-front.jpg', 'Actual mini hoop', 'Orange bear-ear back plate, orange rim and red/white/blue net.')
        ],
        'cards': [
            ('QUIETER INDOOR PLAY','The soft silent-ball structure is intended to reduce harsh indoor impact noise compared with a conventional inflated basketball.'),
            ('NO INFLATION REQUIRED','No pump or needle is needed for normal use, making day-to-day home and institutional use simpler.'),
            ('SOFT FLOCKED TOUCH','The flocked exterior creates a softer hand feel for indoor handling, catching and shooting games.'),
            ('4 CONFIRMED COLORS','Orange, Blue, Green and Yellow — only these confirmed website colors should be shown.'),
            ('SIZES 3 / 5 / 7','Three confirmed size options support different age groups and buying programs.'),
            ('HOOP SET OPTION','Can be paired with the exact orange mini hoop shown in the real photos; no substitute hoop design should be used.')
        ]
    },
    'fabric-silent-basketball.html': {
        'title': 'FABRIC-COVER SILENT BASKETBALL — REAL PRODUCT HIGHLIGHTS',
        'lead': 'This model is identified by its fabric-covered surface and printed graphics. It keeps the non-inflatable, quiet indoor-play concept while offering a softer covered feel and a more playful visual style. It can also be paired with the same confirmed orange mini hoop.',
        'specs': [('Colors','Orange / Green'),('Sizes','No. 3 / No. 5 / No. 7'),('Surface','Fabric-cover design'),('Set option','Ball + same orange mini hoop')],
        'photos': [
            ('wide', '/_cdn/static/dae816d0-a3b0-4f96-8288-05e68bbeaed5-p2-fabric-green.png', 'Green fabric-cover model', 'Confirmed green/white fabric-cover design with printed educational graphics.'),
            ('wide', '/_cdn/static/8a106530-d70f-4767-81e6-ac4c8b45761d-p2-fabric-orange.png', 'Orange fabric-cover model', 'Confirmed orange/white fabric-cover design.'),
            ('', '/_cdn/static/bf5cb955-b7bf-4caf-b607-56ca27d51f45-p1-hoop-installed.jpg', 'Compatible mini hoop', 'The second product may be paired with the same actual orange hoop used by the first product.')
        ],
        'cards': [
            ('FABRIC-COVER FEEL','A textile-style outer layer gives this model a visibly different touch and appearance from the flocked version.'),
            ('NO INFLATION REQUIRED','The silent-ball body is designed to be used without routine inflation.'),
            ('QUIETER INDOOR PLAY','A softer body is suited to controlled indoor play in homes, activity rooms and supervised school environments.'),
            ('PRINTED GRAPHICS','The confirmed product uses printed numbers, letters and basketball motifs that add a playful educational look.'),
            ('ORANGE / GREEN','The website should show only the two confirmed color families: Orange and Green.'),
            ('SIZES 3 / 5 / 7','Three confirmed size choices allow buyers to match different user groups and order programs.')
        ]
    },
    'weighted-flocked-basketball.html': {
        'title': 'WEIGHTED FLOCKED SILENT BASKETBALL — REAL PRODUCT HIGHLIGHTS',
        'lead': 'The third model is the training-oriented option. Its confirmed positioning is a weighted silent basketball whose weight, rebound and handling are designed to feel closer to a conventional basketball while keeping a soft flocked exterior for indoor practice.',
        'specs': [('Colors','Orange / Coffee Brown / Black / Lake Blue'),('Sizes','No. 3 / No. 4 / No. 6 / No. 7'),('Positioning','Weighted, basketball-like feel'),('Use','Indoor practice & skill work')],
        'photos': [
            ('', '/_cdn/static/963407de-19bf-4b9d-92dc-fde6344e1267-p3-weighted-orange.png', 'Orange', 'Confirmed orange weighted flocked silent basketball.'),
            ('', '/_cdn/static/3a1e619d-40ab-42e2-9626-c882280975a3-p3-weighted-coffee.png', 'Coffee Brown', 'Confirmed coffee-brown weighted colorway.'),
            ('', '/_cdn/static/e9373b3d-04f9-412b-b165-f295c0b5969d-p3-weighted-black.png', 'Black', 'Confirmed black weighted colorway with contrasting channel lines.'),
            ('', '/_cdn/static/981cfa1e-a244-4fea-aace-fa414f71d6a8-p3-weighted-lakeblue.png', 'Lake Blue', 'Confirmed lake-blue weighted colorway.')
        ],
        'cards': [
            ('WEIGHTED DESIGN','A more substantial feel than lightweight silent-play balls, supporting training-style indoor use.'),
            ('BASKETBALL-LIKE FEEL','The product is positioned around weight, rebound and handling that feel closer to a normal basketball.'),
            ('SOFT FLOCKED SURFACE','The flocked exterior provides a softer indoor touch while retaining basketball-style channels.'),
            ('NO INFLATION REQUIRED','The product does not depend on regular air inflation for everyday use.'),
            ('4 CONFIRMED SIZES','No. 3, No. 4, No. 6 and No. 7. Do not substitute the 3/5/7 size pattern used by the first two products.'),
            ('TRAINING-ORIENTED','Best positioned for indoor handling, coordination and skill practice rather than aggressive full-court play.')
        ]
    },
    'silent-soccer.html': {
        'title': 'FLOCKED SILENT INDOOR SOCCER BALL — REAL PRODUCT HIGHLIGHTS',
        'lead': 'The fourth model is a size-5 flocked silent soccer ball for children’s indoor recreation, parent-child play and controlled footwork. The five confirmed colorways below are the only colors to show on the website.',
        'specs': [('Colors','5 confirmed colorways'),('Size','No. 5 only'),('Surface','Soft flocked exterior'),('Use','Indoor family & school activities')],
        'photos': [
            ('', '/_cdn/static/2c44c87f-7a04-4d97-a608-2e76c84ac629-p4-soccer-blackwhite.png', 'Black / White', 'Classic black-and-white confirmed colorway.'),
            ('', '/_cdn/static/e3349185-133d-4c63-9173-34ca3409b154-p4-soccer-blackgreen.png', 'Black / Green', 'Confirmed bright green with dark panels.'),
            ('', '/_cdn/static/a54ede0f-0ad4-439c-87f7-f5990f1712f0-p4-soccer-blackred.png', 'Black / Red', 'Confirmed orange-red / black colorway, listed on the website as Black / Red.'),
            ('', '/_cdn/static/de8368d3-8703-4519-98b6-0a4f21b09865-p4-soccer-yellowgreen.png', 'Yellow / Green', 'Confirmed yellow-green bright colorway.'),
            ('', '/_cdn/static/3706d226-cfd8-42f7-a826-9f64bcd75ac5-p4-soccer-blackgold.png', 'Black / Gold', 'Confirmed black-and-gold colorway.')
        ],
        'cards': [
            ('SIZE 5 ONLY','This product has one confirmed size: No. 5. The website should not display other sizes.'),
            ('SOFT FLOCKED TOUCH','The flocked surface feels softer for controlled indoor contact and family play.'),
            ('LIGHT INDOOR PLAY','Positioned for children’s indoor recreation, parent-child activity and basic footwork.'),
            ('NO ROUTINE INFLATION','The silent-ball construction is designed for convenient indoor use without normal pump maintenance.'),
            ('5 CONFIRMED COLORS','Black/White, Black/Green, Black/Red, Yellow/Green and Black/Gold.'),
            ('HOME & SCHOOL USE','Suitable for supervised indoor activities in homes, schools, activity rooms and youth programs.')
        ]
    }
}

section_pattern = re.compile(r'<section class="section visualHighlights" id="real-product-highlights">.*?</section>', re.S)

for filename, cfg in PRODUCTS.items():
    text = read(filename)
    photo_html = ''.join(
        f'<article class="realPhotoCard {klass}"><img src="{BASE}{url}" alt="{title}" loading="lazy"><div class="realPhotoMeta"><b>{title}</b><span>{caption}</span></div></article>'
        for klass, url, title, caption in cfg['photos']
    )
    spec_html = ''.join(
        f'<div class="productSpecItem"><small>{label}</small><b>{value}</b></div>'
        for label, value in cfg['specs']
    )
    card_html = ''.join(
        f'<article class="sellingPointCard"><span class="sellingPointNum">{i}</span><h3>{title}</h3><p>{body}</p></article>'
        for i, (title, body) in enumerate(cfg['cards'], 1)
    )
    section = f'''<section class="section realProductHighlights" id="real-product-highlights"><div class="wrap"><div class="eyebrow">REAL PRODUCT HIGHLIGHTS</div><h2>{cfg['title']}</h2><p class="lead">{cfg['lead']}</p><div class="realProductNote"><strong>REAL-PHOTO RULE</strong><span>Product shape, color, surface pattern, hoop structure and included components shown here come from the confirmed product photos. Marketing artwork must not redraw or invent a different product.</span></div><div class="productSpecBand">{spec_html}</div><div class="realPhotoGrid">{photo_html}</div><div class="sellingPointGrid">{card_html}</div><div class="actions"><a class="btn primary" href="inquiry.html?type=quote">Request wholesale pricing</a><a class="btn" href="inquiry.html?type=sample">Request a sample</a></div></div></section>'''
    if not section_pattern.search(text):
        raise SystemExit(f'V22 real-product section marker missing: {filename}')
    text = section_pattern.sub(section, text, count=1)
    write(filename, text)

# Replace the V19 comparison block with the user-confirmed product master data.
products = read('products.html')
compare_pattern = re.compile(r'<section class="section comparisonSection" id="compare">.*?</section>', re.S)
compare = '''<section class="section comparisonSection" id="compare"><div class="wrap"><div class="eyebrow">PRODUCT COMPARISON</div><h2>CHOOSE THE RIGHT SILENT BALL.</h2><p class="lead">Four confirmed products, each with a different surface, size range and use case. Specifications below follow the current MING EAGLE product master data.</p><div class="compareWrap"><table class="compareTable"><thead><tr><th>Product</th><th>Best for</th><th>Sizes</th><th>Confirmed colors</th></tr></thead><tbody><tr><td>Flocked Silent Basketball</td><td>Family indoor play, schools, mini-hoop activities</td><td>No. 3 / 5 / 7</td><td>Orange / Blue / Green / Yellow</td></tr><tr><td>Fabric-Cover Silent Basketball</td><td>Younger users, family play, school activity rooms</td><td>No. 3 / 5 / 7</td><td>Orange / Green</td></tr><tr><td>Weighted Flocked Silent Basketball</td><td>Indoor practice, skill work, more realistic basketball feel</td><td>No. 3 / 4 / 6 / 7</td><td>Orange / Coffee Brown / Black / Lake Blue</td></tr><tr><td>Flocked Silent Indoor Soccer Ball</td><td>Children’s indoor football, parent-child play, schools</td><td>No. 5 only</td><td>Black/White · Black/Green · Black/Red · Yellow/Green · Black/Gold</td></tr></tbody></table></div><div class="actions"><a class="btn primary" href="silent-basketball-guide.html">Silent Ball Guide</a><a class="btn" href="inquiry.html?type=sample">Request samples</a></div></div></section>'''
if not compare_pattern.search(products):
    raise SystemExit('V22 comparison section not found')
products = compare_pattern.sub(compare, products, count=1)
write('products.html', products)

# Add schools/education as a first-class homepage audience without creating unsupported claims.
home = read('index.html')
if 'id="schools-audience"' not in home:
    marker = '<section class="section guidePromo" id="silent-ball-guide">'
    if marker not in home:
        raise SystemExit('V22 homepage school-audience marker missing')
    school = '''<section class="section schoolAudienceV22" id="schools-audience"><div class="wrap"><div class="eyebrow">HOME · SCHOOL · TRAINING</div><h2>QUIET PLAY FOR MORE THAN THE LIVING ROOM.</h2><p class="lead">MING EAGLE silent balls can support supervised indoor activities across families, kindergartens, elementary schools, middle and high schools, after-school programs and training spaces. Buyers can select lighter family-play models or the weighted training-oriented basketball depending on the age group and activity.</p><div class="schoolAudienceGrid"><article class="schoolAudienceCard"><h3>Kindergarten / Preschool</h3><p>Soft-touch, non-inflatable options for guided movement and simple ball activities.</p></article><article class="schoolAudienceCard"><h3>Elementary School</h3><p>Indoor PE, activity-room and after-school programs with size choices for younger users.</p></article><article class="schoolAudienceCard"><h3>Middle & High School</h3><p>Recreation and controlled indoor practice, including the weighted model for a more basketball-like feel.</p></article><article class="schoolAudienceCard"><h3>Training Programs</h3><p>Ball-handling, coordination and skill work in indoor training environments.</p></article><article class="schoolAudienceCard"><h3>Families</h3><p>Quieter indoor play, no routine inflation and soft-touch product options.</p></article><article class="schoolAudienceCard"><h3>Bulk Buyers</h3><p>Schools, retailers, distributors and activity centers can request samples and volume pricing.</p></article></div><div class="actions"><a class="btn primary" href="inquiry.html?type=quote">Request a school / bulk quote</a><a class="btn" href="products.html#compare">Compare products</a></div></div></section>'''
    home = home.replace(marker, school + '\n' + marker, 1)
    write('index.html', home)

# V22 validation.
for filename, cfg in PRODUCTS.items():
    text = read(filename)
    if 'realPhotoGrid' not in text or 'REAL-PHOTO RULE' not in text:
        raise SystemExit(f'V22 real-photo gallery missing: {filename}')
if 'No. 3 / No. 4 / No. 6 / No. 7' not in read('weighted-flocked-basketball.html'):
    raise SystemExit('V22 weighted-basketball size master data missing')
if 'Black/White, Black/Green, Black/Red, Yellow/Green and Black/Gold' not in read('silent-soccer.html'):
    raise SystemExit('V22 soccer color master data missing')
if 'Orange / Blue / Green / Yellow' not in read('silent-basketball.html'):
    raise SystemExit('V22 first-product color master data missing')
if 'id="schools-audience"' not in read('index.html'):
    raise SystemExit('V22 schools audience section missing')
print('V22 confirmed real-product visuals + exact specs + school audience applied.')
