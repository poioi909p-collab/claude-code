# build.py <page-key> <db-block-url>... : 페이지 md 전체, [[VIEW:k]] → 생성 순서대로의 <database> 태그
import json, re, sys
sys.path.insert(0, sys.argv[0].rsplit('/', 1)[0]); from nmd import convert
m = json.load(open('pages/manifest.json')); ids = json.load(open('out/ids.json'))
p = next(x for x in m['pages'] if x['key'] == sys.argv[1])
src = open('pages/' + p['file']).read(); urls = iter(sys.argv[2:])
def tag(mm):
    v = m['views'][mm[2]]; v = m['views'].get(v.get('same_as'), v) if 'same_as' in v else v
    return f'{mm[1]}<database url="{next(urls)}" data-source-url="collection://{ids["dbs"][v["db"]]["ds"]}" inline="true"></database>'
src = re.sub(r'^(\t*)\[\[VIEW:([\w.]+)\]\]$', tag, src, flags=re.M)
assert next(urls, None) is None, 'url 개수 불일치'
print(convert(src))
