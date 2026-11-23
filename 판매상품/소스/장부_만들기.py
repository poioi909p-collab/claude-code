"""배달·홀 음식점 매출장부 v2. usage: build_v2.py OUT.xlsx [lite]"""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, Protection
from openpyxl.worksheet.protection import SheetProtection
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.chart import BarChart, PieChart, LineChart, Reference
from openpyxl.chart.label import DataLabelList
import datetime, random, sys

OUT = sys.argv[1]
MODE = sys.argv[2] if len(sys.argv) > 2 else "pro"
PRO = MODE != "lite"
EMPTY = MODE == "empty"
YEAR = 2026
NT = 2000   # 거래내역 rows
NP = 3000   # 붙여넣기 rows
PC = 12      # paste columns B..M
CAT0, CATN = 12, 26  # category rows in 설정
RULE0, RULEN = 12, 71

NAVY = "1F3A5F"; BLUE = "2E6BD6"; LIGHT = "EEF3FB"; GRAY = "F5F6F8"; GREEN = "1E8E5A"; RED = "C0392B"; YEL = "FFF8E1"; WARN = "FFE08A"
FN = "맑은 고딕"
thin = Side(style="thin", color="D5DAE1"); border = Border(left=thin, right=thin, top=thin, bottom=thin)
WON = '#,##0'; WON0 = '#,##0;-#,##0;""'; PCT = '0.0%'

def f(size=10, bold=False, color="222222"): return Font(name=FN, size=size, bold=bold, color=color)
def fill(c): return PatternFill("solid", fgColor=c)
def header(ws, row, cols, color=NAVY):
    for c in cols:
        x = ws.cell(row=row, column=c); x.font = f(10, True, "FFFFFF"); x.fill = fill(color)
        x.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True); x.border = border
def title(ws, text, sub=None):
    ws["B2"] = text; ws["B2"].font = f(18, True, NAVY)
    if sub: ws["B3"] = sub; ws["B3"].font = f(10, False, "6B7280")
    ws.sheet_view.showGridLines = False; ws.column_dimensions["A"].width = 2
def box(ws, rng, font=None, nf=None, bg=None, align=None):
    for row in ws[rng]:
        for c in row:
            c.border = border
            if font: c.font = font
            if nf: c.number_format = nf
            if bg: c.fill = fill(bg)
            if align: c.alignment = Alignment(horizontal=align)
def widths(ws, d):
    for k, v in d.items(): ws.column_dimensions[k].width = v

wb = Workbook()
guide = wb.active; guide.title = "사용법"
dash = wb.create_sheet("대시보드") if PRO else None
tx = wb.create_sheet("거래내역")
bank = wb.create_sheet("통장붙여넣기") if PRO else None
mon = wb.create_sheet("월별요약")
rep_ws = wb.create_sheet("월간리포트") if PRO else None
ana = wb.create_sheet("손익·부가세") if PRO else None
st = wb.create_sheet("설정")

# ================= 설정 =================
title(st, "설정", "노란 칸은 자유롭게 바꿔도 됩니다.")
widths(st, {"B": 16, "C": 12, "D": 3, "E": 16, "F": 9, "G": 10, "H": 9, "I": 3, "J": 14, "K": 3, "L": 18, "M": 16})
basic = [("연도", YEAR), ("상호명", "우리식당"), ("과세유형", "일반과세자"), ("월 목표 매출", 30000000)]
for i, (k, v) in enumerate(basic):
    r = 5 + i
    st.cell(row=r, column=2, value=k).font = f(10, True); st.cell(row=r, column=2).fill = fill(LIGHT); st.cell(row=r, column=2).border = border
    c = st.cell(row=r, column=3, value=v); c.font = f(11, True, BLUE); c.fill = fill(YEL); c.border = border
    if k == "월 목표 매출": c.number_format = '#,##0"원"'
    if not PRO and k in ("과세유형", "월 목표 매출"): st.cell(row=r, column=2).value = None; c.value = None; c.fill = PatternFill(); c.border = Border(); st.cell(row=r, column=2).fill = PatternFill(); st.cell(row=r, column=2).border = Border()
st.merge_cells("C6:G6") if False else None
if PRO:
    dv = DataValidation(type="list", formula1='"일반과세자,간이과세자"'); st.add_data_validation(dv); dv.add("C7")

income = [("홀매출", "N"), ("포장매출", "N"), ("배민", "Y"), ("쿠팡이츠", "Y"), ("요기요", "Y"), ("기타수입", "N")]
expense = [("식자재", "N", "N", "N"), ("인건비", "Y", "N", "N"), ("임대료", "Y", "Y", "N"), ("공과금", "Y", "Y", "N"),
           ("배달앱수수료", "N", "Y", "Y"), ("배달대행비", "N", "Y", "Y"), ("카드수수료", "N", "N", "N"),
           ("광고비", "N", "Y", "N"), ("포장용기·소모품", "N", "Y", "N"), ("세금", "N", "N", "N"), ("기타지출", "N", "N", "N")]
pays = ["카드", "현금", "계좌이체", "배달앱정산", "간편결제"]
st.cell(row=11, column=2, value="수입 카테고리"); st.cell(row=11, column=3, value="배달앱\n매출")
st.cell(row=11, column=5, value="지출 카테고리"); st.cell(row=11, column=6, value="고정비"); st.cell(row=11, column=7, value="부가세\n공제"); st.cell(row=11, column=8, value="배달\n비용")
st.cell(row=11, column=10, value="결제수단")
hcols = [2, 3, 5, 6, 7, 8, 10] if PRO else [2, 5, 10]
if not PRO:
    for c in (3, 6, 7, 8): st.cell(row=11, column=c).value = None
header(st, 11, hcols); st.row_dimensions[11].height = 30
yn = DataValidation(type="list", formula1='"Y,N"'); st.add_data_validation(yn)
for i in range(CATN - CAT0 + 1):
    r = CAT0 + i
    vals = [(2, income[i][0] if i < len(income) else None), (5, expense[i][0] if i < len(expense) else None), (10, pays[i] if i < len(pays) else None)]
    if PRO:
        vals += [(3, income[i][1] if i < len(income) else None)]
        if i < len(expense): vals += [(6, expense[i][1]), (7, expense[i][2]), (8, expense[i][3])]
        else: vals += [(6, None), (7, None), (8, None)]
    for c, v in vals:
        x = st.cell(row=r, column=c, value=v); x.font = f(); x.border = border; x.fill = fill(YEL)
        if c in (3, 6, 7, 8): x.alignment = Alignment(horizontal="center")
if PRO:
    yn.add(f"C{CAT0}:C{CATN}"); yn.add(f"F{CAT0}:H{CATN}")
st.cell(row=CATN + 2, column=2, value="※ 카테고리는 각각 최대 15개. 이미 쓴 카테고리 이름을 바꾸면 기존 내역과 분류 규칙의 이름도 함께 바꾸세요. (대시보드 '카테고리 불일치'가 알려줍니다)").font = f(9, False, "6B7280")
if PRO:
    notes = ["고정비 Y: 손익분기점 계산에 고정비로 들어갑니다.", "부가세 공제 Y: 세금계산서·카드영수증으로 매입세액을 공제받는 지출입니다.",
             "배달 비용 Y: 배달 수수료율 계산에 들어갑니다.", "배달앱 매출 Y: 배달 수수료율의 분모가 됩니다."]
    for i, n in enumerate(notes):
        st.cell(row=CATN + 3 + i, column=2, value="※ " + n).font = f(9, False, "6B7280")
    # keyword rules
    st.cell(row=11, column=12, value="통장 내용에 이 글자가 있으면"); st.cell(row=11, column=13, value="→ 이 카테고리로")
    header(st, 11, [12, 13], BLUE)
    rules = [("카드", "홀매출"), ("수수료", "배달앱수수료"), ("배민", "배민"), ("KB국민카드", "홀매출"), ("신한카드", "홀매출"), ("삼성카드", "홀매출"), ("현대카드", "홀매출"), ("BC카드", "홀매출"),
             ("우아한", "배민"), ("배달의민족", "배민"), ("쿠팡이츠", "쿠팡이츠"), ("위대한상상", "요기요"), ("요기요", "요기요"),
             ("마트", "식자재"), ("농협", "식자재"), ("식자재", "식자재"), ("정육", "식자재"), ("수산", "식자재"),
             ("급여", "인건비"), ("월급", "인건비"), ("국민연금", "인건비"), ("건강보험", "인건비"), ("고용보험", "인건비"),
             ("임대료", "임대료"), ("월세", "임대료"), ("한국전력", "공과금"), ("한전", "공과금"), ("도시가스", "공과금"), ("수도", "공과금"), ("통신", "공과금"),
             ("바로고", "배달대행비"), ("생각대로", "배달대행비"), ("부릉", "배달대행비"), ("배민광고", "광고비"), ("네이버", "광고비"), ("광고", "광고비"),
             ("용기", "포장용기·소모품"), ("세무서", "세금"), ("국세", "세금"), ("지방세", "세금"), ("카드수수료", "카드수수료"),
             ("본인이체", "제외"), ("내계좌", "제외")]
    for i in range(RULEN - RULE0 + 1):
        r = RULE0 + i
        k, v = rules[i] if i < len(rules) else (None, None)
        for c, val in ((12, k), (13, v)):
            x = st.cell(row=r, column=c, value=val); x.font = f(); x.border = border; x.fill = fill(YEL)
    st.cell(row=RULEN + 2, column=12, value="※ 여러 규칙이 맞으면 아래쪽 규칙이 이깁니다. 구체적인 규칙을 아래에 두세요.").font = f(9, False, "6B7280")
    st.cell(row=RULEN + 3, column=12, value="※ '제외'로 분류된 내역은 합계에 들어가지 않습니다. (본인 계좌 이동 등)").font = f(9, False, "6B7280")
    st.freeze_panes = "A12"
    widths(st, {"N": 3, "O": 18, "P": 10, "Q": 12, "R": 8, "S": 3, "T": 14, "U": 14})
    st.cell(row=10, column=15, value="통장 열 인식 (보통은 건드리지 않아도 됩니다)").font = f(10, True, NAVY)
    for c, h in ((15, "항목"), (16, "자동 인식"), (17, "직접 지정"), (18, "사용")):
        st.cell(row=11, column=c, value=h)
    header(st, 11, range(15, 19), BLUE)
    DET = [("제목 줄 (행 번호)", None), ("날짜", ["*일시*", "*일자*", "*날짜*", "거래일*"]), ("시간", ["*시간*", "*시각*"]),
           ("입금", ["입금액*", "*입금금액*", "입금", "맡기신*", "*입금(*", "*입금*"]),
           ("출금", ["출금액*", "*출금금액*", "출금", "찾으신*", "지급액*", "*출금(*", "*출금*"]),
           ("금액 (한 열일 때)", ["거래금액*", "금액", "금액(*"]), ("입출 구분", ["*입출*", "구분", "*거래구분*"]), ("잔액", ["*잔액*"])]
    HDR = "통장붙여넣기!$B$6:$M$25"
    st["P12"] = '=IF(COUNT(통장붙여넣기!$AC$6:$AC$25)=0,0,MIN(통장붙여넣기!$AC$6:$AC$25))'
    st["R12"] = '=IF(Q12<>"",Q12,P12)'
    defaults = {"날짜": 1, "입금": 3, "출금": 4}
    for i, (lab, pats) in enumerate(DET):
        r = 12 + i
        st.cell(row=r, column=15, value=lab)
        if pats:
            H = f"INDEX({HDR},MAX(1,$R$12-5),0)"
            m = "0"
            for pt in reversed(pats):
                m = f'IFERROR(MATCH("{pt}",{H},0),{m})'
            st.cell(row=r, column=16, value=f'=IF($R$12<6,{defaults.get(lab, 0)},{m})')
            st.cell(row=r, column=18, value=f'=IF(Q{r}<>"",IFERROR(MATCH(UPPER(TRIM(Q{r})),{{"B","C","D","E","F","G","H","I","J","K","L","M"}},0),0),P{r})')
        for c in (15, 16, 17, 18):
            x = st.cell(row=r, column=c); x.border = border; x.font = f(10, c == 18)
        st.cell(row=r, column=17).fill = fill(YEL)
        for c in (16, 18): st.cell(row=r, column=c).alignment = Alignment(horizontal="center")
    st["O20"] = "읽는 방식"; st["R20"] = '=IF(AND(R15>0,R16>0),2,IF(R17>0,1,0))'
    st["O21"] = "데이터 시작 전 행"; st["R21"] = '=IF(R12>=6,R12,5)'
    for r in (20, 21):
        for c in (15, 16, 17, 18): st.cell(row=r, column=c).border = border; st.cell(row=r, column=c).font = f(9, False, "6B7280")
    st["O23"] = "※ 직접 지정 칸에 열 문자(B~M)를 쓰면 자동 인식보다 우선합니다."; st["O23"].font = f(9, False, "6B7280")
    st["O24"] = "※ 제목 줄이 없으면 B=날짜, D=입금, E=출금으로 읽습니다."; st["O24"].font = f(9, False, "6B7280")
    # helper lists for 직접 고르기 (제외 포함)
    st["T11"] = "목록(수입)"; st["U11"] = "목록(지출)"
    st["T12"] = "제외"; st["U12"] = "제외"
    for i in range(CATN - CAT0 + 1):
        st.cell(row=13 + i, column=20, value=f'=IF(B{CAT0 + i}="","",B{CAT0 + i})')
        st.cell(row=13 + i, column=21, value=f'=IF(E{CAT0 + i}="","",E{CAT0 + i})')
    st.column_dimensions["T"].hidden = True; st.column_dimensions["U"].hidden = True

INC = f"설정!$B${CAT0}:$B${CATN}"; EXP = f"설정!$E${CAT0}:$E${CATN}"
Y = "설정!$C$5"

# ================= 거래내역 =================
title(tx, "거래내역", "카드 매출, 현금 매출, 직접 낸 비용을 한 줄에 하나씩 입력하세요." + (" 통장 내역은 [통장붙여넣기]에 그대로 붙여넣으면 됩니다." if PRO else ""))
cols = ["날짜", "구분", "카테고리", "내용", "결제수단", "금액", "메모"]
for i, (h, w) in enumerate(zip(cols, [13, 9, 16, 28, 13, 14, 24])):
    tx.cell(row=5, column=2 + i, value=h); tx.column_dimensions[chr(66 + i)].width = w
header(tx, 5, range(2, 9)); tx.freeze_panes = "B6"
T0, TN = 6, 5 + NT

random.seed(11)
today = datetime.date(YEAR, 11, 23)
def days(m):
    last = (datetime.date(YEAR + (m == 12), m % 12 + 1, 1) - datetime.timedelta(days=1)).day
    return [d for d in range(1, last + 1) if datetime.date(YEAR, m, d) <= today]
seasonal = {1: .9, 2: .85, 3: .95, 4: 1, 5: 1.05, 6: 1.0, 7: 1.1, 8: 1.12, 9: 1.0, 10: 1.02, 11: 1.05, 12: 1.15}
txrows, bankrows = [], []
for m in range(1, 13):
    ds = days(m)
    if not ds: continue
    s = seasonal[m]
    for d in ds[::3]:  # 홀/포장 매출 3일마다 정산 입력
        txrows.append((datetime.date(YEAR, m, d), "수입", "홀매출", "3일치 홀매출(카드)", "카드", round(random.randrange(900, 1300) * s) * 1000))
        txrows.append((datetime.date(YEAR, m, d), "수입", "포장매출", "3일치 포장매출", random.choice(["카드", "현금"]), round(random.randrange(200, 400) * s) * 1000))
    for d in ds[::7]:
        txrows.append((datetime.date(YEAR, m, d), "지출", "식자재", "식자재 구매", random.choice(["카드", "현금"]), random.randrange(1500, 2300) * 1000))
        txrows.append((datetime.date(YEAR, m, d), "지출", "포장용기·소모품", "용기·비닐", "카드", random.randrange(150, 300) * 1000))
    txrows.append((datetime.date(YEAR, m, min(ds[-1], 20)), "지출", "카드수수료", "카드사 수수료", "계좌이체", random.randrange(150, 230) * 1000))
    # 통장 내역 (배달앱 정산, 고정비)
    for d in ds[::7]:
        bankrows.append((f"{YEAR}.{m:02d}.{d:02d} 10:12", "우아한형제들", round(random.randrange(2300, 3100) * s) * 1000, ""))
        bankrows.append((f"{YEAR}.{m:02d}.{d:02d} 11:40", "쿠팡이츠정산", round(random.randrange(900, 1400) * s) * 1000, ""))
        bankrows.append((f"{YEAR}.{m:02d}.{d:02d} 18:05", "바로고 배달대행", "", random.randrange(450, 650) * 1000))
    for d in ds[3::14]:
        bankrows.append((f"{YEAR}.{m:02d}.{d:02d} 09:30", "위대한상상", random.randrange(500, 800) * 1000, ""))
    pick = lambda dd: min(dd, ds[-1])
    bankrows += [
        (f"{YEAR}.{m:02d}.{pick(5):02d} 09:00", "월세 자동이체", "", 2500000),
        (f"{YEAR}.{m:02d}.{pick(10):02d} 09:00", "직원 급여", "", random.randrange(5800, 6300) * 1000),
        (f"{YEAR}.{m:02d}.{pick(18):02d} 09:00", "한국전력공사", "", random.randrange(450, 750) * 1000),
        (f"{YEAR}.{m:02d}.{pick(18):02d} 09:05", "도시가스", "", random.randrange(250, 480) * 1000),
        (f"{YEAR}.{m:02d}.{pick(25):02d} 09:00", "배민 수수료 정산", "", random.randrange(1900, 2500) * 1000),
        (f"{YEAR}.{m:02d}.{pick(25):02d} 09:10", "쿠팡이츠 수수료", "", random.randrange(700, 1000) * 1000),
        (f"{YEAR}.{m:02d}.{pick(15):02d} 14:00", "네이버 플레이스 광고", "", random.randrange(150, 300) * 1000),
    ]
    if m in (1, 7):
        bankrows.append((f"{YEAR}.{m:02d}.{pick(24):02d} 10:00", "세무서 부가세납부", "", random.randrange(2500, 4000) * 1000))
    if m == 3:
        bankrows.append((f"{YEAR}.{m:02d}.{pick(12):02d} 16:00", "본인이체 적금", "", 1000000))
bankrows.append((f"{YEAR}.11.20 15:00", "한빛상회", "", 380000))
txrows.sort(key=lambda x: x[0]); bankrows.sort(key=lambda x: x[0])
if not PRO:
    txrows = [r for r in txrows if r[0].month <= 3][:60]
if EMPTY:
    txrows, bankrows = [], []
for i, row in enumerate(txrows):
    for j, v in enumerate(row): tx.cell(row=T0 + i, column=2 + j, value=v)
for r in range(T0, TN + 1):
    for c in range(2, 9):
        x = tx.cell(row=r, column=c); x.border = border; x.font = f()
    tx.cell(row=r, column=2).number_format = "yyyy-mm-dd"; tx.cell(row=r, column=7).number_format = '#,##0"원"'
    tx.cell(row=r, column=3).alignment = Alignment(horizontal="center")
dv_t = DataValidation(type="list", formula1='"수입,지출"', allow_blank=True)
dv_c = DataValidation(type="list", formula1=f'IF($C{T0}="수입",{INC},{EXP})', allow_blank=True,
                      error="구분(수입/지출)에 맞는 카테고리를 목록에서 고르세요.", errorTitle="카테고리", showErrorMessage=False)
dv_p = DataValidation(type="list", formula1=f"설정!$J${CAT0}:$J${CATN}", allow_blank=True)
dv_d = DataValidation(type="date", operator="between", formula1="DATE(2000,1,1)", formula2="DATE(2100,12,31)", allow_blank=True,
                      error="날짜로 입력하세요. 예) 2026-03-15", errorTitle="날짜 오류", showErrorMessage=True)
dv_a = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                      error="금액은 0 이상의 숫자로 입력하세요. (지출도 양수로)", errorTitle="금액 오류", showErrorMessage=True)
for dv, col in ((dv_t, "C"), (dv_c, "D"), (dv_p, "F"), (dv_d, "B"), (dv_a, "G")):
    tx.add_data_validation(dv); dv.add(f"{col}{T0}:{col}{TN}")
R = f"B{T0}:H{TN}"
tx.conditional_formatting.add(f"D{T0}:D{TN}", FormulaRule(formula=[f'AND($D{T0}<>"",$C{T0}<>"",COUNTIF(IF($C{T0}="수입",{INC},{EXP}),$D{T0})=0)'], fill=fill(WARN)))
tx.conditional_formatting.add(R, FormulaRule(formula=[f'$C{T0}="수입"'], font=Font(color=GREEN)))
tx.conditional_formatting.add(R, FormulaRule(formula=[f'$C{T0}="지출"'], font=Font(color=RED)))
tx.auto_filter.ref = f"B5:H{TN}"

TD, TT, TC, TA = (f"거래내역!${c}${T0}:${c}${TN}" for c in "BCDG")

# ================= 통장붙여넣기 =================
if PRO:
    title(bank, "통장 내역 붙여넣기", "은행에서 받은 거래내역 엑셀을 제목 줄째로 복사해 B6칸에 그대로 붙여넣으세요. 열 순서는 자동으로 알아냅니다.")
    bank["B4"] = ('="인식 결과 ▶ 날짜 "&IF(설정!$R$13=0,"없음",CHAR(65+설정!$R$13))'
                  '&IF(설정!$R$20=2,"  ·  입금 "&CHAR(65+설정!$R$15)&"  ·  출금 "&CHAR(65+설정!$R$16),'
                  'IF(설정!$R$20=1,"  ·  금액 "&CHAR(65+설정!$R$17)&IF(설정!$R$18>0,"  ·  구분 "&CHAR(65+설정!$R$18),"  (+/- 부호로 판단)"),"  ·  ⚠ 입금/출금 열을 못 찾았습니다. [설정] 오른쪽 '
                  '통장 열 인식에서 직접 지정하세요."))&IF(설정!$R$19>0,"  ·  잔액 "&CHAR(65+설정!$R$19),"")'
                  '&IF(설정!$R$12>=6,"  ·  제목 줄 "&설정!$R$12&"행","  ·  제목 줄 없음")')
    bank["B4"].font = f(10, True, BLUE)
    bank["B5"] = "▼ 붙여넣기 영역 (B~M열, 은행 파일 그대로)"
    bank.merge_cells("B5:M5"); header(bank, 5, range(2, 14), BLUE)
    bh = ["인식된 날짜", "구분", "금액", "내용", "자동 분류", "직접 고르기", "최종 분류", "확인"]
    for i, h in enumerate(bh): bank.cell(row=5, column=15 + i, value=h)
    header(bank, 5, range(15, 23), NAVY); bank.cell(row=5, column=20).fill = fill(GREEN)
    bank.row_dimensions[5].height = 26
    widths(bank, {"B": 17, "C": 12, "D": 16, "E": 12, "F": 12, "G": 13, "H": 10, "I": 9, "J": 9, "K": 9, "L": 9, "M": 9, "N": 2,
                  "O": 12.5, "P": 6, "Q": 12, "R": 26, "S": 13, "T": 13, "U": 13, "V": 10})
    for col in ("X", "Y", "Z", "AA", "AB", "AC"): bank.column_dimensions[col].hidden = True
    B0, BN = 6, 5 + NP
    # sample: realistic export (title row, header row, 출금 before 입금, running balance)
    if bankrows:
        bank["B6"] = "OO은행 입출금 거래내역 (조회기간 2026.01.01 ~ 2026.11.23)"
        for j, h in enumerate(["거래일시", "적요", "기재내용", "출금액", "입금액", "잔액", "거래점"]):
            bank.cell(row=7, column=2 + j, value=h)
        bal = 12000000
        def jeokyo(c, i, o):
            if i: return "타행입금"
            for k, v in (("월세", "자동이체"), ("급여", "인터넷뱅킹"), ("한국전력", "지로"), ("가스", "지로"), ("바로고", "CMS"), ("수수료", "CMS"), ("세무서", "국세납부")):
                if k in c: return v
            return "인터넷뱅킹"
        for i, (d, c, inn, out) in enumerate(bankrows):
            inn = inn or 0; out = out or 0; bal += inn - out
            vals = [d, jeokyo(c, inn, out), c, out if out else 0, inn if inn else 0, bal, "인터넷"]
            for j, v in enumerate(vals): bank.cell(row=8 + i, column=2 + j, value=v)
            if c == "한빛상회": bank.cell(row=8 + i, column=20, value="식자재")
    K = f"설정!$L${RULE0}:$L${RULEN}"; V = f"설정!$M${RULE0}:$M${RULEN}"
    S_ = lambda c: f"설정!$R${c}"
    dcol, tcol, icol, ocol, acol, kcol, bcol, mode, hdr = (S_(x) for x in (13, 14, 15, 16, 17, 18, 19, 20, 21))
    def num(x, signed=False):
        core = f'--SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({x}&"",",",""),"원","")," ","")'
        return f'IFERROR({core if signed else "ABS(" + core + ")"},0)'
    kw = ["입금", "출금", "금액", "잔액", "일시", "일자", "날짜", "맡기신", "찾으신", "적요", "내용", "거래일", "구분"]
    for r in range(B0, BN + 1):
        row = f"$B{r}:$M{r}"
        IX = lambda c: f"INDEX({row},{c})"
        bank[f"X{r}"] = f'=IF(OR(ROW()<={hdr},COUNTA({row})=0,{dcol}=0),"",{IX(dcol)})'
        bank[f"AB{r}"] = f'=IF(OR(X{r}="",{tcol}=0),"",{IX(tcol)}&"")'
        amt = num(IX(acol), True)
        bank[f"Y{r}"] = (f'=IF(X{r}="","",IF({mode}=2,{num(IX(icol))},IF({mode}=1,IF({kcol}>0,IF(ISNUMBER(SEARCH("입",{IX(kcol)})),ABS({amt}),0),MAX(0,{amt})),0)))')
        bank[f"Z{r}"] = (f'=IF(X{r}="","",IF({mode}=2,{num(IX(ocol))},IF({mode}=1,IF({kcol}>0,IF(OR(ISNUMBER(SEARCH("출",{IX(kcol)})),ISNUMBER(SEARCH("지급",{IX(kcol)}))),ABS({amt}),0),MAX(0,-{amt})),0)))')
        bank[f"AA{r}"] = f'=IF(OR(X{r}="",{bcol}=0),"",IFERROR(--SUBSTITUTE(SUBSTITUTE({IX(bcol)}&"",",",""),"원",""),""))'
        if r <= 25:
            terms = "+".join(f'ISNUMBER(SEARCH("{k}",{row}))' for k in kw)
            bank[f"AC{r}"] = f'=IF(SUMPRODUCT((LEN({row})<=15)*(({terms})>0))>=3,ROW(),"")'
        x = f"X{r}"
        def mk(yv, mv, dv):
            return f'IF(AND({yv}>=2000,{yv}<=2100,{mv}>=1,{mv}<=12,{dv}>=1,{dv}<=DAY(DATE({yv},{mv}+1,0))),DATE({yv},{mv},{dv}),"날짜?")'
        T_ = f"TRIM({x})"
        n8 = mk(f"INT({x}/10000)", f"MOD(INT({x}/100),100)", f"MOD({x},100)")
        t8 = mk(f"--LEFT({T_},4)", f"--MID({T_},5,2)", f"--MID({T_},7,2)")
        tsep = mk(f"--LEFT({T_},4)", f"--MID({T_},6,2)", f"--MID({T_},9,2)")
        bank[f"O{r}"] = (f'=IF({x}="","",IF(ISNUMBER({x}),IF({x}>=19000101,{n8},IF(AND({x}>36526,{x}<73051),INT({x}),"날짜?")),'
                         f'IFERROR(IF(ISNUMBER(--MID({T_},5,1)),{t8},{tsep}),"날짜?")))')
        bank[f"P{r}"] = f'=IF({x}="","",IF(Y{r}>0,"수입",IF(Z{r}>0,"지출","")))'
        bank[f"Q{r}"] = f'=IF(P{r}="수입",Y{r},IF(P{r}="지출",Z{r},""))'
        cols = [chr(66 + i) for i in range(PC)]
        txt = "&".join(f'IF(AND(ISTEXT({c}{r}),ISNA(MATCH({i + 1},설정!$R$13:$R$19,0))),{c}{r}&" ","")' for i, c in enumerate(cols))
        bank[f"R{r}"] = f'=IF({x}="","",TRIM({txt}))'
        bank[f"S{r}"] = (f'=IF(P{r}="","",IFERROR(LOOKUP(2,1/(ISNUMBER(SEARCH({K},R{r}))*({K}<>"")*(((P{r}="수입")*COUNTIF({INC},{V})'
                         f'+(P{r}="지출")*COUNTIF({EXP},{V})+({V}="제외"))>0)),{V}),"미분류"))')
        bank[f"U{r}"] = f'=IF(P{r}="","",IF(T{r}<>"",T{r},S{r}))'
        dup = f'COUNTIFS(O${B0}:O{r},O{r},Q${B0}:Q{r},Q{r},P${B0}:P{r},P{r},AA${B0}:AA{r},AA{r},AB${B0}:AB{r},AB{r})>1'
        bank[f"V{r}"] = (f'=IF(P{r}="",IF(AND({x}<>"",N(Y{r})=0,N(Z{r})=0,COUNT({row})>0),"금액 없음",""),IF(OR(ISNUMBER(SEARCH("합계",{x})),ISNUMBER(SEARCH("총계",{x})),ISNUMBER(SEARCH("소계",{x}))),"합계 행",IF(NOT(ISNUMBER(O{r})),"날짜 확인",'
                         f'IF({dup},IF({bcol}>0,"중복 제외","중복 의심"),IF(YEAR(O{r})<>{Y},"다른 연도",IF(U{r}="미분류","미분류",IF(U{r}="제외","제외","")))))))')
        for c in range(2, 23):
            if c == 14: continue
            xcell = bank.cell(row=r, column=c); xcell.border = border; xcell.font = f(9 if c < 14 else 10)
            if c >= 15 and c != 20: xcell.fill = fill(GRAY)
            if c in (2, 20) or c < 14: xcell.protection = Protection(locked=False)
        bank[f"N{r}"].protection = Protection(locked=False)
        bank[f"O{r}"].number_format = "yyyy-mm-dd"; bank[f"Q{r}"].number_format = WON
        bank[f"P{r}"].alignment = Alignment(horizontal="center")
        for c in "EFG": bank[f"{c}{r}"].number_format = "#,##0;-#,##0;\"\""
    for c in "BCDEFGHIJKLMN": bank[f"{c}5"].protection = Protection(locked=False)
    dv_h = DataValidation(type="list", formula1=f'IF($P{B0}="수입",설정!$T$12:$T$27,설정!$U$12:$U$27)', allow_blank=True, showErrorMessage=False)
    bank.add_data_validation(dv_h); dv_h.add(f"T{B0}:T{BN}")
    VV = f"V{B0}:V{BN}"
    bank.conditional_formatting.add(f"S{B0}:U{BN}", FormulaRule(formula=[f'$U{B0}="미분류"'], fill=fill(WARN), font=Font(bold=True)))
    bank.conditional_formatting.add(VV, FormulaRule(formula=[f'OR(V{B0}="중복 제외",V{B0}="제외",V{B0}="다른 연도",V{B0}="합계 행")'], font=Font(color="9AA5B1")))
    bank.conditional_formatting.add(VV, FormulaRule(formula=[f'OR(V{B0}="날짜 확인",V{B0}="중복 의심",V{B0}="미분류",V{B0}="금액 없음")'], fill=fill(WARN), font=Font(bold=True, color=RED)))
    bank.conditional_formatting.add(f"O{B0}:U{BN}", FormulaRule(formula=[f'$V{B0}="중복 제외"'], font=Font(strike=True, color="9AA5B1")))
    bank.conditional_formatting.add(f"P{B0}:P{BN}", FormulaRule(formula=[f'P{B0}="수입"'], font=Font(color=GREEN)))
    bank.conditional_formatting.add(f"P{B0}:P{BN}", FormulaRule(formula=[f'P{B0}="지출"'], font=Font(color=RED)))
    bank.freeze_panes = "C6"
    BT, BC, BA, BD, BV = (f"통장붙여넣기!${c}${B0}:${c}${BN}" for c in "PUQOV")

def period(m1, m2):
    """date criteria pairs for [m1, m2] inclusive"""
    return (f'">="&DATE({Y},{m1},1)', f'"<"&DATE({Y},{m2 + 1},1)')
def total(kind, m1, m2, cat=None):
    lo, hi = period(m1, m2)
    if cat is None:
        s = f'SUMIFS({TA},{TC_or("tx")},"<>제외",{TT},"{kind}",{TD},{lo},{TD},{hi})'
        if PRO: s += f'+SUMIFS({BA},{BC},"<>제외",{BV},"<>중복 제외",{BT},"{kind}",{BD},{lo},{BD},{hi})'
    else:
        s = f'SUMIFS({TA},{TC},{cat},{TT},"{kind}",{TD},{lo},{TD},{hi})'
        if PRO: s += f'+SUMIFS({BA},{BC},{cat},{BV},"<>중복 제외",{BT},"{kind}",{BD},{lo},{BD},{hi})'
    return s
def TC_or(_): return TC

# ================= 월별요약 =================
title(mon, "월별 요약")
mon["B3"] = '=설정!C6&" · "&설정!C5&"년"'; mon["B3"].font = f(10, False, "6B7280")
mh = ["월", "매출", "지출", "순이익", "이익률"] + (["목표 매출", "달성률"] if PRO else [])
for i, h in enumerate(mh): mon.cell(row=5, column=2 + i, value=h)
header(mon, 5, range(2, 2 + len(mh)))
widths(mon, {"B": 7, "C": 14, "D": 14, "E": 14, "F": 9, "G": 14, "H": 9, "I": 3, "J": 16})
for m in range(1, 13):
    r = 5 + m
    mon.cell(row=r, column=2, value=f"{m}월")
    mon.cell(row=r, column=3, value="=" + total("수입", m, m))
    mon.cell(row=r, column=4, value="=" + total("지출", m, m))
    mon.cell(row=r, column=5, value=f"=C{r}-D{r}")
    mon.cell(row=r, column=6, value=f'=IF(C{r}=0,"-",E{r}/C{r})')
    if PRO:
        mon.cell(row=r, column=7, value="=설정!$C$8")
        mon.cell(row=r, column=8, value=f'=IF(OR(G{r}=0,C{r}=0),"-",C{r}/G{r})')
mon["B18"] = "합계"
for col in "CDE" + ("G" if PRO else ""): mon[f"{col}18"] = f"=SUM({col}6:{col}17)"
mon["F18"] = '=IF(C18=0,"-",E18/C18)'
if PRO: mon["H18"] = '=IF(OR(G18=0,C18=0),"-",C18/G18)'
last_col = 2 + len(mh) - 1
for r in range(6, 19):
    for c in range(2, last_col + 1):
        x = mon.cell(row=r, column=c); x.border = border; x.font = f(10, r == 18)
        if r == 18: x.fill = fill(LIGHT)
        x.number_format = PCT if c in (6, 8) else WON0
    mon.cell(row=r, column=2).alignment = Alignment(horizontal="center")
mon.conditional_formatting.add("E6:E18", CellIsRule(operator="lessThan", formula=["0"], font=Font(color=RED, bold=True)))
if PRO:
    mon.conditional_formatting.add("H6:H18", CellIsRule(operator="greaterThanOrEqual", formula=["1"], font=Font(color=GREEN, bold=True)))
mon.freeze_panes = "C6"

def matrix(top, label, kind, srccol, color):
    mon.cell(row=top - 1, column=10, value=label).font = f(12, True, NAVY)
    mon.cell(row=top, column=10, value="카테고리")
    for m in range(1, 13):
        mon.cell(row=top, column=10 + m, value=f"{m}월"); mon.column_dimensions[mon.cell(row=top, column=10 + m).column_letter].width = 11
    mon.cell(row=top, column=23, value="합계"); mon.column_dimensions["W"].width = 13
    header(mon, top, range(10, 24), color)
    for i in range(CATN - CAT0 + 1):
        r = top + 1 + i; src = f"설정!{srccol}{CAT0 + i}"
        mon.cell(row=r, column=10, value=f'=IF({src}="","",{src})')
        for m in range(1, 13):
            mon.cell(row=r, column=10 + m, value=f'=IF($J{r}="",0,{total(kind, m, m, f"$J{r}")})')
        mon.cell(row=r, column=23, value=f"=SUM(K{r}:V{r})")
        for c in range(10, 24):
            x = mon.cell(row=r, column=c); x.border = border; x.font = f(9 if c > 10 else 10, c == 23); x.number_format = WON0
    return top + 1
INC_TOP = 5; EXP_TOP = 24
inc_first = matrix(INC_TOP, "카테고리별 매출", "수입", "B", GREEN)
exp_first = matrix(EXP_TOP, "카테고리별 지출", "지출", "E", RED)
mon["J4"].value = "카테고리별 매출"
mon.cell(row=EXP_TOP - 2, column=10)  # spacing
if PRO:
    mon["J41"] = "미분류 (통장붙여넣기에서 카테고리를 못 찾은 내역)"; mon["J41"].font = f(10, True, RED)
    mon["W41"] = f'=SUMIFS({BA},{BC},"미분류",{BV},"<>중복 제외")'; mon["W41"].number_format = WON; mon["W41"].font = f(10, True, RED)
IM = lambda m: chr(ord("K") + m - 1)  # month column letter in matrices

# ================= 손익·부가세 =================
if PRO:
    title(ana, "손익분기점 · 배달 수수료 · 부가세 예상")
    ana["B3"] = '=설정!C6&" · "&설정!C5&"년 · "&설정!C7'; ana["B3"].font = f(10, False, "6B7280")
    widths(ana, {"B": 9, "C": 14, "D": 14, "E": 14, "F": 10, "G": 15, "H": 14, "I": 3, "J": 9, "K": 14, "L": 14, "M": 11})
    ana["B5"] = "① 손익분기점: 한 달에 최소 이만큼 팔아야 적자가 아닙니다"; ana["B5"].font = f(12, True, NAVY)
    for i, h in enumerate(["월", "매출", "고정비", "변동비", "변동비율", "손익분기 매출", "여유 매출"]): ana.cell(row=6, column=2 + i, value=h)
    header(ana, 6, range(2, 9))
    ef, el = exp_first, exp_first + CATN - CAT0; inf, il = inc_first, inc_first + CATN - CAT0
    for m in range(1, 13):
        r = 6 + m; mc = IM(m)
        ana.cell(row=r, column=2, value=f"{m}월")
        ana.cell(row=r, column=3, value=f"=월별요약!C{5 + m}")
        ana.cell(row=r, column=4, value=f'=SUMPRODUCT((설정!$F${CAT0}:$F${CATN}="Y")*월별요약!{mc}{ef}:{mc}{el})')
        ana.cell(row=r, column=5, value=f"=월별요약!D{5 + m}-D{r}")
        ana.cell(row=r, column=6, value=f'=IF(C{r}=0,"-",E{r}/C{r})')
        ana.cell(row=r, column=7, value=f'=IF(OR(C{r}=0,F{r}>=1),"-",D{r}/(1-F{r}))')
        ana.cell(row=r, column=8, value=f'=IF(G{r}="-","-",C{r}-G{r})')
        for c in range(2, 9):
            x = ana.cell(row=r, column=c); x.border = border; x.font = f(10, c == 7); x.number_format = PCT if c == 6 else WON0
        ana.cell(row=r, column=2).alignment = Alignment(horizontal="center")
    ana.conditional_formatting.add("H7:H18", CellIsRule(operator="lessThan", formula=["0"], font=Font(color=RED, bold=True), fill=fill("FDECEA")))
    ana.conditional_formatting.add("H7:H18", CellIsRule(operator="greaterThanOrEqual", formula=["0"], font=Font(color=GREEN, bold=True)))
    ana["B19"] = "고정비 = 설정에서 '고정비 Y'인 지출 / 변동비율 = 변동비 ÷ 매출 / 손익분기 매출 = 고정비 ÷ (1 − 변동비율)"; ana["B19"].font = f(9, False, "6B7280")

    ana["J5"] = "② 배달 수수료율"; ana["J5"].font = f(12, True, NAVY)
    for i, h in enumerate(["월", "배달앱 매출", "배달 비용", "수수료율"]): ana.cell(row=6, column=10 + i, value=h)
    header(ana, 6, range(10, 14))
    for m in range(1, 13):
        r = 6 + m; mc = IM(m)
        ana.cell(row=r, column=10, value=f"{m}월")
        ana.cell(row=r, column=11, value=f'=SUMPRODUCT((설정!$C${CAT0}:$C${CATN}="Y")*월별요약!{mc}{inf}:{mc}{il})')
        ana.cell(row=r, column=12, value=f'=SUMPRODUCT((설정!$H${CAT0}:$H${CATN}="Y")*월별요약!{mc}{ef}:{mc}{el})')
        ana.cell(row=r, column=13, value=f'=IF(K{r}=0,"-",L{r}/K{r})')
        for c in range(10, 14):
            x = ana.cell(row=r, column=c); x.border = border; x.font = f(10, c == 13); x.number_format = PCT if c == 13 else WON0
        ana.cell(row=r, column=10).alignment = Alignment(horizontal="center")
    ana["J19"] = "배달앱 매출 100원 중 수수료·배달대행비로 나가는 비율"; ana["J19"].font = f(9, False, "6B7280")
    ana.conditional_formatting.add("M7:M18", CellIsRule(operator="greaterThan", formula=["0.3"], font=Font(color=RED, bold=True)))

    ana["B22"] = "③ 부가세 예상 (참고용)"; ana["B22"].font = f(12, True, NAVY)
    for i, h in enumerate(["기간", "매출(부가세 포함)", "공제 매입", "일반과세 예상", "간이과세 예상", "내 유형 예상 납부액"]):
        ana.cell(row=23, column=2 + i, value=h)
    header(ana, 23, range(2, 8)); ana.row_dimensions[23].height = 28
    ana.merge_cells("B23:B23")
    periods = [("1기(1~6월)", 1, 6), ("2기(7~12월)", 7, 12), ("연간", 1, 12)]
    for i, (lab, a, b) in enumerate(periods):
        r = 24 + i
        ana.cell(row=r, column=2, value=lab)
        ana.cell(row=r, column=3, value=f"=SUM(월별요약!C{5 + a}:C{5 + b})")
        ana.cell(row=r, column=4, value=f'=SUMPRODUCT((설정!$G${CAT0}:$G${CATN}="Y")*월별요약!{IM(a)}{ef}:{IM(b)}{el})')
        ana.cell(row=r, column=5, value=f"=MAX(0,ROUND(C{r}/11-D{r}/11,-1))")
        if lab == "연간":
            ana.cell(row=r, column=6, value=f'=IF(C{r}<48000000,0,MAX(0,ROUND(C{r}*0.15*0.1-D{r}*0.005,-1)))')
            ana.cell(row=r, column=7, value=f'=IF(설정!$C$7="간이과세자",F{r},E{r})')
        else:
            ana.cell(row=r, column=6, value="-"); ana.cell(row=r, column=7, value=f'=IF(설정!$C$7="간이과세자","-",E{r})')
        for c in range(2, 8):
            x = ana.cell(row=r, column=c); x.border = border; x.font = f(10, c == 7 or lab == "연간"); x.number_format = WON0
            if lab == "연간": x.fill = fill(LIGHT)
        ana.cell(row=r, column=7).font = f(11, True, BLUE)
        ana.cell(row=r, column=6).alignment = Alignment(horizontal="right")
    notes = ["일반과세자: (매출 − 공제 매입) ÷ 11. 1기는 7월, 2기는 다음 해 1월에 신고합니다.",
             "간이과세자(음식점): 매출 × 업종 부가가치율 15% × 10% − 공제 매입 × 0.5%. 연 매출 4,800만 원 미만이면 납부 면제. 1월에 1년치를 신고합니다.",
             "의제매입세액공제(면세 식자재), 신용카드매출전표 발행세액공제는 넣지 않았습니다. 실제 납부액은 보통 이보다 적습니다.",
             "정확한 금액은 홈택스나 세무사를 통해 확인하세요. 이 표는 미리 돈을 떼어 두기 위한 참고용입니다."]
    for i, n in enumerate(notes):
        ana.cell(row=28 + i, column=2, value="※ " + n).font = f(9, False, "6B7280")
    ana["B33"] = '=IF(AND(설정!$C$7="간이과세자",C26>=104000000),"⚠ 연 매출이 1억 400만 원 이상이면 다음 해부터 일반과세자로 바뀔 수 있습니다. 세무서 안내를 확인하세요.","")'
    ana["B33"].font = f(10, True, RED)

# ================= 대시보드 =================
if PRO:
    title(dash, "대시보드")
    dash["B3"] = '=설정!C6&" · "&설정!C5&"년"'; dash["B3"].font = f(10, False, "6B7280")
    for i in range(2, 16): dash.column_dimensions[chr(64 + i)].width = 10.5
    dash["P2"] = f'=IF(YEAR(TODAY())={Y},MONTH(TODAY()),12)'; dash["P2"].font = f(8, False, "FFFFFF")
    tiles = [("B", "연 매출", "=월별요약!C18", '#,##0"원"', GREEN),
             ("E", "순이익 (이익률)", '=TEXT(월별요약!E18,"#,##0")&"원 ("&IFERROR(TEXT(월별요약!F18,"0%"),"-")&")"', "@", NAVY),
             ("H", "이번 달 목표 달성률", '=IFERROR(INDEX(월별요약!H6:H17,$P$2),"-")', PCT, BLUE),
             ("K", "부가세 예상 (현재 기수)", "=IF($P$2<=6,'손익·부가세'!G24,IF(설정!C7=\"간이과세자\",'손익·부가세'!G26,'손익·부가세'!G25))", '#,##0"원"', RED)]
    for col, lab, fm, nf, color in tiles:
        n2 = chr(ord(col) + 2)
        dash[f"{col}5"] = lab; dash[f"{col}5"].font = f(9, True, "6B7280")
        dash[f"{col}6"] = fm; dash[f"{col}6"].font = f(15, True, color); dash[f"{col}6"].number_format = nf; dash[f"{col}6"].alignment = Alignment(horizontal="left", vertical="center")
        dash.merge_cells(f"{col}5:{n2}5"); dash.merge_cells(f"{col}6:{n2}6")
        for r in (5, 6):
            for c in range(ord(col), ord(n2) + 1): dash[f"{chr(c)}{r}"].fill = fill(GRAY)
    dash["H5"] = '=$P$2&"월 목표 달성률"'
    dash.row_dimensions[6].height = 30
    TT_, TC_, TD_, TA_ = TT, TC, TD, TA
    checks = [
        ("통장 미분류", f'COUNTIF({BV},"미분류")', True),
        ("카테고리 불일치", f'SUMPRODUCT(({TT_}="수입")*({TC_}<>"")*(COUNTIF({INC},{TC_})=0))+SUMPRODUCT(({TT_}="지출")*({TC_}<>"")*(COUNTIF({EXP},{TC_})=0))'
                       f'+SUMPRODUCT(({BT}="수입")*({BC}<>"미분류")*({BC}<>"제외")*({BC}<>"")*(COUNTIF({INC},{BC})=0))+SUMPRODUCT(({BT}="지출")*({BC}<>"미분류")*({BC}<>"제외")*({BC}<>"")*(COUNTIF({EXP},{BC})=0))', True),
        ("거래내역 입력 누락", f'SUMPRODUCT(({TA_}<>"")*((({TD_}="")+({TT_}="")+({TC_}=""))>0))', True),
        ("날짜 인식 실패", f'COUNTIF({BV},"날짜 확인")', True),
        ("금액 없는 행", f'COUNTIF({BV},"금액 없음")', True),
        ("중복 의심 (잔액 열 없음)", f'COUNTIF({BV},"중복 의심")', True),
        ("중복 자동 제외", f'COUNTIF({BV},"중복 제외")', False),
        ("다른 연도 (합계 제외)", f'COUNTIF({BV},"다른 연도")+SUMPRODUCT(ISNUMBER({TD_})*((({TD_}<DATE({Y},1,1))+({TD_}>=DATE({Y}+1,1,1)))>0))', False),
        ("합계 행 (자동 제외)", f'COUNTIF({BV},"합계 행")', False),
    ]
    dash["Q6"] = "데이터 점검"; dash["Q6"].font = f(12, True, NAVY); dash["Q6"].alignment = Alignment(vertical="bottom")
    dash["Q7"] = "항목"; dash["R7"] = "건수"; dash["S7"] = "상태"; header(dash, 7, (17, 18, 19))
    widths(dash, {"P": 3, "Q": 22, "R": 7, "S": 9})
    for i, (lab, fm, warn) in enumerate(checks):
        r = 8 + i
        dash.cell(row=r, column=17, value=lab); dash.cell(row=r, column=18, value="=" + fm)
        dash.cell(row=r, column=19, value=f'=IF(R{r}=0,"✓",{"\"확인\"" if warn else "\"안내\""})')
        for c in (17, 18, 19):
            x = dash.cell(row=r, column=c); x.border = border; x.font = f(10)
        dash.cell(row=r, column=18).alignment = Alignment(horizontal="center"); dash.cell(row=r, column=19).alignment = Alignment(horizontal="center")
    last = 8 + len(checks)
    dash.cell(row=last, column=17, value="통장 열 인식"); dash.cell(row=last, column=18, value="=설정!R20")
    dash.cell(row=last, column=19, value='=IF(R%d=0,"확인","✓")' % last)
    for c in (17, 18, 19):
        x = dash.cell(row=last, column=c); x.border = border; x.font = f(10)
    dash.cell(row=last, column=18).font = f(10, False, "FFFFFF")
    dash.conditional_formatting.add(f"S8:S{last}", FormulaRule(formula=['S8="확인"'], font=Font(color=RED, bold=True), fill=fill("FDECEA")))
    dash.conditional_formatting.add(f"S8:S{last}", FormulaRule(formula=['S8="✓"'], font=Font(color=GREEN, bold=True)))
    dash.conditional_formatting.add(f"S8:S{last}", FormulaRule(formula=['S8="안내"'], font=Font(color=BLUE)))
    dash.cell(row=last + 1, column=17, value="확인: 고쳐야 할 내역 / 안내: 자동으로 처리됨").font = f(8, False, "6B7280")
    dash["B8"] = f'=IF(COUNTIF(S8:S{last},"확인")=0,"✓ 데이터 점검 통과: 확인할 내역이 없습니다.","⚠ 데이터 점검: 확인이 필요한 항목이 "&COUNTIF(S8:S{last},"확인")&"개 있습니다. 오른쪽 표를 보세요.")'
    dash["B8"].font = f(10, True, "6B7280")
    dash.conditional_formatting.add("B8", FormulaRule(formula=[f'COUNTIF($S$8:$S${last},"확인")>0'], font=Font(color=RED, bold=True)))

    # hidden chart helper
    ch = wb.create_sheet("_차트"); ch.sheet_state = "hidden"
    ch["A1"] = "지출"; ch["C1"] = "매출"
    for i in range(CATN - CAT0 + 1):
        ch.cell(row=2 + i, column=1, value=f"=월별요약!J{exp_first + i}")
        ch.cell(row=2 + i, column=2, value=f"=IF(OR(월별요약!J{exp_first + i}=\"\",월별요약!W{exp_first + i}<=0),NA(),월별요약!W{exp_first + i})")
        ch.cell(row=2 + i, column=3, value=f"=월별요약!J{inc_first + i}")
        ch.cell(row=2 + i, column=4, value=f"=IF(OR(월별요약!J{inc_first + i}=\"\",월별요약!W{inc_first + i}<=0),NA(),월별요약!W{inc_first + i})")
    n = CATN - CAT0 + 1

    bar = BarChart(); bar.type = "col"; bar.title = "월별 매출 · 지출 · 순이익"; bar.height = 8.5; bar.width = 25
    bar.y_axis.numFmt = '#,##0,,"백만"'; bar.y_axis.majorGridlines = None
    bar.add_data(Reference(mon, min_col=3, max_col=4, min_row=5, max_row=17), titles_from_data=True)
    bar.set_categories(Reference(mon, min_col=2, min_row=6, max_row=17))
    bar.series[0].graphicalProperties.solidFill = GREEN; bar.series[1].graphicalProperties.solidFill = "E08E85"
    ln = LineChart(); ln.add_data(Reference(mon, min_col=5, min_row=5, max_row=17), titles_from_data=True)
    ln.series[0].graphicalProperties.line.solidFill = NAVY; ln.series[0].graphicalProperties.line.width = 28000; ln.series[0].smooth = False
    bar += ln; bar.legend.position = "b"
    dash.add_chart(bar, "B10")

    def pie(tcol, vcol, ttl, anchor):
        p = PieChart(); p.title = ttl; p.height = 8.5; p.width = 12.3
        p.add_data(Reference(ch, min_col=vcol, min_row=2, max_row=1 + n), titles_from_data=False)
        p.set_categories(Reference(ch, min_col=tcol, min_row=2, max_row=1 + n))
        p.dataLabels = DataLabelList()
        for k in ("showVal", "showSerName", "showLegendKey"): setattr(p.dataLabels, k, False)
        p.dataLabels.showPercent = True; p.dataLabels.showCatName = True; p.dataLabels.position = "bestFit"
        p.dataLabels.separator = "\n"; p.legend = None
        dash.add_chart(p, anchor)
    pie(3, 4, "매출 채널 (연간)", "B28")
    pie(1, 2, "지출 구성 (연간)", "I28")

    # ================= 월간리포트 =================
    R_ = rep_ws
    title(R_, "월간 리포트", None)
    R_["B3"] = '=설정!C6&" · "&설정!C5&"년 "&$C$5&"월"'; R_["B3"].font = f(11, True, "6B7280")
    widths(R_, {"B": 20, "C": 15, "D": 15, "E": 14, "F": 14, "G": 3})
    R_["B5"] = "월 선택 (1~12)"; R_["B5"].font = f(10, True); R_["B5"].fill = fill(LIGHT); R_["B5"].border = border
    R_["C5"] = "=대시보드!$P$2"; R_["C5"].font = f(12, True, BLUE); R_["C5"].fill = fill(YEL); R_["C5"].border = border
    R_["C5"].protection = Protection(locked=False); R_["C5"].alignment = Alignment(horizontal="center")
    dvm = DataValidation(type="whole", operator="between", formula1="1", formula2="12", error="1~12 사이 숫자를 입력하세요.", errorTitle="월", showErrorMessage=True)
    R_.add_data_validation(dvm); dvm.add("C5")
    for i, h in enumerate(["항목", "이번 달", "전월", "증감", "증감률"]): R_.cell(row=7, column=2 + i, value=h)
    header(R_, 7, range(2, 7))
    items = [("매출", "월별요약!$C$6:$C$17", "m"), ("지출", "월별요약!$D$6:$D$17", "m"), ("순이익", "월별요약!$E$6:$E$17", "m"),
             ("이익률", "월별요약!$F$6:$F$17", "p"), ("목표 달성률", "월별요약!$H$6:$H$17", "p"),
             ("손익분기 매출", "'손익·부가세'!$G$7:$G$18", "m"), ("배달 수수료율", "'손익·부가세'!$M$7:$M$18", "p")]
    for i, (lab, rng, kind) in enumerate(items):
        r = 8 + i
        R_.cell(row=r, column=2, value=lab)
        R_.cell(row=r, column=3, value=f"=INDEX({rng},$C$5)")
        R_.cell(row=r, column=4, value=f'=IF($C$5=1,"-",INDEX({rng},$C$5-1))')
        R_.cell(row=r, column=5, value=f'=IF(OR(ISTEXT(C{r}),ISTEXT(D{r})),"-",C{r}-D{r})')
        R_.cell(row=r, column=6, value=(f'=IF(OR(ISTEXT(C{r}),ISTEXT(D{r})),"-",IF(D{r}=0,"-",(C{r}-D{r})/ABS(D{r})))' if kind == "m" else '="-"'))
        for c in range(2, 7):
            x = R_.cell(row=r, column=c); x.border = border; x.font = f(10, c == 3)
            x.number_format = (WON0 if kind == "m" else PCT) if c in (3, 4) else ('+#,##0;-#,##0;0' if kind == "m" else '+0.0%;-0.0%;0.0%') if c == 5 else '+0.0%;-0.0%;0.0%'
            if c > 2: x.alignment = Alignment(horizontal="right")
    R_.conditional_formatting.add("E8:F10", CellIsRule(operator="lessThan", formula=["0"], font=Font(color=RED)))
    R_.conditional_formatting.add("E8:F8", CellIsRule(operator="greaterThan", formula=["0"], font=Font(color=GREEN)))
    def cat_table(top, label, first, kind_color, total_cell):
        R_.cell(row=top - 1, column=2, value=label).font = f(12, True, NAVY)
        for i, h in enumerate(["카테고리", "이번 달", "비중", "전월", "증감"]): R_.cell(row=top, column=2 + i, value=h)
        header(R_, top, range(2, 7), kind_color)
        for i in range(CATN - CAT0 + 1):
            r = top + 1 + i; src = first + i
            R_.cell(row=r, column=2, value=f"=월별요약!J{src}")
            R_.cell(row=r, column=3, value=f'=IF(B{r}="","",INDEX(월별요약!$K{src}:$V{src},$C$5))')
            R_.cell(row=r, column=4, value=f'=IF(OR(B{r}="",N({total_cell})=0),"",C{r}/{total_cell})')
            R_.cell(row=r, column=5, value=f'=IF(OR(B{r}="",$C$5=1),"",INDEX(월별요약!$K{src}:$V{src},$C$5-1))')
            R_.cell(row=r, column=6, value=f'=IF(OR(B{r}="",$C$5=1),"",C{r}-E{r})')
            for c in range(2, 7):
                x = R_.cell(row=r, column=c); x.border = border; x.font = f(10)
                x.number_format = PCT if c == 4 else ('+#,##0;-#,##0;""' if c == 6 else WON0)
        return top + 1
    cat_table(18, "매출 구성", inc_first, GREEN, "$C$8")
    cat_table(37, "지출 구성", exp_first, RED, "$C$9")
    R_["B55"] = "한 줄 요약"; R_["B55"].font = f(12, True, NAVY)
    R_["B56"] = ('=IF(N(C8)=0,"이 달에는 입력된 매출이 없습니다.",$C$5&"월 매출은 "&TEXT(C8,"#,##0")&"원"&IF(ISNUMBER(F8),"(전월 대비 "&TEXT(F8,"+0.0%;-0.0%")&")","")'
                 '&", 순이익은 "&TEXT(C10,"#,##0")&"원입니다. 가장 큰 지출은 "&INDEX(B38:B52,MATCH(MAX(C38:C52),C38:C52,0))&"("&TEXT(MAX(C38:C52)/MAX(1,C9),"0%")&")입니다.")')
    R_["B56"].font = f(11); R_["B56"].alignment = Alignment(wrap_text=True, vertical="top"); R_.merge_cells("B56:F58")
    R_.row_dimensions[56].height = 20
    # chart helper for selected month
    ch["E1"] = "이번 달 지출"
    for i in range(CATN - CAT0 + 1):
        src = exp_first + i
        ch.cell(row=2 + i, column=5, value=f"=월별요약!J{src}")
        ch.cell(row=2 + i, column=6, value=f'=IF(월별요약!J{src}="",NA(),IF(INDEX(월별요약!$K{src}:$V{src},월간리포트!$C$5)<=0,NA(),INDEX(월별요약!$K{src}:$V{src},월간리포트!$C$5)))')
    hb = BarChart(); hb.type = "bar"; hb.title = "이번 달 지출"; hb.height = 11; hb.width = 12; hb.x_axis.tickLblSkip = 1; hb.legend = None
    hb.add_data(Reference(ch, min_col=6, min_row=2, max_row=1 + n), titles_from_data=False)
    hb.set_categories(Reference(ch, min_col=5, min_row=2, max_row=1 + n))
    hb.series[0].graphicalProperties.solidFill = "E08E85"; hb.y_axis.numFmt = '#,##0,"천"'; hb.x_axis.scaling.orientation = "maxMin"
    hb.y_axis.majorGridlines = None
    R_.add_chart(hb, "H7")

# ================= 사용법 =================
title(guide, "배달·홀 음식점 매출장부" + (" PRO" if PRO else " LITE (무료 체험판)"),
      "입력하거나 붙여넣기만 하면 손익과 차트가 자동으로 계산됩니다.")
widths(guide, {"B": 7, "C": 92})
steps = [("1", "[설정] 연도, 상호명" + (", 과세유형, 월 목표 매출" if PRO else "") + "을 입력하세요. 카테고리 이름도 가게에 맞게 바꿀 수 있습니다.")]
if PRO:
    steps += [("2", "[통장붙여넣기] 인터넷뱅킹에서 거래내역을 엑셀로 내려받아 제목 줄째로 복사해 B6칸에 붙여넣으세요. 은행마다 열 순서가 달라도 날짜·입금·출금·잔액 열을 자동으로 찾고, '우아한형제들' → 배민, '한국전력' → 공과금처럼 분류합니다."),
              ("2+", "다음 달 내역은 기존 내역 바로 아래 빈 칸에 이어 붙이세요. 기간이 겹쳐도 잔액 열이 있으면 같은 거래는 자동으로 한 번만 계산됩니다. 은행 파일 맨 아래 '합계' 줄도 자동으로 빠집니다."),
              ("3", "[거래내역] 통장에 안 찍히는 것(현금 매출, 카드로 산 식자재 등)만 직접 입력하세요."),
              ("4", "[대시보드]·[월별요약]·[손익·부가세]에서 결과를 확인하세요. 손익분기점, 배달 수수료율, 부가세 예상액이 자동 계산됩니다."),
              ("!", "같은 돈을 두 번 넣지 마세요. 카드 매출 정산 입금이 통장에 찍힌다면 [거래내역]에 카드 매출을 따로 입력하지 않습니다. 본인 계좌 간 이동은 '제외'로 분류하세요."),
              ("TIP", "노란색으로 표시된 '미분류' 내역은 [직접 고르기] 칸에서 카테고리를 고르세요. 자주 나오는 내용은 [설정]의 자동 분류 규칙에 추가하면 다음부터 자동입니다."),
              ("✓", "[대시보드] 오른쪽 '데이터 점검' 표가 모두 ✓이면 숫자를 믿어도 됩니다. '확인'이 뜨면 해당 시트의 노란 칸을 보세요."),
              ("5", "[월간리포트]에서 월을 고르면 전월 대비 증감과 카테고리별 비중이 한 장으로 정리됩니다. 동업자·세무사에게 보낼 때 쓰세요."),
              ("🔒", "수식 칸은 실수로 지워지지 않게 잠가 두었습니다(암호 없음). 구조를 바꾸고 싶으면 [검토] → [시트 보호 해제]를 누르세요."),
              ("TIP", "예시가 든 파일과 빈 파일 두 개가 있습니다. 실제로 쓸 때는 '빈 양식' 파일을 쓰세요."),
              ("한계", "한 파일에서는 한 가지 은행 양식만 자동 인식합니다. 다른 은행 통장 내역은 열 순서를 첫 번째 은행과 같게 맞춰 붙이거나, 파일을 하나 더 쓰세요.")]
else:
    steps += [("2", "[거래내역]에 날짜 / 구분 / 카테고리 / 금액을 입력하세요."),
              ("3", "[월별요약]에서 월별 매출, 지출, 순이익, 이익률과 카테고리별 합계를 확인하세요."),
              ("PRO", "PRO 버전에는 통장 내역 붙여넣기 자동 분류, 손익분기점, 배달 수수료율, 부가세 예상, 차트 대시보드가 추가됩니다.")]
steps += [("TIP", "엑셀 2016 이상, 엑셀 365, 맥용 엑셀에서 작동합니다. 구글 스프레드시트에서도 계산은 모두 작동하지만 일부 드롭다운 목록은 엑셀에서만 보입니다.")]
r = 5
for k, v in steps:
    a = guide.cell(row=r, column=2, value=k); a.font = f(11, True, "FFFFFF")
    a.fill = fill({"TIP": GREEN, "!": RED, "PRO": NAVY, "✓": GREEN, "🔒": NAVY, "한계": "6B7280"}.get(k, BLUE)); a.alignment = Alignment(horizontal="center", vertical="center")
    c = guide.cell(row=r, column=3, value=v); c.font = f(11); c.alignment = Alignment(wrap_text=True, vertical="center"); c.fill = fill(GRAY)
    guide.row_dimensions[r].height = 40; r += 2

# ================= finish =================
tabs = {"사용법": GREEN, "대시보드": NAVY, "거래내역": BLUE, "통장붙여넣기": BLUE, "월간리포트": NAVY}
for ws in wb.worksheets:
    ws.sheet_properties.tabColor = tabs.get(ws.title, "9AA5B1")
    if ws.title == "_차트": continue
    ws.page_setup.orientation = "landscape"; ws.page_setup.paperSize = 9
    ws.sheet_properties.pageSetUpPr.fitToPage = True; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
def unlock(ws, rng):
    for row in ws[rng]:
        for c in row: c.protection = Protection(locked=False)
for r in range(T0, TN + 1):
    for c in range(2, 9): tx.cell(row=r, column=c).protection = Protection(locked=False)
unlock(st, "C5:C8"); unlock(st, f"B{CAT0}:C{CATN}"); unlock(st, f"E{CAT0}:H{CATN}"); unlock(st, f"J{CAT0}:J{CATN}")
if PRO:
    unlock(st, f"L{RULE0}:M{RULEN}"); unlock(st, "Q12:Q19")
for ws in wb.worksheets:
    if ws.title == "_차트": continue
    ws.protection = SheetProtection(sheet=True, formatCells=False, formatColumns=False, formatRows=False, autoFilter=False, sort=False)
if PRO:
    rep_ws.page_setup.orientation = "portrait"; rep_ws.page_setup.fitToHeight = 1; rep_ws.print_area = "A1:N58"
    dash.page_setup.fitToHeight = 1; dash.print_area = "A1:S46"
    ana.page_setup.fitToHeight = 1; ana.print_area = "A1:N32"
    bank.print_area = "A1:V45"
tx.print_area = "A1:I45"; mon.page_setup.fitToHeight = 1
mon.print_area = "A1:W41" if PRO else "A1:W40"
wb.active = 0
wb.save(OUT)
print("saved", OUT, "tx", len(txrows), "bank", len(bankrows) if PRO else 0)
