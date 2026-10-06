from pathlib import Path
import re
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'public')


def read(name):
    return (root / name).read_text(encoding='utf-8')


def write(name, text):
    (root / name).write_text(text, encoding='utf-8')


# 1) Reuse the exact homepage creator-video section on the first product page.
# The homepage implementation is already confirmed to play correctly in production.
index = read('index.html')
start = index.find('<section class="section creatorShowcase" id="creator-play">')
if start == -1:
    raise SystemExit('V20: working homepage creator section not found')
end = index.find('</section>', start)
if end == -1:
    raise SystemExit('V20: homepage creator section closing tag not found')
home_creator = index[start:end + len('</section>')]
home_creator = home_creator.replace('id="creator-play"', 'id="creator-videos"', 1)
home_creator = home_creator.replace('REAL CREATOR PLAY', 'REAL CREATOR PLAY / PRODUCT DEMOS', 1)
home_creator = home_creator.replace('REAL PEOPLE. REAL PLAY.', 'SEE THE FLOCKED SILENT BASKETBALL IN REAL CREATOR VIDEOS.', 1)

p1 = read('silent-basketball.html')
pattern = re.compile(r'<section class="section creatorProduct" id="creator-videos">.*?</section>', re.S)
if not pattern.search(p1):
    raise SystemExit('V20: old product creator section not found')
p1 = pattern.sub(home_creator, p1, count=1)
write('silent-basketball.html', p1)

# 2) Replace the old repetitive REAL PRODUCT HIGHLIGHTS sections with visual selling-point sections.
PRODUCTS = {
    'silent-basketball.html': {
        'title': 'FLOCKED SILENT BASKETBALL SET — KEY SELLING POINTS',
        'lead': 'A stronger product story: quiet PU foam, soft flocked grip, adhesive mini hoop, multiple sizes and indoor family use — shown visually instead of repeating the same product photo.',
        'visual': 'https://ming-eagle-sports.floot.app/_cdn/static/5b61fbaf-42f6-493b-94a7-9545593fc3c3-silent-basketball-selling-points.png',
        'local': 'assets/silent-set.jpg',
        'cards': [
            ('QUIETER INDOOR IMPACT', 'Soft PU foam compresses on contact to reduce the sharp floor slap of a conventional inflated basketball.'),
            ('SOFT FLOCKED GRIP', 'A fine flocked outer surface improves comfort and control for home handling and shooting games.'),
            ('NO-DRILL MINI HOOP', 'The compact hoop uses a one-time adhesive pad on smooth, clean and stable indoor surfaces.'),
            ('SIZES 3 / 5 / 7', 'Three size options make it easier to match children, family play and older users.'),
            ('HOME & APARTMENT PLAY', 'Designed for controlled indoor fun, parent-child play and small-space movement.'),
            ('COMPLETE SET FORMAT', 'Ball + mini hoop creates a clear retail bundle and an easy-to-understand gift product.')
        ]
    },
    'fabric-silent-basketball.html': {
        'title': 'FABRIC-COVER SILENT BASKETBALL SET — KEY SELLING POINTS',
        'lead': 'A softer covered feel built around the same non-inflatable PU silent-ball idea, with simple size/color choices and an optional hoop set for indoor play.',
        'visual': 'https://ming-eagle-sports.floot.app/_cdn/static/8701ced0-5642-49de-961f-af538a96239e.png',
        'local': 'assets/fabric-ball.jpg',
        'cards': [
            ('FABRIC-COVER FEEL', 'A textile-style outer layer gives the ball a softer, more finished hand feel for frequent indoor handling.'),
            ('NON-INFLATABLE PU CORE', 'No pump is required; the foam structure provides shape and rebound.'),
            ('QUIETER HOME PLAY', 'The soft structure is designed to reduce harsh impact noise indoors.'),
            ('ORANGE / GREEN', 'Two clear color directions keep retail and sample assortments simple.'),
            ('SIZES 3 / 5 / 7', 'Multiple size options support different age groups and play styles.'),
            ('HOOP SET OPTION', 'Can be paired with the compact adhesive mini hoop for family shooting games.')
        ]
    },
    'weighted-flocked-basketball.html': {
        'title': 'WEIGHTED FLOCKED SILENT BASKETBALL — KEY SELLING POINTS',
        'lead': 'A training-first silent basketball: weighted construction, deeper grip channels and flocked PU foam for indoor handling drills with a more substantial feel.',
        'visual': 'https://ming-eagle-sports.floot.app/_cdn/static/3ae2eb6f-8f31-44cc-8927-51633fc93e2f.png',
        'local': 'assets/flocked-ball.jpg',
        'cards': [
            ('WEIGHTED TRAINING FEEL', 'Added mass gives a more substantial hand feel than lightweight family-play silent balls.'),
            ('DEEPER GRIP CHANNELS', 'Pronounced basketball-style channels support hand placement and control during handling drills.'),
            ('FLOCKED PU SURFACE', 'Soft flocking combines comfort, friction and quieter indoor impact.'),
            ('INDOOR DRIBBLING', 'Built for controlled ball-handling, coordination and skill practice rather than aggressive court play.'),
            ('SIZES 3 / 5 / 7', 'Website assortment covers three practical size options; exact production weight is confirmed on quote.'),
            ('TEEN / ADULT TRAINING', 'A useful option for coaches, training programs and users seeking more resistance indoors.')
        ]
    },
    'silent-soccer.html': {
        'title': 'FLOCKED SILENT SOCCER BALL — KEY SELLING POINTS',
        'lead': 'A soft size-5 indoor football option for kids and teens, combining flocked PU foam, four colorways and controlled home footwork practice.',
        'visual': 'https://ming-eagle-sports.floot.app/_cdn/static/fd08e495-65e5-4fd9-81db-f8ca53838517.png',
        'local': 'assets/flocked-soccer.jpg',
        'cards': [
            ('SIZE 5 FORMAT', 'Approx. 21.5 cm diameter gives familiar soccer-ball proportions for indoor play.'),
            ('SOFT FLOCKED TOUCH', 'A flocked surface feels softer on contact than a conventional hard synthetic soccer ball.'),
            ('FOAMED PU CORE', 'Non-inflatable foam construction supports quiet, controlled indoor use.'),
            ('FOUR COLORWAYS', 'Black/White, Black/Green, Black/Orange and Black/Gold.'),
            ('HOME FOOTWORK', 'Designed for controlled touches, coordination games and small-space practice.'),
            ('KIDS & TEENS', 'Positioned for family entertainment and youth indoor football activities.')
        ]
    },
}

old_gallery = re.compile(r'<section class="section"><div class="wrap"><div class="eyebrow" data-i18n="common.gallery">REAL PRODUCT HIGHLIGHTS</div>.*?</section>', re.S)
for filename, cfg in PRODUCTS.items():
    text = read(filename)
    cards = ''.join(
        f'<article class="sellingPointCard"><span class="sellingPointNum">{i}</span><h3>{title}</h3><p>{body}</p></article>'
        for i, (title, body) in enumerate(cfg['cards'], 1)
    )
    section = f'''<section class="section visualHighlights" id="real-product-highlights"><div class="wrap"><div class="eyebrow">REAL PRODUCT HIGHLIGHTS</div><h2>{cfg['title']}</h2><p class="lead">{cfg['lead']}</p><div class="sellingHero"><img src="{cfg['visual']}" alt="{cfg['title']} visual selling points" loading="lazy"/></div><div class="sellingPointGrid">{cards}</div><div class="sellingProof"><img src="{cfg['local']}" alt="Real product view"/><div><div class="eyebrow">REAL PRODUCT REFERENCE</div><h3>THE ACTUAL PRODUCT STAYS THE HERO.</h3><p>The infographic explains the benefits visually; this real product image remains on the page so buyers can distinguish marketing explanation from the actual product appearance.</p><a class="btn" href="inquiry.html?type=sample">Request a sample</a></div></div></div></section>'''
    if old_gallery.search(text):
        text = old_gallery.sub(section, text, count=1)
    elif 'id="real-product-highlights"' not in text:
        raise SystemExit(f'V20: highlight section not found in {filename}')
    write(filename, text)

# 3) V20 validation.
p1 = read('silent-basketball.html')
if 'creatorShowcase' not in p1 or p1.count('tiktok.com/player') < 6:
    raise SystemExit('V20: product page did not inherit working homepage TikTok section')
for filename in PRODUCTS:
    text = read(filename)
    if 'id="real-product-highlights"' not in text or 'sellingPointGrid' not in text:
        raise SystemExit(f'V20: selling point section missing in {filename}')

print('V20 product video + visual highlights applied successfully.')
