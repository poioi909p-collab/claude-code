"""Stress tests for 음식점매출장부 PRO: inject bank exports of many shapes, recalc with LibreOffice, compare."""
import openpyxl, random, datetime, subprocess, os, shutil, time, sys
BASE = "v3/empty.xlsx"; OUT = "v3/tests"
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT + "/in"); os.makedirs(OUT + "/out")
random.seed(5)
POOL_IN = [("우아한형제들", "배민"), ("쿠팡이츠정산", "쿠팡이츠"), ("위대한상상", "요기요"), ("KB국민카드 매출대금", "홀매출")]
POOL_OUT = [("바로고 배달대행", "배달대행비"), ("한국전력공사", "공과금"), ("월세 자동이체", "임대료"), ("직원 급여", "인건비"),
            ("배민 수수료 정산", "배달앱수수료"), ("네이버 광고", "광고비"), ("알수없음상회", "미분류")]

def gen(n, year=2026):
    rows, bal = [], 5_000_000
    for i in range(n):
        d = datetime.datetime(year, 1, 1) + datetime.timedelta(minutes=random.randrange(0, 364 * 24 * 60))
        if random.random() < .45:
            c, cat = random.choice(POOL_IN); amt = random.randrange(10, 400) * 1000; inn, out = amt, 0
        else:
            c, cat = random.choice(POOL_OUT); amt = random.randrange(10, 300) * 1000; inn, out = 0, amt
        rows.append([d, c, cat, inn, out])
    rows.sort(key=lambda r: r[0])
    for r in rows:
        bal += r[3] - r[4]; r.append(bal)
    return rows  # [dt, content, cat, in, out, bal]

def fmt(x): return f"{x:,}"

def write(name, grid, start_row=6):
    wb = openpyxl.load_workbook(BASE); ws = wb["통장붙여넣기"]
    for i, row in enumerate(grid):
        for j, v in enumerate(row):
            if v is not None and v != "": ws.cell(row=start_row + i, column=2 + j, value=v)
    wb.save(f"{OUT}/in/{name}.xlsx")

cases = {}
def case(name, grid, exp_in, exp_out, cats=None, extra=None):
    write(name, grid); cases[name] = dict(exp_in=exp_in, exp_out=exp_out, cats=cats, extra=extra or {})

A = gen(120)
sumA = (sum(r[3] for r in A), sum(r[4] for r in A))
catsA = [r[2] for r in A]
gridA = [["OO은행 입출금 거래내역조회"], ["조회기간: 2026.01.01 ~ 2026.12.31"], [],
         ["거래일시", "적요", "보낸분/받는분", "출금액(원)", "입금액(원)", "잔액(원)", "송금메모", "거래점"]]
gridA += [[r[0].strftime("%Y.%m.%d %H:%M:%S"), "타행이체", r[1], fmt(r[4]), fmt(r[3]), fmt(r[5]), "", "인터넷"] for r in A]
case("A_은행형_텍스트숫자_출금먼저", gridA, *sumA, cats=("A", catsA, 10))

gridB = [["거래일자", "거래시간", "찾으신금액", "맡기신금액", "거래후잔액", "거래내용", "거래기록사항"]]
gridB += [[r[0].strftime("%Y/%m/%d"), r[0].strftime("%H:%M:%S"), r[4], r[3], r[5], "전자금융", r[1]] for r in A]
case("B_찾으신맡기신_시간분리", gridB, *sumA, cats=("B", catsA, 7))

gridC = [["날짜", "내용", "거래금액", "잔액"]] + [[r[0], r[1], r[3] if r[3] else -r[4], r[5]] for r in A]
case("C_한열금액_부호", gridC, *sumA, cats=("C", catsA, 7))

gridD = [["거래일", "구분", "금액", "내용", "잔액"]] + [[int(r[0].strftime("%Y%m%d")), "입금" if r[3] else "출금", r[3] or r[4], r[1], r[5]] for r in A]
case("D_구분열_8자리날짜", gridD, *sumA, cats=("D", catsA, 7))

gridE = [[r[0], r[1], r[3] or None, r[4] or None] for r in A]
case("E_제목줄없음_기본순서", gridE, *sumA, cats=("E", catsA, 6))

gridF = gridA + [[r[0].strftime("%Y.%m.%d %H:%M:%S"), "타행이체", r[1], fmt(r[4]), fmt(r[3]), fmt(r[5]), "", "인터넷"] for r in A[60:]] \
        + [["합계", "", "", fmt(sumA[1]), fmt(sumA[0]), "", "", ""]]
case("F_기간겹쳐_두번붙여넣기_합계행", gridF, *sumA, extra={"중복 자동 제외": 60, "합계 행 (자동 제외)": 1})

gridG = gridE + gridE[:30]
g_in = sumA[0] + sum(r[3] for r in A[:30]); g_out = sumA[1] + sum(r[4] for r in A[:30])
case("G_잔액없이_중복", gridG, g_in, g_out, extra={"중복 의심 (잔액 열 없음)": 30})

H = gen(40); H25 = gen(10, 2025)
gridH = [["거래일시", "적요", "출금액", "입금액", "잔액"]] + [[r[0], r[1], r[4], r[3], r[5]] for r in H] \
        + [[r[0], r[1], r[4], r[3], r[5]] for r in H25] + [["2026-13-45", "날짜오류행", 0, 50000, 1]]
case("H_다른연도_잘못된날짜", gridH, sum(r[3] for r in H), sum(r[4] for r in H), extra={"다른 연도 (합계 제외)": 10, "날짜 인식 실패": 1})

case("I_빈파일", [], 0, 0)

J = gen(2990)
gridJ = [["거래일시", "적요", "출금액", "입금액", "잔액"]] + [[r[0], r[1], r[4], r[3], r[5]] for r in J]
case("J_대용량_2990행", gridJ, sum(r[3] for r in J), sum(r[4] for r in J))

# ---- recalc
t = time.time()
subprocess.run(["soffice", "--headless", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", f"{OUT}/out"] +
               [f"{OUT}/in/{n}.xlsx" for n in cases], capture_output=True, timeout=1500)
print(f"recalc {len(cases)} files: {time.time() - t:.0f}s\n")

ERR = ("#VALUE!", "#REF!", "#NAME?", "#DIV/0!", "#NUM!", "#NULL!", "Err:")
allok = True
for n, c in cases.items():
    wb = openpyxl.load_workbook(f"{OUT}/out/{n}.xlsx", data_only=True)
    M = wb["월별요약"]; D = wb["대시보드"]; B = wb["통장붙여넣기"]
    got_in, got_out = M["C18"].value or 0, M["D18"].value or 0
    checks = {D.cell(row=r, column=17).value: D.cell(row=r, column=18).value for r in range(8, 18)}
    errs = []
    for ws in wb.worksheets:
        if ws.title == "_차트": continue
        for row in ws.iter_rows():
            for cell in row:
                v = cell.value
                if isinstance(v, str) and (v in ERR or v.startswith("Err:") or v == "#N/A"):
                    errs.append(f"{ws.title}!{cell.coordinate}={v}")
    ok = abs(got_in - c["exp_in"]) < 1 and abs(got_out - c["exp_out"]) < 1 and not errs
    msg = []
    if c["cats"]:
        _, exp_cats, first = c["cats"]
        r0 = first
        got = [B[f"U{r}"].value for r in range(r0, r0 + len(exp_cats))]
        miss = sum(1 for a, b in zip(got, exp_cats) if a != b)
        msg.append(f"분류 일치 {len(exp_cats) - miss}/{len(exp_cats)}"); ok &= miss == 0
    for k, v in c["extra"].items():
        msg.append(f"{k}={checks.get(k)}(기대 {v})"); ok &= checks.get(k) == v
    msg.append(f"인식: {B['B4'].value}")
    allok &= ok
    print(("PASS" if ok else "FAIL"), n, f"| 매출 {got_in:,.0f}/{c['exp_in']:,} 지출 {got_out:,.0f}/{c['exp_out']:,}", "| " + " | ".join(msg))
    if errs: print("   오류 셀:", errs[:8], len(errs))
print("\nALL PASS" if allok else "\nSOME FAILED")
