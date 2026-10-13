#!/usr/bin/env python3
"""Post-deployment, first-party HTTP crawl/readability audit for all public URLs.

A synthetic User-Agent is only an HTTP fetch test, NEVER evidence of actual
Googlebot/Bingbot/OAI-SearchBot/PerplexityBot/Claude-SearchBot visits.
Google indexing and AI citations require independent platform evidence.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1] / "public"
HOST = "www.mingeagle.com"
BASE = "https://" + HOST
EXPECTED = {"sitemap.xml": 25, "sitemap-localized.xml": 4}
PAGE_AGENT = "MING-EAGLE-public-crawl-audit/1.0 (+site reliability)"
BOT_PROBES = [
    "Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot",
]
OUTFILE = Path("public-crawl-audit.json")
MAX_BYTES = 1024 * 1024
TIMEOUT = 18


def sitemap_urls():
    urls = []
    for name, count in EXPECTED.items():
        source = ROOT / name
        if not source.is_file():
            raise ValueError("Missing public sitemap: " + name)
        nodes = ET.fromstring(source.read_bytes())
        paths = [node.text for node in nodes.findall(".//{*}loc")]
        if len(paths) != count:
            raise ValueError(f"{name}: expected {count} URLs, found {len(paths)}")
        for url in paths:
            if not isinstance(url, str):
                raise ValueError("Empty sitemap location")
            parsed = urlparse(url)
            if (parsed.scheme != "https" or parsed.netloc != HOST
                    or parsed.query or parsed.fragment or parsed.username
                    or parsed.password or parsed.port):
                raise ValueError("Off-site or parameterized sitemap URL: " + url)
            if not re.fullmatch(r"/(?:[a-z0-9-]+\.html)?", parsed.path):
                raise ValueError("Nonpublic sitemap URL: " + url)
            fname = "index.html" if parsed.path == "/" else parsed.path[1:]
            if not (ROOT / fname).is_file():
                raise ValueError("Sitemap target absent in release: " + fname)
            urls.append(url)
    if len(set(urls)) != len(urls):
        raise ValueError("Duplicate URL across public sitemaps")
    robots = (ROOT / "robots.txt").read_text(encoding="utf8")
    for name in EXPECTED:
        if f"Sitemap: {BASE}/{name}" not in robots:
            raise ValueError("robots.txt omits " + name)
    return urls


class SeoHead(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_head = False
        self.in_title = False
        self.title = ""
        self.canonicals = []
        self.meta_robots = []
        self.lang = None
        self.h1_count = 0

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "html":
            self.lang = d.get("lang")
        if tag == "head":
            self.in_head = True
        if tag == "h1":
            self.h1_count += 1
        if tag == "title" and self.in_head:
            self.in_title = True
        if not self.in_head:
            return
        if tag == "link" and "canonical" in (d.get("rel") or "").lower().split():
            self.canonicals.append(d.get("href"))
        if tag == "meta" and (d.get("name") or "").lower() in (
                "robots", "googlebot", "bingbot", "oai-searchbot", "perplexitybot", "claude-searchbot"):
            self.meta_robots.append(d.get("content") or "")

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data


def inspect_html(url, body, x_robots=""):
    parser = SeoHead()
    parser.feed(body)
    problems = []
    if parser.canonicals != [url]:
        problems.append("canonical_mismatch")
    if not parser.title.strip():
        problems.append("missing_title")
    if parser.h1_count != 1:
        problems.append("h1_count_not_one")
    directives = [x_robots, *parser.meta_robots]
    if any(re.search(r"(?i)(^|[\s,])(?:noindex|none)(?=$|[\s,])", d) for d in directives):
        problems.append("noindex_directive")
    if not parser.lang:
        problems.append("missing_html_lang")
    expected_language = {
        "-de.html": "de", "-fr.html": "fr", "-es.html": "es", "-pt.html": "pt"
    }
    for suffix, language in expected_language.items():
        if url.endswith("school-sports-equipment" + suffix) and parser.lang != language:
            problems.append("localized_language_mismatch")
    return problems, {"canonical": parser.canonicals, "lang": parser.lang, "h1Count": parser.h1_count}


def fetch(url, agent=PAGE_AGENT):
    request = urllib.request.Request(url, headers={
        "User-Agent": agent,
        "Cache-Control": "no-cache",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    })
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        body = response.read(MAX_BYTES + 1)
        return {
            "status": response.status,
            "finalUrl": response.geturl(),
            "contentType": response.headers.get("Content-Type", ""),
            "xRobots": response.headers.get("X-Robots-Tag", ""),
            "body": body,
        }


def probe(url, agent=PAGE_AGENT):
    last = None
    for attempt in range(2):
        try:
            r = fetch(url, agent)
            errors = []
            if r["status"] != 200:
                errors.append("non_200_http")
            if r["finalUrl"] != url:
                errors.append("unexpected_redirect")
            if "text/html" not in r["contentType"].lower():
                errors.append("non_html_content_type")
            if len(r["body"]) < 250:
                errors.append("empty_or_tiny_html")
            if len(r["body"]) > MAX_BYTES:
                errors.append("html_larger_than_1mb")
            if not errors:
                html = r["body"].decode("utf-8", errors="replace")
                metadata_errors, metadata = inspect_html(url, html, r["xRobots"])
                errors.extend(metadata_errors)
            else:
                metadata = {}
            return {"url": url, "agent": agent, "status": r["status"], "bytes": len(r["body"]),
                    "errors": errors, **metadata}
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = str(exc)[:220]
            if attempt == 0:
                time.sleep(0.8)
    return {"url": url, "agent": agent, "status": None, "errors": ["fetch_failed"],
            "errorDetail": last}


def main():
    urls = sitemap_urls()
    print(f"Auditing all {len(urls)} public sitemap URLs on live {BASE}.", flush=True)
    with ThreadPoolExecutor(max_workers=4) as workers:
        tasks = {workers.submit(probe, url): url for url in urls}
        pages = [future.result() for future in as_completed(tasks)]
    pages.sort(key=lambda r: r["url"])
    # UA-only probes are DIAGNOSTIC. A forged User-Agent cannot prove a verified bot visit
    # and bot-management products may treat synthetic and official crawlers differently.
    scenarios = [
        BASE + "/quiet-indoor-sports-for-kids.html",
        BASE + "/indoor-school-sports-equipment-guide.html",
    ]
    with ThreadPoolExecutor(max_workers=3) as workers:
        tasks = {workers.submit(probe, url, agent): (url, agent)
                 for url in scenarios for agent in BOT_PROBES}
        synthetic = [f.result() for f in as_completed(tasks)]
    synthetic.sort(key=lambda r: (r["url"], r["agent"]))
    failed = [p for p in pages if p["errors"]]
    limited = [p for p in synthetic if p["errors"]]
    result = {
        "runAtUTC": datetime.now(timezone.utc).isoformat(),
        "site": BASE + "/",
        "source": "first-party HTTPS read-after-GitHub-Pages-deploy",
        "sitemapPages": len(urls),
        "normalUserAgentReadable": len(urls) - len(failed),
        "normalUserAgentFailures": len(failed),
        "syntheticAgentTests": len(synthetic),
        "syntheticAgentWarnings": len(limited),
        "verifiedCrawlerTraffic": "NOT_OBSERVED",
        "indexedInGoogle": "NOT_INFERRED",
        "aiCitations": "NOT_MEASURED",
        "pages": pages,
        "syntheticAgentProbes": synthetic,
    }
    OUTFILE.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    for page in failed:
        print("FAIL", page["url"], ",".join(page["errors"]), flush=True)
    for page in limited:
        print("WARNING synthetic UA probe:", page["agent"], page["url"],
              ",".join(page["errors"]), flush=True)
    print(f"LIVE CRAWL AUDIT: {len(pages)-len(failed)}/{len(pages)} website pages "
          f"valid; {len(limited)}/{len(synthetic)} synthetic UA probes need review. "
          "Neither result proves bot visits, indexing or AI citation.", flush=True)
    return 1 if failed else 0


def self_test():
    sample = '<html lang="en"><head><title>Test Page</title><link rel="canonical" href="https://www.mingeagle.com/products.html"></head><body><h1>Real product</h1></body></html>'
    url = BASE + "/products.html"
    assert inspect_html(url, sample)[0] == []
    assert "canonical_mismatch" in inspect_html(url, sample.replace("products.html", "elsewhere.html"))[0]
    assert "noindex_directive" in inspect_html(url, sample, "noindex, follow")[0]
    assert "noindex_directive" in inspect_html(url, sample.replace("</head>", '<meta name="robots" content="noindex"></head>'))[0]
    assert "h1_count_not_one" in inspect_html(url, sample.replace("<h1>Real product</h1>", ""))[0]
    assert "missing_title" in inspect_html(url, sample.replace("<title>Test Page</title>", ""))[0]
    assert sitemap_urls() and len(sitemap_urls()) == 29
    assert "localized_language_mismatch" in inspect_html(
        BASE + "/school-sports-equipment-fr.html", sample)[0]
    print("PASS: offline crawl audit rejects wrong canonical, noindex header/meta, missing H1/title,"
          " incorrect translated page language, and validates both 29-URL sitemaps.")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv else main())
