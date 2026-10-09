"""Preserve approved content while applying contact and crawl configuration."""
from pathlib import Path
import re
root=Path('public');version='20261010-contact1'
for p in root.glob('*.html'):
 s=p.read_text()
 if 'site.js?' not in s:
  continue
 s=re.sub(r'<script src="direct-contact\.js[^"]*"></script>','',s)
 s=re.sub(r'<script src="forms-core\.js[^"]*"></script>',f'<script src="forms-core.js?v={version}"></script>',s)
 if 'forms-core.js?' not in s:
  s=s.replace('</body>',f'<script src="forms-core.js?v={version}"></script></body>')
 s=s.replace('</body>',f'<script src="direct-contact.js?v={version}"></script></body>')
 s=re.sub(r'inquiry\.js\?[^"<]+',f'inquiry.js?v={version}',s)
 if p.name=='custom-logo.html':
  s=s.replace('<h2><span data-logo-i18n="Make the ball your own.">Make the ball your own.</span></h2>','<h1><span data-logo-i18n="Make the ball your own.">Make the ball your own.</span></h1>')
  s=re.sub(r'custom-logo\.css\?[^"<]+',f'custom-logo.css?v={version}',s)
 p.write_text(s)
p=root/'custom-logo.css';s=re.sub(r'(?:#mingeagle-custom-logo h1,)*#mingeagle-custom-logo h2\{','#mingeagle-custom-logo h1,#mingeagle-custom-logo h2{',p.read_text());p.write_text(s)
# Permit crawlers to read the existing noindex instruction on the receipt page.
p=root/'robots.txt';p.write_text(p.read_text().replace('Disallow: /thank-you.html\n',''))
print('Direct contact attribution, receipt crawl rules and logo heading applied.')
