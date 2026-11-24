"""노션 API로 실제 생성하는 수식·롤업 (v3).

노션 API 제약 두 가지 때문에 schema.py 의 설계를 이렇게 옮겼다.
1. 수식 안에서 관계형 페이지의 속성을 직접 읽을 수 없다 (prop("관계").first().prop("X") 거부).
2. 'show_original' 롤업은 수식에서 목록이 아니라 텍스트로 취급된다.
→ 기간 판정은 실행 기록 각 행에서 0/1 플래그로 미리 계산하고 sum·earliest_date·latest_date·percent_checked
  롤업으로 올린다. 보드 격자는 위치별 칸 텍스트(칸@1…)를 롤업해 조립한다.
한 호출 안에서 같은 호출로 만든 속성을 참조하면 실패하므로 STEPS 단계마다 호출을 나눈다.
"""
from schema import DOW, bar, bar_dyn

R = lambda rel, prop, fn="show_original": ("R", rel, prop, fn)  # noqa: E731
DROP = ("DROP",)

_SHORT3 = 'if(empty(prop("짧은 이름")), substring(prop("실천항목"), 0, 6), prop("짧은 이름"))'
_SHORT2 = 'if(empty(prop("짧은 이름")), substring(prop("세부목표"), 0, 6), prop("짧은 이름"))'
_HABIT = '(prop("유형") == "습관" and prop("활성"))'
_DAY = 'parseDate(formatDate(prop("날짜"), "YYYY-MM-DD"))'


def clean(t):  # show_original 텍스트("a, , b")에서 빈 칸·쉼표 정리
    return f'replaceAll(replaceAll({t}, "^[, ]+|[, ]+$", ""), ",( ,)+", ",")'


def cell(i):
    return f'if(empty({clean(f"prop(\"↳칸{i}\")")}), "⬚ ─", {clean(f"prop(\"↳칸{i}\")")})'


def gcell(i):
    return f'if(empty({clean(f"prop(\"↳세부칸{i}\")")}), "⬚ ─", {clean(f"prop(\"↳세부칸{i}\")")})'


STEPS = [
    # 1. 세부목표 ← 만다라트
    ("goals", [("↳시작일", DROP), ("↳종료일", DROP)]),
    ("goals", [("↳시작일", R("만다라트", "시작일", "earliest_date")), ("↳종료일", R("만다라트", "종료일", "latest_date")),
               ("현재", 'format(prop("↳만다라트 상태")).contains("진행 중")'),
               ("표시 이름", 'style("● " + prop("세부목표"), "b", prop("색"))')]),
    ("goals", [("만다라트 시작일", 'prop("↳시작일")'), ("만다라트 종료일", 'prop("↳종료일")'),
               ("현재값", 'if(prop("현재"), 1, 0)')]),
    # 2. 실천항목 ← 세부목표·할 일
    ("actions", [("↳현재", R("세부목표", "현재값", "sum")), ("↳세부목표 표시", R("세부목표", "표시 이름")),
                 ("↳시작일", R("세부목표", "만다라트 시작일", "earliest_date")), ("↳종료일", R("세부목표", "만다라트 종료일", "latest_date")),
                 ("↳할 일", R("할 일", "완료", "percent_checked")), ("↳마지막 기록", R("실행 기록", "날짜", "latest_date")),
                 ("활성", 'empty(prop("활성 상태")) or prop("활성 상태") == "활성"'),
                 ("주간 목표(계산)", 'ifs(prop("빈도") == "매일", 7, prop("빈도") == "월 n회", if(empty(prop("월간 목표 횟수")), 1, prop("월간 목표 횟수")) / 4.345, prop("유형") == "마음가짐" and empty(prop("주간 목표 횟수")), 3, empty(prop("주간 목표 횟수")), 1, prop("주간 목표 횟수"))')]),
    ("actions", [("현재", 'prop("↳현재") > 0'),
                 ("세부목표 색", 'prop("↳세부목표 표시")'),
                 ("기간 종료일", 'prop("↳종료일")'),
                 ("기준 시작일", 'let(s, prop("↳시작일"), r, prop("재시작일"), if(empty(r), s, if(empty(s), r, if(dateBetween(r, s, "days") > 0, r, s))))'),
                 ("할 일 진행", 'if(prop("할 일").length() == 0, 0, round(prop("↳할 일") * 100))')]),
    ("actions", [("현재값", 'if(prop("현재"), 1, 0)')]),
    # 3. 실행 기록: 행마다 기간 플래그
    ("logs", [("↳기준", R("실천항목", "기준 시작일", "earliest_date")),
              ("최근7", 'if(prop("경과일") >= 0 and prop("경과일") < 7, 1, 0)'),
              ("최근30", 'if(prop("경과일") >= 0 and prop("경과일") < 30, 1, 0)'),
              ("이번주", f'if(prop("경과일") >= 0 and prop("경과일") <= {DOW}, 1, 0)'),
              ("이번달", 'if(prop("경과일") >= 0 and formatDate(prop("날짜"), "YYYY-MM") == formatDate(today(), "YYYY-MM"), 1, 0)'),
              ("오늘", 'if(prop("경과일") == 0, 1, 0)')]),
    ("logs", [("기간 내", f'if(prop("경과일") >= 0 and (empty(prop("↳기준")) or dateBetween({_DAY}, prop("↳기준"), "days") >= 0), 1, 0)')]),
    ("logs", [("기간 내 수행량", 'if(prop("기간 내") == 1, prop("수행량값"), 0)')]),
    # 4. 실천항목 ← 실행 기록 합계
    ("actions", [("최근 7일 횟수", R("실행 기록", "최근7", "sum")), ("최근 30일 횟수", R("실행 기록", "최근30", "sum")),
                 ("이번 주 횟수", R("실행 기록", "이번주", "sum")), ("이번 달 횟수", R("실행 기록", "이번달", "sum")),
                 ("누적 횟수", R("실행 기록", "기간 내", "sum")), ("누적 수행량", R("실행 기록", "기간 내 수행량", "sum")),
                 ("↳오늘", R("실행 기록", "오늘", "sum")),
                 ("기간 목표 횟수", 'let(b, prop("기준 시작일"), e, prop("기간 종료일"), if(empty(b) or empty(e), 0, round(prop("주간 목표(계산)") * (dateBetween(e, b, "days") + 1) / 7)))'),
                 ("경과 목표 횟수", 'let(b, prop("기준 시작일"), e, prop("기간 종료일"), if(empty(b), 0, let(el, dateBetween(today(), b, "days") + 1, tot, if(empty(e), el, dateBetween(e, b, "days") + 1), round(prop("주간 목표(계산)") * max(min(el, tot), 0) / 7 * 10) / 10)))'),
                 ("기록 공백(일)", 'let(l, prop("↳마지막 기록"), b, prop("기준 시작일"), ifs(not empty(l), max(dateBetween(today(), parseDate(formatDate(l, "YYYY-MM-DD")), "days"), 0), empty(b), 0, max(dateBetween(today(), b, "days"), 0)))')]),
    ("actions", [("오늘 기록", 'prop("↳오늘") > 0'),
                 ("연속 기록", 'ifs(prop("최근 7일 횟수") >= 7, "🔥 일주일 개근", prop("이번 주 횟수") >= 3, "🔥 이번 주 " + format(prop("이번 주 횟수")) + "일", "")'),
                 ("달성률", 'ifs(prop("유형") == "미션", if(prop("완료"), 100, prop("할 일 진행")), prop("유형") == "마음가짐", round(min(prop("최근 30일 횟수") / 12, 1) * 100), prop("기간 목표 횟수") <= 0, 0, round(min(prop("누적 횟수") / prop("기간 목표 횟수"), 1) * 100))')]),
    ("actions", [("최근 상태", 'ifs(prop("활성 상태") == "쉬는 중" or prop("활성 상태") == "교체됨", "⏸️", prop("활성 상태") == "졸업", "🎓", prop("유형") == "미션", ifs(prop("완료"), "✅", not empty(prop("기한")) and dateBetween(today(), prop("기한"), "days") > 0, "🔴", prop("달성률") > 0, "🟨", "⬜"), prop("기록 공백(일)") >= max(14, ceil(10.5 / prop("주간 목표(계산)"))), "💤", prop("유형") == "마음가짐", ifs(prop("최근 7일 횟수") >= 3, "🟩", prop("최근 7일 횟수") >= 1, "🟨", "⬜"), prop("빈도") == "월 n회", ifs(prop("최근 30일 횟수") >= if(empty(prop("월간 목표 횟수")), 1, prop("월간 목표 횟수")), "🟩", prop("최근 30일 횟수") >= 1, "🟨", "⬜"), prop("최근 7일 횟수") >= ceil(min(prop("주간 목표(계산)"), 7) * 0.8), "🟩", prop("최근 7일 횟수") >= 1, "🟨", "⬜")'),
                 ("오늘 할 차례", f'let(dw, {DOW}, mleft, dateBetween(dateSubtract(dateAdd(parseDate(formatDate(today(), "YYYY-MM") + "-01"), 1, "months"), 1, "days"), today(), "days") + 1, monthly, prop("빈도") == "월 n회", need, if(monthly, if(empty(prop("월간 목표 횟수")), 1, prop("월간 목표 횟수")) - prop("이번 달 횟수"), ceil(prop("주간 목표(계산)")) - prop("이번 주 횟수")), left, if(monthly, mleft, 7 - dw), ifs(not prop("활성"), "", prop("유형") == "미션", if(prop("완료") or empty(prop("기한")), "", let(r, dateBetween(prop("기한"), today(), "days"), ifs(r < 0, "🔴 기한 지남", r == 0, "📌 오늘 마감", r <= 7, "📌 기한 D-" + format(r), ""))), prop("오늘 기록"), "✅ 오늘 완료", prop("유형") == "마음가짐", "🧘 오늘 한 번 떠올리기", need <= 0, if(monthly, "😌 이번 달 목표 달성", "😌 이번 주 목표 달성"), need >= left, "🔥 오늘 꼭", "🙂 여유 · " + format(need) + "회 남음 / " + format(left) + "일"))'),
                 ("진행 바", bar('prop("달성률")', "green")),
                 ("활성 달성값", 'if(prop("활성"), prop("달성률"), 0)'),
                 ("활성수", 'if(prop("활성"), 1, 0)'),
                 ("집계 수행량", 'if(prop("수치 집계"), prop("누적 수행량"), 0)'),
                 ("습관 주간 목표", f'if({_HABIT}, ceil(prop("주간 목표(계산)")), 0)'),
                 ("습관 주간 달성", f'if({_HABIT}, min(prop("이번 주 횟수"), ceil(prop("주간 목표(계산)"))), 0)'),
                 ("습관 누적", f'if({_HABIT}, prop("누적 횟수"), 0)'),
                 ("습관 경과 목표", f'if({_HABIT}, prop("경과 목표 횟수"), 0)'),
                 ("재시작값", 'if(empty(prop("재시작 횟수")), 0, prop("재시작 횟수"))')]),
    ("actions", [("칸", f'prop("최근 상태") + " " + {_SHORT3}'),
                 ("방치", 'if(prop("최근 상태") == "💤", 1, 0)'),
                 ("재설계 신호", 'ifs(not prop("활성"), "", prop("최근 상태") == "💤", style("💤 " + format(prop("기록 공백(일)")) + "일 멈춤 → 최소 행동으로 다시 시작", "b", "red"), prop("유형") == "습관" and prop("경과 목표 횟수") >= 4 and prop("누적 횟수") / prop("경과 목표 횟수") < 0.4, style("📉 목표 대비 40% 미만 → 빈도 낮추기 검토", "b", "orange"), "")'),
                 ("오늘 순서", 'let(t, prop("오늘 할 차례"), ifs(empty(t), 9, t.contains("🔴") or t.contains("📌") or t.contains("🔥"), 1, t.contains("🙂"), 2, t.contains("🧘"), 3, t.contains("✅"), 4, 5))'),
                 ("자동 분해", 'ifs(prop("유형") == "미션", "🎯 1회 미션 → " + if(empty(prop("기한")), "기한 미정", "기한 " + formatDate(prop("기한"), "M/D")) + " → 할 일 " + format(prop("할 일 진행")) + "%", prop("유형") == "마음가짐", "🧘 매일 떠올리기 → 최근 30일 " + format(prop("최근 30일 횟수")) + "일 기록", "📆 기간 " + format(prop("기간 목표 횟수")) + "회 → 월 " + format(round(prop("주간 목표(계산)") * 4.345)) + "회 → 주 " + format(round(prop("주간 목표(계산)") * 10) / 10) + "회 → 오늘 " + if(empty(prop("오늘 할 차례")), "—", prop("오늘 할 차례")))')]),
    ("actions", [(f"칸@{i}", f'if(prop("위치") == {i}, prop("칸"), "")') for i in range(1, 9)]),
    # 5. 세부목표 ← 실천항목
    ("goals", [("↳활성 달성합", R("실천항목", "활성 달성값", "sum")), ("↳활성수", R("실천항목", "활성수", "sum")),
               ("현재치", R("실천항목", "집계 수행량", "sum")), ("방치 칸 수", R("실천항목", "방치", "sum")),
               ("↳주간 목표", R("실천항목", "습관 주간 목표", "sum")), ("↳주간 달성", R("실천항목", "습관 주간 달성", "sum")),
               ("습관 누적 합", R("실천항목", "습관 누적", "sum")), ("습관 경과 합", R("실천항목", "습관 경과 목표", "sum")),
               ("재시작 합", R("실천항목", "재시작값", "sum"))]
     + [(f"↳칸{i}", R("실천항목", f"칸@{i}")) for i in range(1, 9)]),
    ("goals", [("달성률", 'ifs(prop("구분") == "중심", 0, prop("목표치") > 0, round(min(prop("현재치") / prop("목표치"), 1) * 100), prop("↳활성수") == 0, 0, round(prop("↳활성 달성합") / prop("↳활성수")))'),
               ("이번 주", 'if(prop("↳주간 목표") == 0, "", "이번 주 " + format(prop("↳주간 달성")) + "/" + format(prop("↳주간 목표")) + "회")'),
               ("방치 경고", 'if(prop("방치 칸 수") > 0, style("💤 방치 " + format(prop("방치 칸 수")) + "칸", "b", "gray_background"), "")'),
               ("자동 분해", 'let(end, prop("만다라트 종료일"), days, dateBetween(end, today(), "days") + 1, rem, prop("목표치") - prop("현재치"), u, if(empty(prop("단위")), "", prop("단위")), ifs(empty(prop("목표치")) or prop("목표치") <= 0, "", rem <= 0, style("🏅 목표치 달성", "b", "green"), days <= 0, "⏹ 기간 종료 · " + format(rem) + u + " 남음", "남은 " + format(rem) + u + " → 월 " + format(round(rem / days * 304) / 10) + u + " · 주 " + format(round(rem / days * 70) / 10) + u + " · 오늘 " + format(round(rem / days * 10) / 10) + u))')]),
    ("goals", [("칸", f'let(p, prop("달성률"), e, ifs(p >= 100, "🏅", p >= 80, "🔥", p >= 40, "🟩", p > 0, "🟨", "⬜"), e + " " + {_SHORT2})'),
               ("평균 기여값", 'if(prop("구분") == "중심", 0, prop("달성률"))'),
               ("세부값", 'if(prop("구분") == "중심", 0, 1)'),
               ("도장", 'ifs(prop("구분") == "중심", "", prop("달성률") >= 100, style("🏅 달성!", "b", "yellow_background"), prop("달성률") >= 80, style("🔥 거의 다 왔어요", "b", "orange"), "")')]),
    ("goals", [(f"세부칸@{i}", f'if(prop("위치") == {i} and prop("구분") != "중심", prop("칸"), "")') for i in (1, 2, 3, 4, 6, 7, 8, 9)]),
    # 6. 만다라트 ← 세부목표
    ("mandalart", [("↳평균합", R("세부목표", "평균 기여값", "sum")), ("↳세부수", R("세부목표", "세부값", "sum")),
                   ("방치 칸", R("세부목표", "방치 칸 수", "sum")), ("↳습관 누적", R("세부목표", "습관 누적 합", "sum")),
                   ("↳습관 경과", R("세부목표", "습관 경과 합", "sum")), ("재시작 합계", R("세부목표", "재시작 합", "sum")),
                   ("D-day", 'if(empty(prop("시작일")), "", let(r, dateBetween(prop("종료일"), today(), "days"), ifs(r > 0, "D-" + format(r), r == 0, "D-DAY", "종료 +" + format(abs(r)) + "일")))'),
                   ("경과 월", 'if(empty(prop("시작일")), 0, let(ref, if(dateBetween(today(), prop("종료일"), "days") > 0, prop("종료일"), today()), max(dateBetween(ref, prop("시작일"), "months"), 0)))'),
                   ("회고 수", 'prop("회고").length()')]
     + [(f"↳세부칸{i}", R("세부목표", f"세부칸@{i}")) for i in (1, 2, 3, 4, 6, 7, 8, 9)]),
    ("mandalart", [("전체 달성률", 'if(prop("기록된 달성률") > 0, prop("기록된 달성률"), if(prop("↳세부수") == 0, 0, round(prop("↳평균합") / prop("↳세부수"))))'),
                   ("습관 유지율", 'if(prop("↳습관 경과") <= 0, 0, round(min(prop("↳습관 누적") / prop("↳습관 경과"), 1) * 100))'),
                   ("중심 격자", f'{gcell(1)} + "   " + {gcell(2)} + "   " + {gcell(3)} + "\\n" + {gcell(4)} + "   " + "🎯 " + prop("핵심목표") + "   " + {gcell(6)} + "\\n" + {gcell(7)} + "   " + {gcell(8)} + "   " + {gcell(9)}')]),
    ("mandalart", [("진행 바", bar('prop("전체 달성률")', "blue")),
                   ("페이스", 'let(d, prop("전체 달성률") - prop("시간 경과율"), ifs(empty(prop("시작일")), style("⏳ 시작일을 입력하세요", "gray"), prop("상태") == "완료" or prop("상태") == "보관", style("🏁 종료 · 최종 " + format(prop("전체 달성률")) + "%", "b", "brown"), d >= 5, style("🚀 앞서가는 중 (+" + format(d) + "%p)", "b", "green"), d > -5, style("👍 페이스 유지", "b", "blue"), style("⚠️ 뒤처짐 (" + format(abs(d)) + "%p)", "b", "red")))'),
                   ("성적표", '"📈 " + format(prop("전체 달성률")) + "%  ·  🔁 유지 " + format(prop("습관 유지율")) + "%  ·  💤 " + format(prop("방치 칸")) + "칸  ·  🔄 재시작 " + format(prop("재시작 합계")) + "회  ·  📝 회고 " + format(prop("회고 수")) + "회"')]),
    # 7. 세부목표 ← 만다라트 (보드)
    ("goals", [("↳전체 달성률", R("만다라트", "전체 달성률", "sum")), ("↳중심 격자", R("만다라트", "중심 격자"))]),
    ("goals", [("진행 바", bar_dyn('if(prop("구분") == "중심", prop("↳전체 달성률"), prop("달성률"))', 'if(prop("구분") == "중심", "blue", prop("색"))')),
               ("미니 그리드", f'if(prop("구분") == "중심", prop("↳중심 격자"), {cell(1)} + "   " + {cell(2)} + "   " + {cell(3)} + "\\n" + {cell(4)} + "   " + style("◆ " + {_SHORT2}, "b", prop("색")) + "   " + {cell(5)} + "\\n" + {cell(6)} + "   " + {cell(7)} + "   " + {cell(8)})')]),
    # 8. 실행 기록·할 일·기간 목표
    ("logs", [("세부목표", R("실천항목", "세부목표 색"))]),
    ("todos", [("세부목표", R("실천항목", "세부목표 색")), ("↳현재", R("실천항목", "현재값", "sum")),
               ("라벨", 'let(d, prop("날짜"), m, toNumber(formatDate(d, "M")), if(empty(d), "", "W" + format(week(d)) + " · " + format(m) + "월 · Q" + format(ceil(m / 3))))'),
               ("지연", f'if(prop("완료") or empty(prop("날짜")), "", let(g, dateBetween(today(), {_DAY}, "days"), if(g > 0, style("🔴 지연 " + format(g) + "일", "b", "red"), "")))'),
               ("요일", f'if(empty(prop("날짜")), "📥 날짜 미정", ["① 월", "② 화", "③ 수", "④ 목", "⑤ 금", "⑥ 토", "⑦ 일"].at((((dateBetween({_DAY}, parseDate("2024-01-01"), "days") % 7) + 7) % 7)))')]),
    ("todos", [("현재", 'prop("실천항목").length() == 0 or prop("↳현재") > 0')]),
    ("periods", [("달성값", 'if(prop("상태") == "달성", 1, 0)'),
                 ("↳할 일", R("할 일", "완료", "percent_checked")), ("↳상위 이름", R("상위 기간 목표", "기간 목표")),
                 ("기간 끝", 'let(s, prop("기간 시작"), u, prop("단위"), if(empty(s), s, ifs(u == "주", dateAdd(s, 6, "days"), u == "정비 주간", dateAdd(s, 13, "days"), u == "월", dateSubtract(dateAdd(parseDate(formatDate(s, "YYYY-MM") + "-01"), 1, "months"), 1, "days"), u == "분기", dateSubtract(dateAdd(s, 3, "months"), 1, "days"), u == "12주 스프린트", dateAdd(s, 83, "days"), u == "반기", dateSubtract(dateAdd(s, 6, "months"), 1, "days"), s)))'),
                 ("단위 순서", 'ifs(prop("단위") == "반기", 1, prop("단위") == "분기" or prop("단위") == "12주 스프린트", 2, prop("단위") == "정비 주간", 3, prop("단위") == "월", 4, 5)')]),
    ("periods", [("↳하위 달성", R("하위 기간 목표", "달성값", "sum")),
                 ("시점", 'ifs(empty(prop("기간 시작")), "", dateBetween(today(), prop("기간 시작"), "days") < 0, "⏳ 예정", dateBetween(today(), prop("기간 끝"), "days") > 0, "⏹ 지남", "🟢 지금")'),
                 ("상위", 'if(prop("상위 기간 목표").length() == 0, "🌳 최상위", "↳ " + prop("↳상위 이름"))'),
                 ("자동 분해", 'let(rem, prop("목표치") - prop("현재치"), days, dateBetween(prop("기간 끝"), today(), "days") + 1, u, if(empty(prop("수치 단위")), "", prop("수치 단위")), ifs(empty(prop("목표치")) or prop("목표치") <= 0, "", rem <= 0, style("🏅 달성", "b", "green"), days <= 0, "⏹ 종료", "남은 " + format(rem) + u + " → 주 " + format(round(rem / days * 70) / 10) + u + " · 하루 " + format(round(rem / days * 10) / 10) + u))')]),
    ("periods", [("달성률", 'let(n, prop("하위 기간 목표").length(), ifs(prop("목표치") > 0, round(min(prop("현재치") / prop("목표치"), 1) * 100), prop("할 일").length() > 0, round(prop("↳할 일") * 100), n > 0, round(prop("↳하위 달성") / n * 100), if(prop("상태") == "달성", 100, 0)))'),
                 ("남은 일수", 'if(prop("시점") == "🟢 지금", "D-" + format(dateBetween(prop("기간 끝"), today(), "days")), "")')]),
    ("periods", [("진행 바", bar('prop("달성률")', "purple"))]),
    # 9. 회고 → 만다라트 비교
    ("retros", [("↳시작일", R("만다라트", "시작일", "earliest_date")), ("현재 달성률(참고)", R("만다라트", "전체 달성률", "sum"))]),
    ("retros", [("경과 월", 'let(s, prop("↳시작일"), e, dateEnd(prop("기간")), if(empty(s) or empty(e), -1, max(dateBetween(e, s, "months"), 0)))')]),
    ("retros", [("스냅샷 확인", 'ifs(prop("유형") != "월간", "", prop("누적 달성률") > 0, style("📸 저장됨", "green"), style("📸 누적 달성률 칸에 " + format(prop("현재 달성률(참고)")) + " 입력", "b", "orange"))'),
                ("스냅샷 키", 'if(prop("유형") == "월간" and prop("누적 달성률") > 0, format(prop("경과 월")) + ":" + format(prop("누적 달성률")), "")')]),
    ("mandalart", [("↳스냅샷", R("회고", "스냅샷 키"))]),
    ("mandalart", [("스냅샷 목록", 'replaceAll(prop("↳스냅샷"), " ", "")')]),
    ("mandalart", [("↳이전 스냅샷", R("이전 만다라트", "스냅샷 목록")), ("↳이전 달성률", R("이전 만다라트", "전체 달성률", "sum")),
                   ("↳이전 이름", R("이전 만다라트", "핵심목표"))]),
    ("mandalart", [("이전 최종", 'if(prop("이전 만다라트").length() == 0, "—", prop("↳이전 이름") + " · 최종 " + format(prop("↳이전 달성률")) + "%")'),
                   ("작년 이맘때 비교", 'let(m, prop("경과 월"), now, prop("전체 달성률"), t, "," + replaceAll(prop("↳이전 스냅샷"), " ", "") + ",", key, "," + format(m) + ":", ifs(prop("이전 만다라트").length() == 0, style("이전 만다라트를 연결하면 비교가 보여요", "gray"), not t.contains(key), "이전 최종 " + format(prop("↳이전 달성률")) + "% · 지금 " + format(now) + "%", let(b, toNumber(t.split(key).at(1).split(",").at(0)), d, now - b, "같은 시점(" + format(m + 1) + "개월 차) " + format(b) + "% → 지금 " + format(now) + "%  " + if(d >= 0, style("▲ " + format(d) + "%p", "b", "green"), style("▼ " + format(abs(d)) + "%p", "b", "red")))))')]),
    # 10. 라이브러리
    ("library", [("하위 수", 'prop("하위 항목").length()')]),
    ("library", [("↳손자 수", R("하위 항목", "하위 수", "sum"))]),
    ("library", [("요약", 'ifs(prop("종류") == "실천항목 후보", ifs(prop("유형") == "습관", "🔁 ", prop("유형") == "미션", "🎯 ", "🧘 ") + prop("권장 빈도") + " · " + prop("소요 시간") + " · 최소: " + prop("최소 행동"), prop("종류") == "세부목표 후보", "🧩 실천 후보 " + format(prop("하위 수")) + "개", "🎯 세부 " + format(prop("하위 수")) + " · 실천 " + format(prop("↳손자 수")))')]),
    # 11. 뷰 필터 전용 텍스트 칸 — API 뷰 필터는 수식 결과를 텍스트로만 비교할 수 있어서
    ("mandalart", [("필터용", 'if(prop("현재"), "현재", "")')]),
    ("goals", [("필터용", 'if(prop("현재"), "현재", "")')]),
    ("actions", [("필터용", 'if(prop("현재"), "현재 ", "") + if(prop("활성"), "활성 ", "") + if(prop("오늘 순서") <= 4, "오늘", "")')]),
    ("todos", [("필터용", f'if(empty(prop("날짜")), "", let(g, dateBetween({_DAY}, today(), "days"), d, {DOW}, if(g >= 0 - d and g <= 6 - d, "이번 주", "")))')]),
    ("logs", [("필터용", 'if(prop("이번주") == 1, "이번주", "")')]),
]
