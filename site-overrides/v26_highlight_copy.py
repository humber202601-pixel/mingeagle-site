from pathlib import Path
import re
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'public')

HIGHLIGHTS = {
    'silent-basketball.html': [
        ('QUIET INDOOR PLAY', 'Designed for quieter family play at home and in activity rooms.'),
        ('NO INFLATION REQUIRED', 'Ready to use without a pump or needle.'),
        ('SOFT FLOCKED TOUCH', 'Soft flocked surface for comfortable indoor handling.'),
        ('KID-FRIENDLY HOOP SET', 'Can be paired with the adhesive indoor mini hoop shown in the set.'),
    ],
    'fabric-silent-basketball.html': [
        ('FABRIC-COVER DESIGN', 'Fabric-cover surface with printed graphics and a soft feel.'),
        ('QUIET INDOOR BOUNCING', 'Low-noise indoor play for homes and school activity spaces.'),
        ('NO INFLATION REQUIRED', 'Integrated silent-ball construction; no pump required.'),
        ('OPTIONAL HOOP SET', 'Can be paired with the same adhesive indoor mini hoop.'),
    ],
    'weighted-flocked-basketball.html': [
        ('WEIGHTED FEEL', 'More substantial, basketball-like handling.'),
        ('CLOSER TO REAL HANDLING', 'Realistic touch and bounce for indoor drills.'),
        ('QUIET INDOOR TRAINING', 'Practice anytime with less impact noise.'),
        ('NO INFLATION REQUIRED', 'Ready to use without routine inflation.'),
    ],
    'silent-soccer.html': [
        ('QUIET INDOOR KICKING', 'Designed for lower-noise indoor soccer play.'),
        ('SOFT FLOCKED SURFACE', 'Soft flocked finish for controlled indoor contact.'),
        ('PARENT-CHILD ACTIVITY', 'Suitable for family play and supervised youth activities.'),
        ('5 COLORWAYS', 'Black/White, Black/Green, Black/Red, Yellow/Green and Black/Gold.'),
    ],
}

# V22 generates one sellingPointGrid inside the REAL PRODUCT HIGHLIGHTS section.
# Replace only the cards inside that grid so the confirmed real-product photos,
# specs, CTA buttons, anchors and the rest of each product page remain untouched.
grid_pattern = re.compile(r'(<div class="sellingPointGrid">).*?(</div><div class="actions">)', re.S)

for filename, cards in HIGHLIGHTS.items():
    path = root / filename
    text = path.read_text(encoding='utf-8')
    card_html = ''.join(
        f'<article class="sellingPointCard"><span class="sellingPointNum">{i}</span><h3>{title}</h3><p>{body}</p></article>'
        for i, (title, body) in enumerate(cards, 1)
    )
    replacement = rf'\1{card_html}\2'
    if not grid_pattern.search(text):
        raise SystemExit(f'V26 sellingPointGrid not found: {filename}')
    text = grid_pattern.sub(replacement, text, count=1)
    path.write_text(text, encoding='utf-8')

print('V26 approved REAL PRODUCT HIGHLIGHTS copy applied to all four product pages.')
