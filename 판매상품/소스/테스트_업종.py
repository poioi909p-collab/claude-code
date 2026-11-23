import openpyxl, subprocess, os, shutil, sys, time
from presets import PRESETS, NAMES
D = "v4/ind"; shutil.rmtree(D, ignore_errors=True); os.makedirs(D + "/in"); os.makedirs(D + "/out")
for i, n in enumerate(NAMES):
    subprocess.run(["python3", "build_v4.py", f"{D}/in/pro_{i}.xlsx", "pro", n], check=True, capture_output=True)
    subprocess.run(["python3", "build_v4.py", f"{D}/in/lite_{i}.xlsx", "lite", n], check=True, capture_output=True)
    wb = openpyxl.load_workbook("v4/empty.xlsx"); wb["설정"]["C9"] = n; wb.save(f"{D}/in/switch_{i}.xlsx")
t = time.time()
subprocess.run(["soffice", "--headless", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", f"{D}/out"] + sorted(
    os.path.join(D, "in", x) for x in os.listdir(D + "/in")), capture_output=True, timeout=1700)
print(f"recalc {time.time()-t:.0f}s")
def errs(wb):
    out = []
    for ws in wb.worksheets:
        if ws.title in ("_차트",): continue
        for row in ws.iter_rows():
            for c in row:
                v = c.value
                if isinstance(v, str) and (v.startswith("Err:") or v in ("#VALUE!", "#REF!", "#NAME?", "#DIV/0!", "#NUM!", "#N/A")): out.append(f"{ws.title}!{c.coordinate}")
    return out
ok_all = True
for i, n in enumerate(NAMES):
    P = PRESETS[n]
    wb = openpyxl.load_workbook(f"{D}/out/pro_{i}.xlsx", data_only=True)
    M, Db, S, A, B = wb["월별요약"], wb["대시보드"], wb["설정"], wb["손익·부가세"], wb["통장붙여넣기"]
    e = errs(wb); chk = [Db.cell(row=r, column=19).value for r in range(8, 18)]
    unc = sum(1 for r in range(8, 400) if B[f"V{r}"].value == "미분류")
    # expected bank categories: compare U vs preset mapping
    mp = {t: c for (t, c, *_r) in P["bank_in"] + P["bank_out"]}
    mism = [(B[f"D{r}"].value, B[f"U{r}"].value) for r in range(8, 400) if B[f"D{r}"].value in mp and B[f"U{r}"].value != mp[B[f"D{r}"].value]]
    vat = Db["K6"].value
    ok = not e and "확인" not in chk and unc == 0 and not mism and (P["tax"] != "면세사업자" or vat == 0) and S["B12"].value == P["income"][0][0]
    lw = openpyxl.load_workbook(f"{D}/out/lite_{i}.xlsx", data_only=True); le = errs(lw); lm = lw["월별요약"]
    sw = openpyxl.load_workbook(f"{D}/out/switch_{i}.xlsx", data_only=True); se = errs(sw); ss = sw["설정"]
    sw_ok = ss["B12"].value == P["income"][0][0] and ss["E12"].value == P["expense"][0][0] and ss["C7"].value == P["tax"] and sw["설정"]["L12"].value is not None
    ok = ok and not le and not se and sw_ok and (lm["C6"].value or 0) > 0
    ok_all &= ok
    print("PASS" if ok else "FAIL", n, f"| 연매출 {M['C18'].value:,.0f} 순이익 {M['E18'].value:,.0f} 이익률 {M['F18'].value:.0%}",
          f"| 과세 {S['C7'].value} 부가세 {vat:,.0f} | 플랫폼수수료 11월 {A['M17'].value if isinstance(A['M17'].value,str) else format(A['M17'].value,'.0%')}",
          f"| 미분류 {unc} 오분류 {len(mism)} 오류 {len(e)}+{len(le)}+{len(se)} | LITE 1월매출 {lm['C6'].value:,.0f} | 업종전환 {'OK' if sw_ok else 'X'}")
    if mism: print("   ", mism[:5])
    if e or le or se: print("   ", (e + le + se)[:5])
print("ALL PASS" if ok_all else "SOME FAILED")
