"""여러 지점의 매출 엑셀 파일을 하나로 합치고 지점·월별 요약표를 만듭니다.

사용법: python merge_sales.py 입력폴더 결과파일.xlsx
- 입력폴더 안의 모든 .xlsx 파일을 읽습니다. (파일 이름 = 지점 이름)
- 각 파일은 '날짜, 메뉴, 수량, 금액' 열을 가진 첫 번째 시트를 씁니다.
"""
import sys
from pathlib import Path
import pandas as pd

def main(src: str, out: str) -> None:
    frames = []
    for f in sorted(Path(src).glob("*.xlsx")):
        df = pd.read_excel(f)
        df.columns = [str(c).strip() for c in df.columns]
        missing = {"날짜", "메뉴", "수량", "금액"} - set(df.columns)
        if missing:
            print(f"[건너뜀] {f.name}: {', '.join(sorted(missing))} 열이 없습니다.")
            continue
        df["지점"] = f.stem
        frames.append(df)
        print(f"[읽음] {f.name}: {len(df)}행")
    if not frames:
        sys.exit("합칠 파일이 없습니다.")
    data = pd.concat(frames, ignore_index=True)
    data["날짜"] = pd.to_datetime(data["날짜"])
    data["월"] = data["날짜"].dt.strftime("%Y-%m")
    by_branch = data.pivot_table(index="지점", columns="월", values="금액", aggfunc="sum", fill_value=0, margins=True, margins_name="합계")
    top_menu = data.groupby("메뉴")[["수량", "금액"]].sum().sort_values("금액", ascending=False)
    with pd.ExcelWriter(out) as w:
        data.drop(columns="월").to_excel(w, sheet_name="전체내역", index=False)
        by_branch.to_excel(w, sheet_name="지점별 월매출")
        top_menu.to_excel(w, sheet_name="메뉴 순위")
    print(f"[완료] {len(frames)}개 파일, {len(data)}행 → {out}")
    print(by_branch.to_string())

if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
