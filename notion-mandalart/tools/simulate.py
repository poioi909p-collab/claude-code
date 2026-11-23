#!/usr/bin/env python3
"""샘플 데이터로 핵심 수식을 파이썬으로 다시 계산한다 (노션 수식 로직 교차 검증 + 미리보기 데이터).

tools/schema.py 의 수식과 같은 규칙을 그대로 옮겼다. 노션에 만든 뒤 같은 기준일로
노션 값과 out/simulated.json 값을 비교하면 수식이 의도대로 동작하는지 확인할 수 있다.

    python3 tools/simulate.py            # out/sample_mandalart.json 의 base_date 기준
"""
import calendar
import datetime as dt
import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
ANCHOR = dt.date(2024, 1, 1)  # 월요일


def add_months(d, n):  # Notion dateAdd(…,"months"): 말일 넘으면 그 달 말일
    y, m = divmod(d.month - 1 + n, 12)
    y += d.year
    m += 1
    return dt.date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def months_between(a, b):  # dateBetween(a, b, "months") — 꽉 찬 달 수
    n = (a.year - b.year) * 12 + (a.month - b.month)
    if a.day < b.day:
        n -= 1
    return n


def P(s):
    return dt.date.fromisoformat(s) if s else None


def main():
    data = json.loads((OUT / "sample_mandalart.json").read_text(encoding="utf-8"))
    today = P(data["base_date"])
    dow = (today - ANCHOR).days % 7

    M = {m["key"]: dict(m) for m in data["mandalarts"]}
    for m in M.values():
        s = P(m["시작일"])
        m["종료일"] = add_months(s, 6 if m["기간 모드"] == "6개월" else 12) - dt.timedelta(days=1)
        total = (m["종료일"] - s).days + 1
        el = (today - s).days + 1
        m["시간 경과율"] = round(min(max(el / total, 0), 1) * 100)
        ref = m["종료일"] if today > m["종료일"] else today
        m["경과 월"] = max(months_between(ref, s), 0)

    logs_by_action = defaultdict(list)
    for lg in data["logs"]:
        d = P(lg["날짜"])
        logs_by_action[lg["실천항목"][0]].append({"경과일": (today - d).days, "일자": d.isoformat(), "수행량": lg.get("수행량") or 0})

    G = {g["key"]: dict(g) for g in data["goals"]}
    A = {}
    for a in data["actions"]:
        a = dict(a)
        g = G[a["세부목표"][0]]
        m = M[g["만다라트"][0]]
        s, r = P(m["시작일"]), P(a.get("재시작일"))
        base = r if r and r > s else s
        end = m["종료일"]
        freq = a["빈도"]
        wk = 7 if freq == "매일" else (a.get("월간 목표 횟수", 1) / 4.345 if freq == "월 n회" else
                                     (3 if a["유형"] == "마음가짐" and not a.get("주간 목표 횟수") else a.get("주간 목표 횟수") or 1))
        L = [x for x in logs_by_action[a["key"]] if x["경과일"] >= 0]
        uniq = lambda xs: len({x["일자"] for x in xs})  # noqa: E731
        r7 = uniq([x for x in L if x["경과일"] < 7])
        r30 = uniq([x for x in L if x["경과일"] < 30])
        tw = uniq([x for x in L if x["경과일"] <= dow])
        tm = uniq([x for x in L if x["일자"][:7] == today.isoformat()[:7]])
        lim = (today - base).days
        cum = uniq([x for x in L if x["경과일"] <= lim])
        amt = sum(x["수행량"] for x in L if x["경과일"] <= lim)
        offs = sorted({x["경과일"] for x in L})
        gap = offs[0] if offs else max((today - base).days, 0)
        st = 0 if 0 in offs else 1
        streak = len([o for i, o in enumerate(offs) if o == i + st])
        period_target = round(wk * ((end - base).days + 1) / 7)
        el = min((today - base).days + 1, (end - base).days + 1)
        due_target = round(wk * max(el, 0) / 7 * 10) / 10
        active = a.get("활성 상태", "활성") == "활성"
        if a["유형"] == "미션":
            rate = 100 if a.get("완료") else 0  # 샘플 미션엔 연결된 할 일 완료율이 섞이지만 미리보기에선 0/100으로 단순화
        elif a["유형"] == "마음가짐":
            rate = round(min(r30 / 12, 1) * 100)
        else:
            rate = 0 if period_target <= 0 else round(min(cum / period_target, 1) * 100)
        # 최근 상태
        stt = a.get("활성 상태", "활성")
        if stt in ("쉬는 중", "교체됨"):
            state = "⏸️"
        elif stt == "졸업":
            state = "🎓"
        elif a["유형"] == "미션":
            dl = P(a.get("기한"))
            state = "✅" if a.get("완료") else ("🔴" if dl and today > dl else ("🟨" if rate > 0 else "⬜"))
        elif gap >= max(14, math.ceil(10.5 / wk)):
            state = "💤"
        elif a["유형"] == "마음가짐":
            state = "🟩" if r7 >= 3 else ("🟨" if r7 >= 1 else "⬜")
        elif freq == "월 n회":
            state = "🟩" if r30 >= a.get("월간 목표 횟수", 1) else ("🟨" if r30 >= 1 else "⬜")
        else:
            state = "🟩" if r7 >= math.ceil(min(wk, 7) * 0.8) else ("🟨" if r7 >= 1 else "⬜")
        # 오늘 할 차례
        monthly = freq == "월 n회"
        mleft = (add_months(today.replace(day=1), 1) - dt.timedelta(days=1) - today).days + 1
        need = (a.get("월간 목표 횟수", 1) - tm) if monthly else (math.ceil(wk) - tw)
        left = mleft if monthly else 7 - dow
        today_done = 0 in offs
        if not active:
            todo = ""
        elif a["유형"] == "미션":
            dl = P(a.get("기한"))
            if a.get("완료") or not dl:
                todo = ""
            else:
                rr = (dl - today).days
                todo = "🔴 기한 지남" if rr < 0 else ("📌 오늘 마감" if rr == 0 else (f"📌 기한 D-{rr}" if rr <= 7 else ""))
        elif today_done:
            todo = "✅ 오늘 완료"
        elif a["유형"] == "마음가짐":
            todo = "🧘 오늘 한 번 떠올리기"
        elif need <= 0:
            todo = "😌 이번 달 목표 달성" if monthly else "😌 이번 주 목표 달성"
        elif need >= left:
            todo = "🔥 오늘 꼭"
        else:
            todo = f"🙂 여유 · {need}회 남음 / {left}일"
        signal = ""
        if active and state == "💤":
            signal = f"💤 {gap}일 멈춤 → 최소 행동으로 다시 시작"
        elif active and a["유형"] == "습관" and due_target >= 4 and cum / due_target < 0.4:
            signal = "📉 목표 대비 40% 미만 → 빈도 낮추기 검토"
        a.update({"주간(계산)": round(wk, 2), "최근 7일": r7, "이번 주": tw, "누적": cum, "누적 수행량": amt, "공백": gap,
                  "연속": streak, "기간 목표 횟수": period_target, "경과 목표 횟수": due_target, "달성률": rate,
                  "최근 상태": state, "오늘 할 차례": todo, "재설계 신호": signal, "활성": active,
                  "자동 분해": (f"📆 기간 {period_target}회 → 월 {round(wk * 4.345)}회 → 주 {round(wk * 10) / 10:g}회 → 오늘 {todo or '—'}"
                              if a["유형"] == "습관" else "")})
        A[a["key"]] = a

    for g in G.values():
        acts = sorted([a for a in A.values() if a["세부목표"][0] == g["key"]], key=lambda x: x["위치"])
        g["actions"] = [a["key"] for a in acts]
        cur = sum(a["누적 수행량"] for a in acts if a.get("수치 집계"))
        g["현재치"] = cur
        act = [a for a in acts if a["활성"]]
        if g["구분"] == "중심":
            g["달성률"] = 0
        elif g.get("목표치"):
            g["달성률"] = round(min(cur / g["목표치"], 1) * 100)
        else:
            g["달성률"] = round(sum(a["달성률"] for a in act) / len(act)) if act else 0
        g["방치 칸 수"] = sum(1 for a in acts if a["최근 상태"] == "💤")
        habits = [a for a in act if a["유형"] == "습관"]
        g["이번 주"] = f"이번 주 {sum(min(a['이번 주'], math.ceil(a['주간(계산)'])) for a in habits)}/{sum(math.ceil(a['주간(계산)']) for a in habits)}회"
        if g.get("목표치"):
            m = M[g["만다라트"][0]]
            days = (m["종료일"] - today).days + 1
            rem = g["목표치"] - cur
            g["자동 분해"] = f"남은 {rem}{g['단위']} → 월 {round(rem / days * 304) / 10:g}{g['단위']} · 주 {round(rem / days * 70) / 10:g}{g['단위']} · 오늘 {round(rem / days * 10) / 10:g}{g['단위']}"

    snaps = defaultdict(dict)
    for r in data["retros"]:
        if r.get("누적 달성률"):
            m = M[r["만다라트"][0]]
            snaps[m["key"]][max(months_between(P(r["기간"]["end"]), P(m["시작일"])), 0)] = r["누적 달성률"]

    for m in M.values():
        gs = [g for g in G.values() if g["만다라트"][0] == m["key"] and g["구분"] != "중심"]
        m["전체 달성률"] = m.get("기록된 달성률") or (round(sum(g["달성률"] for g in gs) / len(gs)) if gs else 0)
    for m in M.values():
        d = m["전체 달성률"] - m["시간 경과율"]
        m["페이스"] = ("🏁 종료 · 최종 %d%%" % m["전체 달성률"]) if m["상태"] in ("완료", "보관") else (
            f"🚀 앞서가는 중 (+{d}%p)" if d >= 5 else ("👍 페이스 유지" if d > -5 else f"⚠️ 뒤처짐 ({abs(d)}%p)"))
        r = (m["종료일"] - today).days
        m["D-day"] = f"D-{r}" if r > 0 else ("D-DAY" if r == 0 else f"종료 +{abs(r)}일")
        prev = M.get((m.get("이전 만다라트") or [None])[0])
        if prev:
            b = snaps[prev["key"]].get(m["경과 월"])
            m["작년 이맘때 비교"] = (f"같은 시점({m['경과 월'] + 1}개월 차) {b}% → 지금 {m['전체 달성률']}%  " +
                               (f"▲ {m['전체 달성률'] - b}%p" if m["전체 달성률"] >= b else f"▼ {b - m['전체 달성률']}%p")) if b else \
                f"이전 최종 {prev['전체 달성률']}% · 지금 {m['전체 달성률']}%"
        acts = [a for g in G.values() if g["만다라트"][0] == m["key"] for a in (A[k] for k in g["actions"])]
        hab = [a for a in acts if a["유형"] == "습관" and a["활성"]]
        goal = sum(a["경과 목표 횟수"] for a in hab)
        m["습관 유지율"] = round(min(sum(a["누적"] for a in hab) / goal, 1) * 100) if goal else 0
        m["방치 칸"] = sum(1 for a in acts if a["최근 상태"] == "💤")
        m["재시작 합계"] = sum(a.get("재시작 횟수", 0) for a in acts)
        m["회고 수"] = sum(1 for r in data["retros"] if r["만다라트"][0] == m["key"])
        for k in ("종료일",):
            m[k] = m[k].isoformat()

    DESIGN = ["목표가 모호했다", "측정할 수 없었다", "너무 컸다", "너무 많았다", "최소 행동이 없었다"]
    EXEC = ["기록·확인을 안 했다", "한 번 빠지고 무너졌다", "동기가 사라졌다", "회고를 안 했다"]
    lessons = []
    for l in data["lessons"]:
        c = l["실패 원인"]
        d, x = sum(1 for v in c if v in DESIGN), sum(1 for v in c if v in EXEC)
        v = len(c) - d - x
        main_ = "🧩 설계 문제" if d >= x and d >= v and d else ("🏃 실행 문제" if x >= v and x else ("🌦 환경 문제" if v else "—"))
        lessons.append({**l, "설계": d, "실행": x, "환경": v, "주원인": main_,
                        "반영": bool(l.get("반영할 만다라트") or l.get("반영한 세부목표"))})

    out = {"base_date": data["base_date"], "dow": dow, "mandalarts": list(M.values()), "goals": list(G.values()),
           "actions": list(A.values()), "lessons": lessons,
           "todos": [t for t in data["todos"] if t["날짜"] == data["base_date"]],
           "overdue": [t for t in data["todos"] if not t["완료"] and t["날짜"] < data["base_date"]]}
    (OUT / "simulated.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    now = M["M_NOW"]
    print(f"기준일 {today} (요일 index {dow})")
    print(f"지금 만다라트: 전체 {now['전체 달성률']}% · 시간 {now['시간 경과율']}% · {now['페이스']} · {now['D-day']} · {now.get('작년 이맘때 비교')}")
    print(f"습관 유지율 {now['습관 유지율']}% · 방치 {now['방치 칸']}칸 · 재시작 {now['재시작 합계']} · 회고 {now['회고 수']}")
    for g in sorted(G.values(), key=lambda x: x["위치"]):
        if g["구분"] == "중심":
            continue
        cells = " ".join(A[k]["최근 상태"] for k in g["actions"])
        print(f"  {g['위치']} {g['짧은 이름']:<6} {g['달성률']:>3}%  {cells}  💤{g['방치 칸 수']}")
    from collections import Counter
    print("오늘 할 차례:", dict(Counter(a["오늘 할 차례"].split(" ·")[0] for a in A.values() if a["오늘 할 차례"])))


if __name__ == "__main__":
    main()
