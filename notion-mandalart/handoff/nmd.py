"""repo md (탭 들여쓰기 + <details>) → Notion-flavored Markdown.
segments(): [[VIEW:k]] 기준으로 나눠 [("md", text), ("view", key), ...] 반환."""
import json, re, sys
ids = json.load(open('out/ids.json'))
PAGE = lambda k: 'https://app.notion.com/p/' + ids['pages'][k].replace('-', '')
man = json.load(open('pages/manifest.json'))
BTN = {k: man['buttons'].get(v.get('same_as'), v) for k, v in man['buttons'].items()}
OPEN = re.compile(r'^<(callout|columns|column|toggle|table)\b[^>]*>$')
CLOSE = re.compile(r'^</(callout|columns|column|toggle|table)>$')
LIST = re.compile(r'^(- |\d+\. |- \[[ x]\] )')

def inline(s):
    s = re.sub(r'\{\{page:(\w+)\}\}', lambda m: f'<mention url="{PAGE(m.group(1))}" />', s)
    m = re.match(r'^(#{1,4}) (.*?) \{color="(\w+)"\}$', s)
    if m: s = f'<h{len(m.group(1))} color="{m.group(3)}">{m.group(2)}</h{len(m.group(1))}>'
    if '[[BUTTON:' in s:
        labels = [BTN[k]['label'] for k in re.findall(r'\[\[BUTTON:([\w.]+)\]\]', s)]
        rest = re.sub(r'\[\[BUTTON:[\w.]+\]\]', '', s).strip()
        s = (rest + '\n\n' if rest else '') + '<callout icon="🔘" color="gray_bg">\n버튼 자리 (노션에서 /버튼 으로 추가): ' + ' · '.join(f'**{l}**' for l in labels) + '\n</callout>'
    return s

def convert(src):
    lines = [l.rstrip() for l in src.split('\n')]
    # details/summary → toggle
    out, i = [], 0
    for l in lines:
        t = l.lstrip('\t'); ind = l[:len(l) - len(t)]
        m = re.match(r'^<details>$', t)
        if m: out.append(ind + '<toggle>'); continue
        m = re.match(r'^<summary>(.*)</summary>$', t)
        if m: out.append(ind + '\t' + re.sub(r'^(\d+)\. ', r'\1\\. ', m.group(1))); continue
        if t == '</details>': out.append(ind + '</toggle>'); continue
        out.append(l)
    # dedent + blank lines between blocks
    res, prev, intable, title = [], None, 0, False
    for l in out:
        t = l.lstrip('\t')
        if not t: continue
        joined = prev is not None and (OPEN.match(prev) or CLOSE.match(t) or intable or (not title and LIST.match(prev) and LIST.match(t)))
        title = bool(prev and prev.startswith("<toggle"))  # 토글 첫 줄만 제목
        if t.startswith('<table'): intable += 1
        if t.startswith('</table'): intable -= 1
        t = inline(t)
        res.append(t if (prev is None or joined) else '\n' + t)
        prev = t.split('\n')[-1]
    return '\n'.join(res)

def segments(src):
    # 뷰가 들어 있는 columns 는 풀어서 순서대로
    def unwrap(m):
        body = m.group(0)
        return re.sub(r'^\t*</?columns?>\n', '', body, flags=re.M) if '[[VIEW:' in body else body
    src = re.sub(r'^\t*<columns>\n.*?^\t*</columns>\n?', unwrap, src, flags=re.M | re.S)
    parts = re.split(r'^\t*\[\[VIEW:([\w.]+)\]\]$', src, flags=re.M)
    seg = []
    for j, p in enumerate(parts):
        if j % 2: seg.append(('view', p))
        elif p.strip(): seg.append(('md', convert(p)))
    return seg

if __name__ == '__main__':
    for kind, v in segments(open(sys.argv[1]).read()):
        print(f'===== {kind}'); print(v)
