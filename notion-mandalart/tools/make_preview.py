#!/usr/bin/env python3
"""out/simulated.json → out/preview.html (디자인 미리보기). 속성명 공백은 JS 접근용으로 _ 로 바꾼다."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "out" / "simulated.json").read_text(encoding="utf-8"))
tpl = (ROOT / "preview" / "template.html").read_text(encoding="utf-8")

keys = set()


def norm(k):
    return re.sub(r"[ \-()]", "_", k)


def walk(o):
    if isinstance(o, dict):
        out = {}
        for k, v in o.items():
            if norm(k) != k:
                keys.add(k)
            out[norm(k)] = walk(v)
        return out
    if isinstance(o, list):
        return [walk(x) for x in o]
    return o


slim = walk(data)
for k in sorted(keys, key=len, reverse=True):
    tpl = tpl.replace("." + k, "." + norm(k))
html = tpl.replace("__DATA__", json.dumps(slim, ensure_ascii=False, separators=(",", ":")))
(ROOT / "out" / "preview.html").write_text(html, encoding="utf-8")
print("out/preview.html", len(html.encode()), "bytes; 변환한 키", len(keys))
