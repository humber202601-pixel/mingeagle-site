"""Normalize the public contact helper after all content/SEO builders."""
from pathlib import Path
import re
for path in Path('public').glob('*.html'):
    html=path.read_text(encoding='utf-8')
    if 'src="forms-core.js' not in html:
        continue
    matches=list(re.finditer(r'<script src="direct-contact\.js[^"]*"></script>',html))
    if len(matches)==1 and html.index('src="forms-core.js')<html.index('src="direct-contact.js'):
        continue
    html=re.sub(r'<script src="direct-contact\.js[^"]*"></script>','',html)
    html=html.rsplit('</body>',1)[0]+'<script src="direct-contact.js?v=20261011-retail"></script></body>'+html.rsplit('</body>',1)[1] if '</body>' in html else html
    path.write_text(html,encoding='utf-8')
    print('Contact helper normalized:',path.name,'previous count',len(matches))
