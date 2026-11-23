# 수식 목록 (Formula 2.0)

> `tools/schema.py` 에서 생성. 생성 순서는 FORMULA_ORDER 를 따른다.

### 실행 기록 · 일자
```
formatDate(prop("날짜"), "YYYY-MM-DD")
```

### 실행 기록 · 경과일
```
if(empty(prop("날짜")), -1, dateBetween(today(), parseDate(formatDate(prop("날짜"), "YYYY-MM-DD")), "days"))
```

### 실행 기록 · 강도
```
if(prop("최소만 했음"), style("🌱 최소 행동", "green"), style("💪 완전 실행", "b", "green"))
```

### 만다라트 · 종료일
```
dateSubtract(dateAdd(prop("시작일"), if(prop("기간 모드") == "6개월", 6, 12), "months"), 1, "days")
```

### 만다라트 · 현재
```
prop("상태") == "진행 중"
```

### 만다라트 · 시간 경과율
```
if(empty(prop("시작일")), 0, let(total, dateBetween(prop("종료일"), prop("시작일"), "days") + 1, el, dateBetween(today(), prop("시작일"), "days") + 1, round(min(max(el / total, 0), 1) * 100)))
```

### 세부목표 · 색
```
ifs(prop("색상 라벨") == "레드", "red", prop("색상 라벨") == "오렌지", "orange", prop("색상 라벨") == "옐로", "yellow", prop("색상 라벨") == "그린", "green", prop("색상 라벨") == "블루", "blue", prop("색상 라벨") == "퍼플", "purple", prop("색상 라벨") == "핑크", "pink", prop("색상 라벨") == "브라운", "brown", "gray")
```

### 세부목표 · 현재
```
prop("만다라트").first().prop("상태") == "진행 중"
```

### 실천항목 · 활성
```
empty(prop("활성 상태")) or prop("활성 상태") == "활성"
```

### 실천항목 · 현재
```
prop("세부목표").first().prop("현재")
```

### 실천항목 · 세부목표 색
```
let(g, prop("세부목표").first(), if(empty(g), "", style("● " + g.prop("세부목표"), "b", g.prop("색"))))
```

### 실천항목 · 기간 종료일
```
prop("세부목표").first().prop("만다라트").first().prop("종료일")
```

### 실천항목 · 기준 시작일
```
let(s, prop("세부목표").first().prop("만다라트").first().prop("시작일"), r, prop("재시작일"), if(empty(r), s, if(empty(s), r, if(dateBetween(r, s, "days") > 0, r, s))))
```

### 실천항목 · 주간 목표(계산)
```
ifs(prop("빈도") == "매일", 7, prop("빈도") == "월 n회", if(empty(prop("월간 목표 횟수")), 1, prop("월간 목표 횟수")) / 4.345, prop("유형") == "마음가짐" and empty(prop("주간 목표 횟수")), 3, empty(prop("주간 목표 횟수")), 1, prop("주간 목표 횟수"))
```

### 실천항목 · 최근 7일 횟수
```
prop("실행 기록").filter(current.prop("경과일") >= 0 and current.prop("경과일") < 7).map(current.prop("일자")).unique().length()
```

### 실천항목 · 최근 30일 횟수
```
prop("실행 기록").filter(current.prop("경과일") >= 0 and current.prop("경과일") < 30).map(current.prop("일자")).unique().length()
```

### 실천항목 · 이번 주 횟수
```
let(dw, (((dateBetween(today(), parseDate("2024-01-01"), "days") % 7) + 7) % 7), prop("실행 기록").filter(current.prop("경과일") >= 0 and current.prop("경과일") <= dw).map(current.prop("일자")).unique().length())
```

### 실천항목 · 이번 달 횟수
```
let(ym, formatDate(today(), "YYYY-MM"), prop("실행 기록").filter(substring(current.prop("일자"), 0, 7) == ym).map(current.prop("일자")).unique().length())
```

### 실천항목 · 누적 횟수
```
let(b, prop("기준 시작일"), lim, if(empty(b), 100000, dateBetween(today(), b, "days")), prop("실행 기록").filter(current.prop("경과일") >= 0 and current.prop("경과일") <= lim).map(current.prop("일자")).unique().length())
```

### 실천항목 · 누적 수행량
```
let(b, prop("기준 시작일"), lim, if(empty(b), 100000, dateBetween(today(), b, "days")), prop("실행 기록").filter(current.prop("경과일") >= 0 and current.prop("경과일") <= lim).map(if(empty(current.prop("수행량")), 0, current.prop("수행량"))).sum())
```

### 실천항목 · 오늘 기록
```
prop("실행 기록").some(current.prop("경과일") == 0)
```

### 실천항목 · 기록 공백(일)
```
let(o, prop("실행 기록").map(current.prop("경과일")).filter(current >= 0).sort(), if(o.length() > 0, o.first(), if(empty(prop("기준 시작일")), 0, max(dateBetween(today(), prop("기준 시작일"), "days"), 0))))
```

### 실천항목 · 연속 기록
```
let(o, prop("실행 기록").map(current.prop("경과일")).filter(current >= 0).unique().sort(), st, if(o.includes(0), 0, 1), n, o.filter(current == index + st).length(), if(n >= 2, "🔥 " + format(n) + "일 연속", ""))
```

### 실천항목 · 기간 목표 횟수
```
let(b, prop("기준 시작일"), e, prop("기간 종료일"), if(empty(b) or empty(e), 0, round(prop("주간 목표(계산)") * (dateBetween(e, b, "days") + 1) / 7)))
```

### 실천항목 · 경과 목표 횟수
```
let(b, prop("기준 시작일"), e, prop("기간 종료일"), if(empty(b), 0, let(el, dateBetween(today(), b, "days") + 1, tot, if(empty(e), el, dateBetween(e, b, "days") + 1), round(prop("주간 목표(계산)") * max(min(el, tot), 0) / 7 * 10) / 10)))
```

### 실천항목 · 달성률
```
ifs(prop("유형") == "미션", if(prop("완료"), 100, let(t, prop("할 일"), if(t.length() == 0, 0, round(t.filter(current.prop("완료")).length() / t.length() * 100)))), prop("유형") == "마음가짐", round(min(prop("최근 30일 횟수") / 12, 1) * 100), prop("기간 목표 횟수") <= 0, 0, round(min(prop("누적 횟수") / prop("기간 목표 횟수"), 1) * 100))
```

### 실천항목 · 최근 상태
```
ifs(prop("활성 상태") == "쉬는 중" or prop("활성 상태") == "교체됨", "⏸", prop("활성 상태") == "졸업", "🎓", prop("유형") == "미션", ifs(prop("완료"), "✅", not empty(prop("기한")) and dateBetween(today(), prop("기한"), "days") > 0, "🔴", prop("달성률") > 0, "🟨", "⬜"), prop("기록 공백(일)") >= 14, "💤", prop("유형") == "마음가짐", ifs(prop("최근 7일 횟수") >= 3, "🟩", prop("최근 7일 횟수") >= 1, "🟨", "⬜"), prop("최근 7일 횟수") >= min(prop("주간 목표(계산)"), 7), "🟩", prop("최근 7일 횟수") >= 1, "🟨", "⬜")
```

### 실천항목 · 칸
```
prop("최근 상태") + " " + if(empty(prop("짧은 이름")), substring(prop("실천항목"), 0, 6), prop("짧은 이름"))
```

### 실천항목 · 오늘 할 차례
```
let(dw, (((dateBetween(today(), parseDate("2024-01-01"), "days") % 7) + 7) % 7), mleft, dateBetween(dateSubtract(dateAdd(parseDate(formatDate(today(), "YYYY-MM") + "-01"), 1, "months"), 1, "days"), today(), "days") + 1, monthly, prop("빈도") == "월 n회", need, if(monthly, if(empty(prop("월간 목표 횟수")), 1, prop("월간 목표 횟수")) - prop("이번 달 횟수"), ceil(prop("주간 목표(계산)")) - prop("이번 주 횟수")), left, if(monthly, mleft, 7 - dw), ifs(not prop("활성"), "", prop("유형") == "미션", if(prop("완료") or empty(prop("기한")), "", let(r, dateBetween(prop("기한"), today(), "days"), ifs(r < 0, "🔴 기한 지남", r == 0, "📌 오늘 마감", r <= 7, "📌 기한 D-" + format(r), ""))), prop("오늘 기록"), "✅ 오늘 완료", prop("유형") == "마음가짐", "🧘 오늘 한 번 떠올리기", need <= 0, if(monthly, "😌 이번 달 목표 달성", "😌 이번 주 목표 달성"), need >= left, "🔥 오늘 꼭", "🙂 여유 · " + format(need) + "회 남음 / " + format(left) + "일"))
```

### 실천항목 · 오늘 순서
```
let(t, prop("오늘 할 차례"), ifs(empty(t), 9, t.contains("🔴") or t.contains("📌") or t.contains("🔥"), 1, t.contains("🙂"), 2, t.contains("🧘"), 3, t.contains("✅"), 4, 5))
```

### 실천항목 · 자동 분해
```
ifs(prop("유형") == "미션", "🎯 1회 미션 → " + if(empty(prop("기한")), "기한 미정", "기한 " + formatDate(prop("기한"), "M/D")) + " → 할 일 " + format(prop("할 일").filter(current.prop("완료")).length()) + "/" + format(prop("할 일").length()), prop("유형") == "마음가짐", "🧘 매일 떠올리기 → 최근 30일 " + format(prop("최근 30일 횟수")) + "일 기록", "📆 기간 " + format(prop("기간 목표 횟수")) + "회 → 월 " + format(round(prop("주간 목표(계산)") * 4.345)) + "회 → 주 " + format(round(prop("주간 목표(계산)") * 10) / 10) + "회 → 오늘 " + if(empty(prop("오늘 할 차례")), "—", prop("오늘 할 차례")))
```

### 실천항목 · 진행 바
```
let(p, min(max(prop("달성률"), 0), 100), n, floor(p / 10), style(repeat("■", n), "green") + style(repeat("□", 10 - n), "gray") + "  " + style(format(p) + "%", "b"))
```

### 실천항목 · 재설계 신호
```
ifs(not prop("활성"), "", prop("최근 상태") == "💤", style("💤 14일+ 멈춤 → 최소 행동으로 다시 시작", "b", "red"), prop("유형") == "습관" and prop("경과 목표 횟수") >= 4 and prop("누적 횟수") / prop("경과 목표 횟수") < 0.4, style("📉 목표 대비 40% 미만 → 빈도 낮추기 검토", "b", "orange"), "")
```

### 실행 기록 · 세부목표
```
let(g, prop("실천항목").first().prop("세부목표").first(), if(empty(g), "", style("● " + g.prop("세부목표"), "b", g.prop("색"))))
```

### 세부목표 · 현재치
```
prop("실천항목").filter(current.prop("수치 집계")).map(current.prop("누적 수행량")).sum()
```

### 세부목표 · 달성률
```
let(acts, prop("실천항목").filter(current.prop("활성")), ifs(prop("구분") == "중심", 0, prop("목표치") > 0, round(min(prop("현재치") / prop("목표치"), 1) * 100), acts.length() == 0, 0, round(acts.map(current.prop("달성률")).sum() / acts.length())))
```

### 세부목표 · 칸
```
let(p, prop("달성률"), e, ifs(p >= 100, "🏅", p >= 80, "🔥", p >= 40, "🟩", p > 0, "🟨", "⬜"), e + " " + style(if(empty(prop("짧은 이름")), substring(prop("세부목표"), 0, 6), prop("짧은 이름")), "b", prop("색")))
```

### 세부목표 · 방치 칸 수
```
prop("실천항목").filter(current.prop("최근 상태") == "💤").length()
```

### 세부목표 · 방치 경고
```
if(prop("방치 칸 수") > 0, style("💤 방치 " + format(prop("방치 칸 수")) + "칸", "b", "gray_background"), "")
```

### 세부목표 · 도장
```
ifs(prop("구분") == "중심", "", prop("달성률") >= 100, style("🏅 달성!", "b", "yellow_background"), prop("달성률") >= 80, style("🔥 거의 다 왔어요", "b", "orange"), "")
```

### 세부목표 · 이번 주
```
let(h, prop("실천항목").filter(current.prop("유형") == "습관" and current.prop("활성")), goal, h.map(ceil(current.prop("주간 목표(계산)"))).sum(), done, h.map(min(current.prop("이번 주 횟수"), ceil(current.prop("주간 목표(계산)")))).sum(), if(goal == 0, "", "이번 주 " + format(done) + "/" + format(goal) + "회"))
```

### 세부목표 · 자동 분해
```
let(end, prop("만다라트").first().prop("종료일"), days, dateBetween(end, today(), "days") + 1, rem, prop("목표치") - prop("현재치"), u, if(empty(prop("단위")), "", prop("단위")), ifs(empty(prop("목표치")) or prop("목표치") <= 0, "", rem <= 0, style("🏅 목표치 달성", "b", "green"), days <= 0, "⏹ 기간 종료 · " + format(rem) + u + " 남음", "남은 " + format(rem) + u + " → 월 " + format(round(rem / days * 304) / 10) + u + " · 주 " + format(round(rem / days * 70) / 10) + u + " · 오늘 " + format(round(rem / days * 10) / 10) + u))
```

### 만다라트 · 전체 달성률
```
if(prop("기록된 달성률") > 0, prop("기록된 달성률"), let(g, prop("세부목표").filter(current.prop("구분") != "중심"), if(g.length() == 0, 0, round(g.map(current.prop("달성률")).sum() / g.length()))))
```

### 만다라트 · 진행 바
```
let(p, min(max(prop("전체 달성률"), 0), 100), n, floor(p / 10), style(repeat("■", n), "blue") + style(repeat("□", 10 - n), "gray") + "  " + style(format(p) + "%", "b"))
```

### 만다라트 · 페이스
```
let(d, prop("전체 달성률") - prop("시간 경과율"), ifs(empty(prop("시작일")), style("⏳ 시작일을 입력하세요", "gray"), prop("상태") == "완료" or prop("상태") == "보관", style("🏁 종료 · 최종 " + format(prop("전체 달성률")) + "%", "b", "brown"), d >= 5, style("🚀 앞서가는 중 (+" + format(d) + "%p)", "b", "green"), d > -5, style("👍 페이스 유지", "b", "blue"), style("⚠️ 뒤처짐 (" + format(abs(d)) + "%p)", "b", "red")))
```

### 만다라트 · D-day
```
if(empty(prop("시작일")), "", let(r, dateBetween(prop("종료일"), today(), "days"), ifs(r > 0, "D-" + format(r), r == 0, "D-DAY", "종료 +" + format(abs(r)) + "일")))
```

### 만다라트 · 경과 월
```
if(empty(prop("시작일")), 0, let(ref, if(dateBetween(today(), prop("종료일"), "days") > 0, prop("종료일"), today()), max(dateBetween(ref, prop("시작일"), "months"), 0)))
```

### 만다라트 · 습관 유지율
```
let(acts, prop("세부목표").map(current.prop("실천항목")).flat().filter(current.prop("유형") == "습관" and current.prop("활성")), goal, acts.map(current.prop("경과 목표 횟수")).sum(), if(goal <= 0, 0, round(min(acts.map(current.prop("누적 횟수")).sum() / goal, 1) * 100)))
```

### 만다라트 · 방치 칸
```
prop("세부목표").map(current.prop("방치 칸 수")).sum()
```

### 만다라트 · 재시작 합계
```
prop("세부목표").map(current.prop("실천항목")).flat().map(if(empty(current.prop("재시작 횟수")), 0, current.prop("재시작 횟수"))).sum()
```

### 만다라트 · 회고 수
```
prop("회고").length()
```

### 세부목표 · 진행 바
```
let(p, min(max(if(prop("구분") == "중심", prop("만다라트").first().prop("전체 달성률"), prop("달성률")), 0), 100), n, floor(p / 10), c, if(prop("구분") == "중심", "blue", prop("색")), style(repeat("■", n), c) + style(repeat("□", 10 - n), "gray") + "  " + style(format(p) + "%", "b"))
```

### 세부목표 · 미니 그리드
```
let(acts, prop("실천항목"), sibs, prop("만다라트").first().prop("세부목표").filter(current.prop("구분") != "중심"), center, prop("구분") == "중심", cells, if(center, [1, 2, 3, 4, 6, 7, 8, 9].map(let(i, current, g, sibs.filter(current.prop("위치") == i).first(), if(empty(g), "⬚ ─", g.prop("칸")))), [1, 2, 3, 4, 5, 6, 7, 8].map(let(i, current, a, acts.filter(current.prop("위치") == i).first(), if(empty(a), "⬚ ─", a.prop("칸"))))), mid, if(center, style("🎯 " + if(empty(prop("짧은 이름")), substring(prop("세부목표"), 0, 6), prop("짧은 이름")), "b", "blue_background"), style("◆ " + if(empty(prop("짧은 이름")), substring(prop("세부목표"), 0, 6), prop("짧은 이름")), "b", prop("색"))), cells.at(0) + "   " + cells.at(1) + "   " + cells.at(2) + "\n" + cells.at(3) + "   " + mid + "   " + cells.at(4) + "\n" + cells.at(5) + "   " + cells.at(6) + "   " + cells.at(7))
```

### 기간 목표 · 기간 끝
```
let(s, prop("기간 시작"), u, prop("단위"), if(empty(s), s, ifs(u == "주", dateAdd(s, 6, "days"), u == "정비 주간", dateAdd(s, 13, "days"), u == "월", dateSubtract(dateAdd(parseDate(formatDate(s, "YYYY-MM") + "-01"), 1, "months"), 1, "days"), u == "분기", dateSubtract(dateAdd(s, 3, "months"), 1, "days"), u == "12주 스프린트", dateAdd(s, 83, "days"), u == "반기", dateSubtract(dateAdd(s, 6, "months"), 1, "days"), s)))
```

### 기간 목표 · 단위 순서
```
ifs(prop("단위") == "반기", 1, prop("단위") == "분기" or prop("단위") == "12주 스프린트", 2, prop("단위") == "정비 주간", 3, prop("단위") == "월", 4, 5)
```

### 기간 목표 · 시점
```
ifs(empty(prop("기간 시작")), "", dateBetween(today(), prop("기간 시작"), "days") < 0, "⏳ 예정", dateBetween(today(), prop("기간 끝"), "days") > 0, "⏹ 지남", "🟢 지금")
```

### 기간 목표 · 남은 일수
```
if(prop("시점") == "🟢 지금", "D-" + format(dateBetween(prop("기간 끝"), today(), "days")), "")
```

### 기간 목표 · 상위
```
let(p, prop("상위 기간 목표").first(), if(empty(p), "🌳 최상위", "↳ " + p.prop("기간 목표")))
```

### 기간 목표 · 달성률
```
let(t, prop("할 일"), k, prop("하위 기간 목표"), ifs(prop("목표치") > 0, round(min(prop("현재치") / prop("목표치"), 1) * 100), t.length() > 0, round(t.filter(current.prop("완료")).length() / t.length() * 100), k.length() > 0, round(k.filter(current.prop("상태") == "달성").length() / k.length() * 100), if(prop("상태") == "달성", 100, 0)))
```

### 기간 목표 · 진행 바
```
let(p, min(max(prop("달성률"), 0), 100), n, floor(p / 10), style(repeat("■", n), "purple") + style(repeat("□", 10 - n), "gray") + "  " + style(format(p) + "%", "b"))
```

### 기간 목표 · 자동 분해
```
let(rem, prop("목표치") - prop("현재치"), days, dateBetween(prop("기간 끝"), today(), "days") + 1, u, if(empty(prop("수치 단위")), "", prop("수치 단위")), ifs(empty(prop("목표치")) or prop("목표치") <= 0, "", rem <= 0, style("🏅 달성", "b", "green"), days <= 0, "⏹ 종료", "남은 " + format(rem) + u + " → 주 " + format(round(rem / days * 70) / 10) + u + " · 하루 " + format(round(rem / days * 10) / 10) + u))
```

### 할 일 · 세부목표
```
let(g, prop("실천항목").first().prop("세부목표").first(), g2, if(empty(g), prop("기간 목표").first().prop("세부목표").first(), g), if(empty(g2), "", style("● " + g2.prop("세부목표"), "b", g2.prop("색"))))
```

### 할 일 · 라벨
```
let(d, prop("날짜"), m, toNumber(formatDate(d, "M")), if(empty(d), "", "W" + format(week(d)) + " · " + format(m) + "월 · Q" + format(ceil(m / 3))))
```

### 할 일 · 지연
```
if(prop("완료") or empty(prop("날짜")), "", let(g, dateBetween(today(), parseDate(formatDate(prop("날짜"), "YYYY-MM-DD")), "days"), if(g > 0, style("🔴 지연 " + format(g) + "일", "b", "red"), "")))
```

### 할 일 · 요일
```
if(empty(prop("날짜")), "📥 날짜 미정", ["① 월", "② 화", "③ 수", "④ 목", "⑤ 금", "⑥ 토", "⑦ 일"].at((((dateBetween(parseDate(formatDate(prop("날짜"), "YYYY-MM-DD")), parseDate("2024-01-01"), "days") % 7) + 7) % 7)))
```

### 할 일 · 현재
```
let(a, prop("실천항목").first(), if(empty(a), true, a.prop("현재")))
```

### 회고 · 경과 월
```
let(s, prop("만다라트").first().prop("시작일"), e, dateEnd(prop("기간")), if(empty(s) or empty(e), -1, max(dateBetween(e, s, "months"), 0)))
```

### 회고 · 현재 달성률(참고)
```
prop("만다라트").first().prop("전체 달성률")
```

### 회고 · 스냅샷 확인
```
ifs(prop("유형") != "월간", "", prop("누적 달성률") > 0, style("📸 저장됨", "green"), style("📸 누적 달성률 칸에 " + format(prop("현재 달성률(참고)")) + " 입력", "b", "orange"))
```

### 만다라트 · 이전 최종
```
let(prev, prop("이전 만다라트").first(), if(empty(prev), "—", prev.prop("핵심목표") + " · 최종 " + format(prev.prop("전체 달성률")) + "%"))
```

### 만다라트 · 작년 이맘때 비교
```
let(prev, prop("이전 만다라트").first(), m, prop("경과 월"), now, prop("전체 달성률"), snap, prev.prop("회고").filter(current.prop("경과 월") == m and current.prop("누적 달성률") > 0).first(), ifs(empty(prev), style("이전 만다라트를 연결하면 비교가 보여요", "gray"), empty(snap), "이전 최종 " + format(prev.prop("전체 달성률")) + "% · 지금 " + format(now) + "%", let(b, snap.prop("누적 달성률"), d, now - b, "같은 시점(" + format(m + 1) + "개월 차) " + format(b) + "% → 지금 " + format(now) + "%  " + if(d >= 0, style("▲ " + format(d) + "%p", "b", "green"), style("▼ " + format(abs(d)) + "%p", "b", "red")))))
```

### 만다라트 · 성적표
```
"📈 " + format(prop("전체 달성률")) + "%  ·  🔁 유지 " + format(prop("습관 유지율")) + "%  ·  💤 " + format(prop("방치 칸")) + "칸  ·  🔄 재시작 " + format(prop("재시작 합계")) + "회  ·  📝 회고 " + format(prop("회고 수")) + "회"
```

### 추천 라이브러리 · 요약
```
ifs(prop("종류") == "실천항목 후보", ifs(prop("유형") == "습관", "🔁 ", prop("유형") == "미션", "🎯 ", "🧘 ") + prop("권장 빈도") + " · " + prop("소요 시간") + " · 최소: " + prop("최소 행동"), prop("종류") == "세부목표 후보", "🧩 실천 후보 " + format(prop("하위 항목").length()) + "개", "🎯 세부 " + format(prop("하위 항목").length()) + " · 실천 " + format(prop("하위 항목").map(current.prop("하위 항목")).flat().length()))
```

### 지난 목표 분석 · 설계 점수
```
prop("실패 원인").filter(["목표가 모호했다", "측정할 수 없었다", "너무 컸다", "너무 많았다", "최소 행동이 없었다"].includes(current)).length()
```

### 지난 목표 분석 · 실행 점수
```
prop("실패 원인").filter(["기록·확인을 안 했다", "한 번 빠지고 무너졌다", "동기가 사라졌다", "회고를 안 했다"].includes(current)).length()
```

### 지난 목표 분석 · 환경 점수
```
prop("실패 원인").filter(["시간이 없었다", "체력·에너지 부족", "환경이 방해했다", "주변의 영향", "돈·비용 문제", "예상 못 한 사건"].includes(current)).length()
```

### 지난 목표 분석 · 주원인
```
let(d, prop("설계 점수"), x, prop("실행 점수"), v, prop("환경 점수"), ifs(d + x + v == 0, "— 원인을 체크하세요", d >= x and d >= v, "🧩 설계 문제", x >= v, "🏃 실행 문제", "🌦 환경 문제"))
```

### 지난 목표 분석 · 원인 분포
```
let(d, prop("설계 점수"), x, prop("실행 점수"), v, prop("환경 점수"), style("🧩 " + repeat("■", d), "purple") + "  " + style("🏃 " + repeat("■", x), "orange") + "  " + style("🌦 " + repeat("■", v), "blue"))
```

### 지난 목표 분석 · 처방
```
ifs(prop("주원인") == "🧩 설계 문제", "목표를 숫자로 바꾸고, 실천항목마다 최소 행동을 정하기 → Step 1·3", prop("주원인") == "🏃 실행 문제", "✅ 원탭 기록 + 일요일 15분 주간 회고 고정 → Step 5·6", prop("주원인") == "🌦 환경 문제", "시간 블록·0원 대안·재시작 규칙을 먼저 정하기 → 재시작 센터", "")
```

### 지난 목표 분석 · 반영
```
if(prop("반영할 만다라트").length() > 0 or prop("반영한 세부목표").length() > 0, style("✅ 반영됨", "b", "green"), style("⏳ 아직 반영 안 됨", "orange"))
```
