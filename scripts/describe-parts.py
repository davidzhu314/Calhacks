"""
Adds visual_description to every part of a pre-read manual (public/steps/<id>.json) WITHOUT changing anything else.

Re-reads each page with /api/extract (which now returns visual_description), then copies the description onto the
matching existing part: same page, same step (number + sub, in order), same part (by position when the part lists
line up, otherwise by closest name). Steps, boxes, instructions and part lists stay exactly as they were, so the
tuned demo data (holograms, step boxes) can't shift.

Usage (needs PyMuPDF and the dev server running with a Claude key):
  python scripts/describe-parts.py path/to/6455750.pdf --id 6455750 [--api http://localhost:3000]
"""

import argparse
import difflib
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import pymupdf

sys.path.insert(0, os.path.dirname(__file__))
from preread import extract, render  # same page rendering (with the measuring grid) as the original read


def key(step):
    return (step.get("number"), step.get("sub"), bool(step.get("continued")))


def match_parts(old_parts, new_parts):
    """Pairs each old part with a new one: by position if the lists line up, else by closest name."""
    if len(old_parts) == len(new_parts):
        return list(zip(old_parts, new_parts))
    pairs, used = [], set()
    for op in old_parts:
        best, score = None, 0.0
        for j, np_ in enumerate(new_parts):
            if j in used:
                continue
            s = difflib.SequenceMatcher(None, op.get("name", "").lower(), np_.get("name", "").lower()).ratio()
            if op.get("studsX") and op.get("studsX") == np_.get("studsX") and op.get("studsY") == np_.get("studsY"):
                s += 0.3
            if s > score:
                best, score = j, s
        if best is not None and score >= 0.45:
            used.add(best)
            pairs.append((op, new_parts[best]))
    return pairs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--id", required=True)
    ap.add_argument("--api", default="http://localhost:3000")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    path = f"public/steps/{args.id}.json"
    with open(path) as f:
        data = json.load(f)
    pages = data["pages"]
    todo = [k for k, steps in pages.items() if steps]

    doc = pymupdf.open(args.pdf)
    images = {k: render(doc, int(k) - 1) for k in todo}  # render first (PyMuPDF isn't thread-safe)

    fresh, failed = {}, []

    def work(k):
        try:
            fresh[k] = extract(args.api, images[k])
        except Exception as e:
            failed.append(k)
            print(f"page {k}: failed ({e})", flush=True)

    with ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(work, todo))

    total = described = 0
    unmatched = []
    for k in todo:
        new_by_key, new_by_number = {}, {}
        for s in fresh.get(k, []):
            new_by_key.setdefault(key(s), []).append(s)
            new_by_number.setdefault(s.get("number"), []).append(s)
        for step in pages[k]:
            # Same step and close-up; else the same step number in order (close-ups are sometimes split differently).
            candidates = new_by_key.get(key(step)) or []
            new_step = candidates.pop(0) if candidates else None
            if not new_step:
                pool = new_by_number.get(step.get("number")) or []
                new_step = pool.pop(0) if pool else None
            elif new_step in new_by_number.get(step.get("number"), []):
                new_by_number[step.get("number")].remove(new_step)
            for op in step["parts"]:
                total += 1
            if not new_step:
                unmatched.append(f"page {k} step {step.get('number')}{'/' + step['sub'] if step.get('sub') else ''}: no matching step")
                continue
            for op, np_ in match_parts(step["parts"], new_step.get("parts", [])):
                desc = np_.get("visual_description")
                if desc:
                    op["visual_description"] = desc
                    described += 1
            missing = [p["name"] for p in step["parts"] if not p.get("visual_description")]
            if missing:
                unmatched.append(f"page {k} step {step.get('number')}: no description for {', '.join(missing)}")

    with open(path, "w") as f:
        json.dump(data, f)
    print(f"Described {described}/{total} parts on {len(todo)} pages; failed pages: {failed or 'none'}")
    for line in unmatched:
        print("  " + line)


if __name__ == "__main__":
    main()
