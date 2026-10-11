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

# Earlier generators may append www and apex entries for the same path.
sitemap=root/'sitemap.xml'
xml=sitemap.read_text(encoding='utf-8')
seen=set()
def keep_unique(match):
    block=match.group(0)
    url=re.search(r'<loc>([^<]+)</loc>',block)
    if url is None:return block
    canonical=url.group(1)
    if canonical in seen:return ''
    seen.add(canonical)
    return block
xml=re.sub(r'<url>\s*<loc>[^<]+</loc>[\s\S]*?</url>',keep_unique,xml)
sitemap.write_text(xml,encoding='utf-8')

print('Canonical, sitemap, robots URLs now match www.mingeagle.com.')
