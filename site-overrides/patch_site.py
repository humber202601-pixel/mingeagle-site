from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'public')
overrides = Path(__file__).resolve().parent


def read(name: str) -> str:
    return (root / name).read_text(encoding='utf-8')


def write(name: str, text: str) -> None:
    (root / name).write_text(text, encoding='utf-8')


def insert_before(name: str, marker: str, snippet: str, sentinel: str) -> None:
    text = read(name)
    if sentinel in text:
        return
    if marker not in text:
        raise SystemExit(f'V19 patch marker missing in {name}: {marker[:80]}')
    write(name, text.replace(marker, snippet + '\n' + marker, 1))


# 1) Add V19 styles to the preserved V15 stylesheet.
css_path = root / 'styles.css'
css = css_path.read_text(encoding='utf-8')
enhancements = (overrides / 'enhancements.css').read_text(encoding='utf-8')
if 'MING EAGLE V19' not in css:
    css_path.write_text(css + '\n\n' + enhancements + '\n', encoding='utf-8')

# 2) Add a discoverable Guide link to existing navigation/footer markup.
nav_needle = '<a data-i18n="nav.products" href="products.html">Products</a>'
nav_replacement = nav_needle + '<a href="silent-basketball-guide.html">Guide</a>'
for page in root.glob('*.html'):
    text = page.read_text(encoding='utf-8')
    if page.name == 'silent-basketball-guide.html':
        continue
    if 'silent-basketball-guide.html' not in text and nav_needle in text:
        text = text.replace(nav_needle, nav_replacement)
    page.write_text(text, encoding='utf-8')

# 3) Homepage education block: placed directly after the four-product collection.
home_marker = '<section class="section creatorShowcase" id="creator-play">'
home_guide = r'''<section class="section guidePromo" id="silent-ball-guide"><div class="wrap guidePromoGrid"><div><div class="eyebrow">SILENT BALL KNOWLEDGE</div><h2>WHAT MAKES A SILENT BASKETBALL DIFFERENT?</h2><p class="lead">Soft PU foam replaces the pressurized structure of a conventional basketball. The ball compresses on impact, helping reduce the sharp floor slap while keeping enough rebound for indoor play. Learn how to choose a model, restore the ball after shipping, install the mini hoop and care for the foam surface.</p><div class="actions"><a class="btn primary" href="silent-basketball-guide.html">Read the complete guide</a><a class="btn" href="products.html">Compare all 4 products</a></div></div><div class="guidePromoCard"><div class="eyebrow">QUICK START</div><h3>3 THINGS TO KNOW BEFORE YOU PLAY.</h3><div class="guideMiniGrid"><div class="guideMini"><b>No pump needed</b><span>PU foam balls are non-inflatable.</span></div><div class="guideMini"><b>Restore after shipping</b><span>Press and knead for about 5 minutes.</span></div><div class="guideMini"><b>Indoor surfaces work best</b><span>Clean floors protect the foam and keep play controlled.</span></div><div class="guideMini"><b>Mount the hoop carefully</b><span>Smooth, stable surfaces only; press 1 minute and wait 1 hour.</span></div></div></div></div></section>'''
insert_before('index.html', home_marker, home_guide, 'id="silent-ball-guide"')

# 4) Product comparison on the main product page.
products_marker = '<section class="section productBusinessBand">'
products_compare = r'''<section class="section comparisonSection" id="compare"><div class="wrap"><div class="eyebrow">PRODUCT COMPARISON</div><h2>WHICH SILENT BALL FITS THE CUSTOMER?</h2><p class="lead">The four products share the same indoor-play idea, but the surface, weight and target use are different. Use this table as a quick buying guide before requesting samples or a wholesale quote.</p><div class="compareWrap"><table class="compareTable"><thead><tr><th>Product</th><th>Best for</th><th>Construction</th><th>Sizes</th><th>Current colors</th></tr></thead><tbody><tr><td>Flocked Silent Basketball Set</td><td>Family play, apartments, mini-hoop shooting</td><td>Non-inflatable PU foam + flocked surface + adhesive hoop</td><td>No. 3 / 5 / 7</td><td>Orange / Blue</td></tr><tr><td>Fabric-Cover Silent Basketball Set</td><td>Soft-touch home play and frequent indoor handling</td><td>PU foam with fabric-cover option + adhesive hoop</td><td>No. 3 / 5 / 7</td><td>Orange / Green</td></tr><tr><td>Weighted Flocked Silent Basketball</td><td>Ball-handling drills and training-style practice</td><td>Weighted PU foam + flocked surface + deeper grip channels</td><td>Website assortment: No. 3 / 5 / 7</td><td>Orange / Brown / Black</td></tr><tr><td>Flocked Silent Soccer Ball</td><td>Indoor kids/teen footwork and football fun</td><td>Flocked PU foam</td><td>No. 5 · approx. 21.5 cm</td><td>Black/White · Black/Green · Black/Orange · Black/Gold</td></tr></tbody></table></div><div class="actions"><a class="btn primary" href="silent-basketball-guide.html">Silent Basketball Guide</a><a class="btn" href="inquiry.html?type=sample">Request samples</a></div></div></section>'''
insert_before('products.html', products_marker, products_compare, 'id="compare"')

# 5) Four product-specific detail/selling-point sections.
gallery_marker = '<section class="section"><div class="wrap"><div class="eyebrow" data-i18n="common.gallery">REAL PRODUCT HIGHLIGHTS</div>'

p1 = r'''<section class="section productDeepDive" id="product-benefits"><div class="wrap"><div class="eyebrow">WHY BUYERS CHOOSE IT</div><h2>HOME-READY PLAY IN ONE COMPACT SET.</h2><p class="lead">The core set combines a non-inflatable PU foam basketball, a soft flocked surface and a compact adhesive hoop. It is made for controlled indoor play rather than full-force court use.</p><div class="productBenefitGrid"><article class="benefitCard"><div class="benefitIcon">🔇</div><h3>Quieter floor impact</h3><p>The foam body compresses on contact, reducing the sharp impact sound associated with a conventional inflated basketball.</p></article><article class="benefitCard"><div class="benefitIcon">🖐️</div><h3>Soft flocked grip</h3><p>A fine flocked surface gives the ball a soft touch and extra friction for home handling and shooting games.</p></article><article class="benefitCard"><div class="benefitIcon">🏀</div><h3>Three useful sizes</h3><p>No. 3, No. 5 and No. 7 options make it easier to match younger players, family play or older users.</p></article><article class="benefitCard"><div class="benefitIcon">🏠</div><h3>Mini hoop included</h3><p>The approximately 30 cm / 11.8 in hoop uses a one-time adhesive mount for smooth, clean and stable indoor surfaces.</p></article></div><div class="productFacts"><div class="factPanel"><h3>Product facts</h3><div class="factRows"><div class="factRow"><b>Ball material</b><span>PU / polyurethane foam; non-inflatable.</span></div><div class="factRow"><b>Website sizes</b><span>No. 3 / No. 5 / No. 7.</span></div><div class="factRow"><b>Website colors</b><span>Orange / Blue.</span></div><div class="factRow"><b>Set format</b><span>1 silent basketball + 1 adhesive mini hoop.</span></div><div class="factRow"><b>Customization</b><span>Logo customization can be reviewed by quantity and artwork before production.</span></div></div></div><div class="factPanel"><h3>Best used for</h3><ul><li>Apartment and home shooting games.</li><li>Parent-child play and everyday movement.</li><li>Light ball-handling practice indoors.</li><li>Gift, retail and promotional set programs.</li><li>Not intended for aggressive dunking or forceful slamming.</li></ul></div></div><div class="productGuideCta"><div><b>Using the hoop or unpacking a compressed ball?</b><p>See the installation, 5-minute rebound-restoration, cleaning and safety instructions.</p></div><a class="btn orange" href="silent-basketball-guide.html#instructions">Open use &amp; care guide</a></div></div></section>'''
insert_before('silent-basketball.html', gallery_marker, p1, 'id="product-benefits"')

p2 = r'''<section class="section productDeepDive" id="product-benefits"><div class="wrap"><div class="eyebrow">WHY BUYERS CHOOSE IT</div><h2>A COVERED SURFACE FOR SOFTER HOME HANDLING.</h2><p class="lead">This version starts with a PU foam silent-ball core and adds a fabric-cover option. The supplier material also references anti-slip dot variants; the website focuses on the fabric-cover set and current options are confirmed before quoting.</p><div class="productBenefitGrid"><article class="benefitCard"><div class="benefitIcon">🧵</div><h3>Fabric-cover feel</h3><p>The textile-style outer layer changes the hand feel from bare foam and gives the product a more finished indoor-play surface.</p></article><article class="benefitCard"><div class="benefitIcon">🔇</div><h3>Non-inflatable PU core</h3><p>No pump is required. The foam body compresses on impact for quieter indoor use.</p></article><article class="benefitCard"><div class="benefitIcon">🎨</div><h3>Orange or green</h3><p>Two clear website color directions make assortment planning simple for retail or sample programs.</p></article><article class="benefitCard"><div class="benefitIcon">🏠</div><h3>Set-ready format</h3><p>Available with the compact adhesive hoop for family entertainment and indoor shooting games.</p></article></div><div class="productFacts"><div class="factPanel"><h3>Product facts</h3><div class="factRows"><div class="factRow"><b>Base material</b><span>PU / polyurethane foam.</span></div><div class="factRow"><b>Website sizes</b><span>No. 3 / No. 5 / No. 7.</span></div><div class="factRow"><b>Website colors</b><span>Orange / Green.</span></div><div class="factRow"><b>Supplier variants</b><span>Fabric-cover and anti-slip dot versions are referenced in the source material.</span></div><div class="factRow"><b>Customization</b><span>Logo/private-label requests can be reviewed before order confirmation.</span></div></div></div><div class="factPanel"><h3>Best used for</h3><ul><li>Indoor family and children’s play.</li><li>Customers who prefer a covered ball surface.</li><li>Mini-hoop games in bedrooms, playrooms and activity areas.</li><li>Retail sample programs that need easy size and color choices.</li></ul></div></div><div class="productGuideCta"><div><b>Care is simple.</b><p>Use clean water and a soft cloth; keep foam products away from sharp objects and rough outdoor surfaces.</p></div><a class="btn orange" href="silent-basketball-guide.html#instructions">Read use &amp; care</a></div></div></section>'''
insert_before('fabric-silent-basketball.html', gallery_marker, p2, 'id="product-benefits"')

p3 = r'''<section class="section productDeepDive" id="product-benefits"><div class="wrap"><div class="eyebrow">TRAINING-FIRST DESIGN</div><h2>MORE SUBSTANTIAL HAND FEEL. LESS INDOOR IMPACT NOISE.</h2><p class="lead">The weighted flocked model is positioned for customers who want indoor ball-handling practice with a feel closer to conventional basketball training. Supplier material highlights a weighted build, deeper grip channels and a flocked surface.</p><div class="productBenefitGrid"><article class="benefitCard"><div class="benefitIcon">⚖️</div><h3>Weighted construction</h3><p>Added mass creates a more substantial training feel than lightweight family-play silent balls. Exact weight is confirmed by production size.</p></article><article class="benefitCard"><div class="benefitIcon">✋</div><h3>Deeper grip channels</h3><p>Pronounced basketball-style channels help hand placement and control during dribbling and handling drills.</p></article><article class="benefitCard"><div class="benefitIcon">🔇</div><h3>Flocked PU foam</h3><p>The soft foam structure and flocked surface are designed for quieter indoor impact and a controlled touch.</p></article><article class="benefitCard"><div class="benefitIcon">🎯</div><h3>Training-oriented</h3><p>Better suited to handling routines, coordination work and indoor skill practice than aggressive full-court play.</p></article></div><div class="productFacts"><div class="factPanel"><h3>Product facts</h3><div class="factRows"><div class="factRow"><b>Material</b><span>PU / polyurethane foam with flocked surface.</span></div><div class="factRow"><b>Website assortment</b><span>No. 3 / No. 5 / No. 7.</span></div><div class="factRow"><b>Website colors</b><span>Orange / Brown / Black.</span></div><div class="factRow"><b>Weight</b><span>Weighted by size; exact grams are confirmed on the quote/spec sheet before order.</span></div><div class="factRow"><b>Inflation</b><span>No pump required.</span></div></div></div><div class="factPanel"><h3>Best used for</h3><ul><li>Indoor dribbling and ball-handling drills.</li><li>Coordination practice in homes or training rooms.</li><li>Teens and adults who want more resistance and realistic hand feel.</li><li>Coaches or training programs testing quieter indoor equipment.</li></ul></div></div><div class="productGuideCta"><div><b>Compressed during shipping?</b><p>Press and knead the PU foam for about 5 minutes after unpacking to help restore shape and rebound.</p></div><a class="btn orange" href="silent-basketball-guide.html#instructions">See recovery instructions</a></div></div></section>'''
insert_before('weighted-flocked-basketball.html', gallery_marker, p3, 'id="product-benefits"')

p4 = r'''<section class="section productDeepDive" id="product-benefits"><div class="wrap"><div class="eyebrow">INDOOR FOOTBALL PLAY</div><h2>SOFTER TOUCH FOR SMALL-SPACE FOOTWORK.</h2><p class="lead">The flocked silent soccer ball uses foamed PU construction in a size 5 format. It is designed for indoor kids/teen entertainment, parent-child play and controlled footwork practice.</p><div class="productBenefitGrid"><article class="benefitCard"><div class="benefitIcon">⚽</div><h3>Size 5 format</h3><p>Approximately 21.5 cm in diameter, giving familiar soccer-ball proportions for home play.</p></article><article class="benefitCard"><div class="benefitIcon">🪶</div><h3>Soft flocked surface</h3><p>The flocked outer feel is softer on contact than a conventional hard synthetic soccer ball.</p></article><article class="benefitCard"><div class="benefitIcon">🏠</div><h3>Indoor-focused</h3><p>Designed for controlled footwork and family entertainment in clean indoor spaces.</p></article><article class="benefitCard"><div class="benefitIcon">🎨</div><h3>Four website colorways</h3><p>Black/White, Black/Green, Black/Orange and Black/Gold make it easy to build a small retail assortment.</p></article></div><div class="productFacts"><div class="factPanel"><h3>Product facts</h3><div class="factRows"><div class="factRow"><b>Material</b><span>Foamed PU with flocked surface.</span></div><div class="factRow"><b>Size</b><span>No. 5 · approx. 21.5 cm diameter.</span></div><div class="factRow"><b>Inflation</b><span>Non-inflatable foam construction.</span></div><div class="factRow"><b>Colors</b><span>Black/White · Black/Green · Black/Orange · Black/Gold.</span></div><div class="factRow"><b>Use</b><span>Indoor children/teen play and controlled footwork practice.</span></div></div></div><div class="factPanel"><h3>Best used for</h3><ul><li>Home footwork and coordination games.</li><li>Children and teenagers playing indoors.</li><li>Parent-child football activities.</li><li>Retailers wanting a quieter indoor football companion to the basketball range.</li></ul></div></div><div class="productGuideCta"><div><b>Protect the foam surface.</b><p>Avoid sharp objects and abrasive outdoor ground; clean with a soft cloth and water.</p></div><a class="btn orange" href="silent-basketball-guide.html#instructions">See foam care basics</a></div></div></section>'''
insert_before('silent-soccer.html', gallery_marker, p4, 'id="product-benefits"')

# 6) Fix duplicated business-link text in older product footers when present.
for name in ['fabric-silent-basketball.html', 'weighted-flocked-basketball.html', 'silent-soccer.html']:
    text = read(name)
    doubled = '>Request quote / sample</a><a href="inquiry.html?type=quote&amp;product='
    # Leave the first product-specific link and turn a second identical CTA into a general sample link where possible.
    if text.count('Request quote / sample</a>') > 1:
        first = text.find('Request quote / sample</a>')
        second = text.find('Request quote / sample</a>', first + 1)
        if second != -1:
            start = text.rfind('<a ', 0, second)
            end = text.find('</a>', second) + 4
            text = text[:start] + '<a href="inquiry.html?type=sample">Request a sample</a>' + text[end:]
            write(name, text)

# 7) Copy the new guide page into the deploy artifact.
shutil.copyfile(overrides / 'silent-basketball-guide.html', root / 'silent-basketball-guide.html')

# 8) Sanity checks. These fail deployment instead of publishing a partial/broken website.
required = {
    'index.html': ['id="silent-ball-guide"', 'silent-basketball-guide.html'],
    'products.html': ['id="compare"', 'Flocked Silent Soccer Ball'],
    'silent-basketball.html': ['id="product-benefits"', 'Open use &amp; care guide'],
    'fabric-silent-basketball.html': ['id="product-benefits"'],
    'weighted-flocked-basketball.html': ['id="product-benefits"', 'Weighted construction'],
    'silent-soccer.html': ['id="product-benefits"', '21.5 cm'],
    'silent-basketball-guide.html': ['QUIETER PLAY, EXPLAINED.', 'SET UP THE MINI HOOP THE RIGHT WAY.'],
}
for name, needles in required.items():
    text = read(name)
    missing = [needle for needle in needles if needle not in text]
    if missing:
        raise SystemExit(f'V19 validation failed for {name}: {missing}')

print('V19 product/guide overlay applied successfully.')
