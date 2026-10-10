from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data" / "site-content.json"


def fail(message: str) -> None:
    raise SystemExit(f"CONTENT VALIDATION FAILED: {message}")


def main() -> None:
    if not DATA.exists():
        fail(f"missing {DATA.relative_to(ROOT)}")
    data = json.loads(DATA.read_text(encoding="utf-8"))
    for key in ["schemaVersion", "brand", "products", "homepage", "faq", "settings"]:
        if key not in data:
            fail(f"missing top-level key: {key}")
    brand = data["brand"]
    for key in ["name", "company", "email", "whatsapp", "domain"]:
        if not str(brand.get(key, "")).strip():
            fail(f"brand.{key} is empty")
    products = data["products"]
    if not isinstance(products, list) or not products:
        fail("products must be a non-empty list")
    ids, slugs, pages = set(), set(), set()
    for i, p in enumerate(products, 1):
        for key in ["id", "slug", "page", "name", "short", "sizes", "colors", "bestFor", "heroImage", "status", "sort"]:
            if key not in p:
                fail(f"product #{i} missing {key}")
        if p["id"] in ids: fail(f"duplicate id: {p['id']}")
        if p["slug"] in slugs: fail(f"duplicate slug: {p['slug']}")
        if p["page"] in pages: fail(f"duplicate page: {p['page']}")
        ids.add(p["id"]); slugs.add(p["slug"]); pages.add(p["page"])
        if p["status"] not in {"published", "draft", "hidden"}:
            fail(f"invalid status for {p['id']}: {p['status']}")
        if not isinstance(p["sizes"], list) or not p["sizes"]:
            fail(f"{p['id']} needs at least one size")
        if not isinstance(p["colors"], list) or not p["colors"]:
            fail(f"{p['id']} needs at least one color")
        hero = ROOT / "public" / p["heroImage"]
        if not hero.exists():
            fail(f"hero image does not exist for {p['id']}: {p['heroImage']}")
        hi = str(p.get("highlightImage", "")).strip()
        if hi and not (ROOT / "public" / hi).exists():
            fail(f"highlight image does not exist for {p['id']}: {hi}")
    featured = data["homepage"].get("featuredProductIds", [])
    missing = [x for x in featured if x not in ids]
    if missing:
        fail("homepage references unknown product ids: " + ", ".join(missing))
    print(f"PASS: schema={data['schemaVersion']} products={len(products)} faq={len(data['faq'])}")


if __name__ == "__main__":
    main()
