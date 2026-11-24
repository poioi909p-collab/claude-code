# manifest + pages/*.md -> ops.json: per page, ordered md segments and create-view args
import json, re, sys
sys.path.insert(0, sys.argv[1]); from nmd import segments
sys.path.insert(0, 'tools'); from schema import DBS
m = json.load(open('pages/manifest.json')); ids = json.load(open('out/ids.json'))
V = m['views']

def val(x, db, prop):
    x = x.strip()
    if x == 'true': return 'TRUE'
    if x == 'false': return 'FALSE'
    if re.fullmatch(r'-?\d+(\.\d+)?', x): return x
    return '"' + x + '"'

def cond(c, db):
    c = c.strip()
    if c == '날짜 = Today': return '"날짜" = "today"'
    # 수식 체크박스·숫자는 API 필터가 안 돼서 텍스트 수식 "필터용"으로 우회
    if c == '날짜 = This week': return '"필터용" = "이번 주"' if db == 'todos' else '"필터용" = "이번주"'
    if c in ('현재 = true', '활성 = true'): return '"필터용" CONTAINS "%s"' % c.split()[0]
    if c == '오늘 순서 <= 4': return '"필터용" CONTAINS "오늘"'
    if c == '날짜 is within past month': return '"날짜" >= "one_month_ago"'
    mm = re.fullmatch(r'(.+?) is (not )?empty', c)
    if mm: return f'"{mm[1]}" IS {"NOT " if mm[2] else ""}EMPTY'
    mm = re.fullmatch(r'(.+?) is any of \[(.+)\]', c)
    if mm: return f'"{mm[1]}" IN (' + ', '.join('"%s"' % s.strip() for s in mm[2].split(',')) + ')'
    mm = re.fullmatch(r'(.+?) (=|!=|<=|>=|<|>) (.+)', c)
    assert mm, c
    return f'"{mm[1]}" {mm[2]} {val(mm[3], db, mm[1])}'

def view(key):
    v = dict(V[key])
    if 'same_as' in v: v = {**V[v['same_as']], **{k: x for k, x in v.items() if k != 'same_as'}}
    db, lay = v['db'], v['layout']
    d = []
    if v.get('filter'): d.append('FILTER ' + ' AND '.join(cond(c, db) for c in v['filter'].split(' AND ')))
    if v.get('sort'): d.append('SORT BY ' + ', '.join('"%s" %s' % tuple(s.strip().rsplit(' ', 1)) for s in v['sort'].split(',')).replace(' asc', ' ASC').replace(' desc', ' DESC'))
    if lay == 'chart':
        d += ['GROUP BY "핵심목표"', 'CHART bar AGGREGATE sum ON "전체 달성률" COLOR colorful']
    elif v.get('group'): d.append(f'GROUP BY "{v["group"]}"')
    if lay == 'calendar': d.append(f'CALENDAR BY "{v["date"]}"')
    if lay == 'timeline':
        a, b = [s.strip() for s in v['date'].split('→')]; d.append(f'TIMELINE BY "{a}" TO "{b}"')
    # 버튼 속성은 API로 못 만듦 (체크리스트) → SHOW 에서 뺀다
    v['props'] = [x for x in v.get('props') or [] if (DBS[db]['props'].get(x) or {}).get('type') != 'button']
    if v.get('props'): d.append('SHOW ' + ', '.join(f'"{p}"' for p in v['props']))
    if lay == 'gallery':
        if v.get('card'): d.append('CARD SIZE ' + v['card'])
        if v.get('preview') not in (None, 'none'): d.append(f'COVER "{v["preview"]}"')
        if v.get('wrap') and v.get('props'): d.append('WRAP PROPERTIES true')
    return {'key': key, 'type': lay, 'name': v['name'], 'data_source_id': ids['dbs'][db]['ds'], 'configure': '; '.join(d)}

out = []
for p in m['pages']:
    pid = ids['pages'].get(p['key'])
    ops = [{'view': view(x)} if k == 'view' else {'md': x} for k, x in segments(open('pages/' + p['file']).read())]
    out.append({'key': p['key'], 'page_id': pid, 'ops': ops})
seen = {o['view']['key'] for p in out for o in p['ops'] if 'view' in o}
assert seen == set(V), set(V) ^ seen
json.dump(out, open(sys.argv[1] + '/ops.json', 'w'), ensure_ascii=False, indent=1)
for p in out: print(p['key'], p['page_id'], [('V:' + o['view']['key']) if 'view' in o else len(o['md']) for o in p['ops']])
