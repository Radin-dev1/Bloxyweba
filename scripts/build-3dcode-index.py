"""
Builds data/3dcode/index.json from the 3DCode dataset (https://huggingface.co/datasets/YipengGao/3DCode).

For each of the dataset's object categories it keeps:
  - up to 8 construction descriptions ("caption_create_3D_object"), used to retrieve
    structural references for every 3D generation, and
  - the object-specific part of one short Blender geometry script ("code_geo"), with the
    shared seed/helper boilerplate removed, used as a reference in Blender mode.

Usage:
  curl -L -o train.parquet https://huggingface.co/datasets/YipengGao/3DCode/resolve/main/3DCodeData/data/train.parquet
  python scripts/build-3dcode-index.py train.parquet
Needs pandas + pyarrow.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

MAX_CAPTIONS = 8
MAX_CAPTION_CHARS = 460
MAX_SCRIPT_CHARS = 6000
MIN_SCRIPT_CHARS = 400
BOILERPLATE_SHARE = 0.12  # a line in at least 12% of all scripts is shared infrastructure

src = Path(sys.argv[1] if len(sys.argv) > 1 else "train.parquet")
out = Path(__file__).resolve().parent.parent / "data" / "3dcode" / "index.json"

df = pd.read_parquet(src, columns=["factory", "caption_create_3D_object", "code_geo"])
df["cat"] = df.factory.str.replace(r"(_seed)?_?\d+$", "", regex=True).str.replace(r"Factory$", "", regex=True)


def words(cat: str) -> str:
    return re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", cat).lower()


def clean_caption(text: str) -> str:
    text = re.sub(r"\s*using (the )?Python Blender code\s*", " ", text or "", flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:MAX_CAPTION_CHARS].rsplit(" ", 1)[0] + "…" if len(text) > MAX_CAPTION_CHARS else text


def blocks(code: str) -> list[str]:
    """Top-level blocks: a def/class/statement plus its indented body (comments dropped)."""
    out: list[list[str]] = []
    for ln in (code or "").splitlines():
        if not ln.strip() or ln.lstrip().startswith("#"):
            continue  # also drops any instructions hidden in comments
        if ln[0] not in " \t" and not ln.startswith((")", "]", "}")) or not out:
            out.append([ln.rstrip()])
        else:
            out[-1].append(ln.rstrip())
    return ["\n".join(b) for b in out]


# Blocks shared by many scripts (seed setup, imports, generic helpers) are boilerplate.
block_counts: Counter = Counter()
for code in df.code_geo:
    block_counts.update(set(blocks(code)))
common = {b for b, n in block_counts.items() if n >= BOILERPLATE_SHARE * len(df)}


def specific_part(code: str) -> str:
    kept = [b for b in blocks(code) if b not in common and not b.startswith(("import ", "from "))]
    # Keep whole blocks from the end (the object's own assembly code) within the budget.
    picked: list[str] = []
    size = 0
    for b in reversed(kept):
        if size + len(b) > MAX_SCRIPT_CHARS:
            if not picked and len(b) > MAX_SCRIPT_CHARS:
                picked.append(b[:MAX_SCRIPT_CHARS].rsplit("\n", 1)[0] + "\n    ...")
            break
        picked.append(b)
        size += len(b) + 2
    return "\n\n".join(reversed(picked))


categories = []
for cat, rows in df.groupby("cat"):
    captions = []
    for c in rows.caption_create_3D_object:
        c = clean_caption(c)
        if c and c not in captions:
            captions.append(c)
        if len(captions) >= MAX_CAPTIONS:
            break
    best = None
    for code in rows.code_geo:
        part = specific_part(code)
        if len(part) >= MIN_SCRIPT_CHARS and (best is None or len(part) < len(best)):
            best = part
    entry = {"c": cat, "name": words(cat), "captions": captions}
    if best:
        entry["script"] = best
    categories.append(entry)

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(
    json.dumps(
        {
            "source": "https://huggingface.co/datasets/YipengGao/3DCode",
            "license": "Dataset card: MIT. Scripts derive from Infinigen (BSD-3-Clause); see NOTICE.md.",
            "categories": categories,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ),
    encoding="utf-8",
)
print(f"{len(categories)} categories, {sum(len(c['captions']) for c in categories)} captions, "
      f"{sum('script' in c for c in categories)} scripts, {out.stat().st_size / 1e6:.2f} MB -> {out}")
