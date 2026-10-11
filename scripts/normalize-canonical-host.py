"""Make the site's canonical host match its actual www redirect after all SEO builders."""
from pathlib import Path
import re
root=Path('public')
host='https://www.mingeagle.com/'
for path in root.glob('*.html'):
    html=path.read_text(encoding='utf-8')
    html=re.sub(r'(<link\b(?=[^>]*rel=["\']canonical["\'])[^>]*href=["\'])https://(?:www\.)?mingeagle\.com/',r'\g<1>'+host,html,flags=re.I)
    html=html.replace('https://mingeagle.com/','https://www.mingeagle.com/')
    path.write_text(html,encoding='utf-8')
for filename in ('sitemap.xml','robots.txt'):
    path=root/filename
    content=path.read_text(encoding='utf-8').replace('https://mingeagle.com/','https://www.mingeagle.com/')
    path.write_text(content,encoding='utf-8')
print('Canonical, sitemap, robots URLs now match www.mingeagle.com.')
