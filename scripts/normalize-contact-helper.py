"""Normalize one official contact helper on each generated public page."""
from pathlib import Path
import re
pattern=r'<script\b[^>]*\bsrc="direct-contact\.js[^"]*"[^>]*></script>'
for path in Path('public').glob('*.html'):
    html=path.read_text(encoding='utf-8')
    if 'src="forms-core.js' not in html:
        continue
    matches=list(re.finditer(pattern,html))
    if len(matches)==1 and html.index('src="forms-core.js')<html.index('src="direct-contact.js'):
        continue
    html=re.sub(pattern,'',html)
    if '</body>' in html:
        head,tail=html.rsplit('</body>',1)
        html=head+'<script src="direct-contact.js?v=20261011-retail"></script></body>'+tail
        path.write_text(html,encoding='utf-8')
        print('Contact helper normalized:',path.name,'previous count',len(matches))
