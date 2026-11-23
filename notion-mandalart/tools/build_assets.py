#!/usr/bin/env python3
"""시드 데이터·스키마 산출물 생성 + 검증.

사용법:
    python3 tools/build_assets.py                 # 오늘 날짜 기준
    python3 tools/build_assets.py --base 2026-11-23

출력(out/):
    library.csv / library.json   추천 라이브러리 (DB8) — 프리셋·세부·실천, 관계 키 포함
    sample_mandalart.json        완성 샘플(6개월 갓생 만들기) + 이전 만다라트 + 지난 목표 분석
    schema.json                  DB 9개 속성·수식·관계 (빌드 입력)
    formulas.md                  사람이 읽는 수식 목록
    validation.txt               검증 결과 (에러 0이어야 빌드 진행)
"""
import argparse
import csv
import datetime as dt
import json
import random
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import schema as S  # noqa: E402

OUT = ROOT / "out"
TYPE = {"습": "습관", "미": "미션", "마": "마음가짐"}
DIFF = {"입": "입문", "보": "보통", "도": "도전"}
TIME = {"5": "5분", "15": "15분", "30": "30분", "60": "1시간+"}


# ---------------------------------------------------------------- 라이브러리 파싱
def freq_info(code):
    if code == "D":
        return {"빈도": "매일", "권장 빈도": "매일", "주간 목표 횟수": 7, "월간 목표 횟수": None}
    if code == "O":
        return {"빈도": "1회", "권장 빈도": "1회", "주간 목표 횟수": None, "월간 목표 횟수": None}
    n = int(code[1:])
    if code[0] == "W":
        return {"빈도": "주 n회", "권장 빈도": f"주 {n}회", "주간 목표 횟수": n, "월간 목표 횟수": None}
    if code[0] == "M":
        return {"빈도": "월 n회", "권장 빈도": f"월 {n}회", "주간 목표 횟수": None, "월간 목표 횟수": n}
    raise ValueError(code)


def parse_library(path):
    fields, goals, actions = [], [], []
    field = goal = None
    for ln, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or (field is None and not line.startswith("## ")):
            continue  # 머리말 주석
        if line.startswith("## "):
            field = line[3:].strip()
            fields.append(field)
            goal = None
            continue
        if line.startswith("# "):
            if "|" not in line:
                continue
            name, diff, desc = [x.strip() for x in line[2:].split("|")]
            goal = {"key": f"G{len(goals)+1:03d}", "항목": name, "분야": field, "난이도": DIFF[diff], "설명": desc, "actions": []}
            goals.append(goal)
            continue
        head, name, minimal = [x.strip() for x in line.split("|")]
        t, f, m, d = head.split()
        name = name if not name.endswith('"') else name + " 떠올리기"
        a = {"key": f"A{len(actions)+1:04d}", "항목": name, "분야": field, "유형": TYPE[t], "소요 시간": TIME[m],
             "난이도": DIFF[d], "최소 행동": minimal, "비용": "0원", "parent": goal["key"], "_line": ln}
        a.update(freq_info(f))
        goal["actions"].append(a)
        actions.append(a)
    return fields, goals, actions


# ---------------------------------------------------------------- 샘플
SAMPLE_SHORT = {  # 6개월 갓생 만들기: 실천항목 짧은 이름 (보드 격자용)
    "일정한 시간에 자기": ["12시 전 눕기", "같은 시간 기상", "폰 충전 30분", "수면 기록", "취침시간 정하기", "침실 어둡게", "주말 기상", "잠은 선물"],
    "아침 루틴 만들기": ["이불 정리", "아침 15분", "오늘의 3가지", "기상 후 폰X", "루틴표", "햇빛 2분", "30분 전 준비", "아침 10분"],
    "스마트폰 사용 줄이기": ["스크린타임", "SNS 1시간", "앱 제한", "알림 끄기", "식사 중 폰X", "디지털 OFF", "반나절 폰X", "왜 켜지?"],
    "체력 기초 다지기": ["30분 걷기", "계단 5층", "홈트 15분", "아침 스트레칭", "둘레길 3km", "체력 기록", "월 체력 재기", "몸은 쓰는 만큼"],
    "물 충분히 마시기": ["물 1.5L", "기상 물 1컵", "식전 물", "물병 지정", "컵 수 체크", "음료→물", "보리차", "목마르면 늦다"],
    "매일 읽는 습관": ["10쪽 읽기", "자기 전 책", "출퇴근 독서", "책 두기", "쪽수 기록", "1시간 몰입", "SNS→책", "한 쪽도 독서"],
    "가계부 쓰기": ["지출 기록", "주간 합계", "가계부 정하기", "월 결산", "예산 5개", "결제 알림", "예산 비교", "기록=덜 씀"],
    "감정 기록": ["감정 1단어", "기분 점수", "감정 패턴", "3줄 일기", "감정 단어", "힘든 이유", "감정 그래프", "느껴도 OK"],
}
GOAL_SHORT = {"일정한 시간에 자기": "수면", "아침 루틴 만들기": "아침", "스마트폰 사용 줄이기": "폰 다이어트",
              "체력 기초 다지기": "체력", "물 충분히 마시기": "물", "매일 읽는 습관": "독서",
              "가계부 쓰기": "가계부", "감정 기록": "마음"}
POSITIONS = [1, 2, 3, 4, 6, 7, 8, 9]


def build_sample(base, goals_by_name, presets):
    rnd = random.Random(42)
    D = lambda off: (base + dt.timedelta(days=off)).isoformat()  # noqa: E731
    preset = next(p for p in presets if p["title"] == "6개월 갓생 만들기")
    start_off = -23
    prev_start_off = -320

    out = {"base_date": base.isoformat(), "mandalarts": [], "goals": [], "actions": [], "logs": [],
           "periods": [], "todos": [], "retros": [], "lessons": []}

    out["mandalarts"].append({"key": "M_PREV", "핵심목표": "2026 상반기 다시 시작 프로젝트", "기간 모드": "6개월",
                              "시작일": D(prev_start_off), "상태": "보관", "기록된 달성률": 31,
                              "_note": "지난 목표를 간단히 옮겨 온 예시. 세부목표 없이 '기록된 달성률'만 사용"})
    out["mandalarts"].append({"key": "M_NOW", "핵심목표": "6개월 갓생 만들기", "기간 모드": "6개월",
                              "시작일": D(start_off), "상태": "진행 중", "이전 만다라트": ["M_PREV"]})

    out["goals"].append({"key": "SG_C", "세부목표": "6개월 갓생 만들기", "짧은 이름": "갓생", "만다라트": ["M_NOW"],
                         "위치": 5, "구분": "중심", "분야": "수면·생활"})
    # 실천 시뮬레이션 프로필 (액션별 성실도). 일부러 들쭉날쭉: 💤 두 칸, 🟩 다수, 🟨 일부.
    sleepy = {("스마트폰 사용 줄이기", 2), ("가계부 쓰기", 2)}  # (세부목표, 실천 인덱스) → 💤
    reliab_by_goal = {"일정한 시간에 자기": 0.75, "아침 루틴 만들기": 0.85, "스마트폰 사용 줄이기": 0.45,
                      "체력 기초 다지기": 0.65, "물 충분히 마시기": 0.9, "매일 읽는 습관": 0.7,
                      "가계부 쓰기": 0.55, "감정 기록": 0.6}

    for gi, gname in enumerate(preset["goals"]):
        lib_goal = goals_by_name[gname]
        gkey = f"SG{gi+1}"
        g = {"key": gkey, "세부목표": gname, "짧은 이름": GOAL_SHORT[gname], "만다라트": ["M_NOW"],
             "위치": POSITIONS[gi], "구분": "세부목표", "분야": lib_goal["분야"], "색상 라벨": S.COLOR_LABELS[gi][0]}
        if gname == "매일 읽는 습관":
            g.update({"목표치": 1800, "단위": "쪽"})
        out["goals"].append(g)

        habit_seen = 0
        for ai, la in enumerate(lib_goal["actions"]):
            akey = f"{gkey}_A{ai+1}"
            act = {"key": akey, "실천항목": la["항목"], "짧은 이름": SAMPLE_SHORT[gname][ai], "세부목표": [gkey],
                   "위치": ai + 1, "유형": la["유형"], "빈도": la["빈도"], "최소 행동": la["최소 행동"], "비용": "0원",
                   "_lib": la["key"]}
            if la["주간 목표 횟수"] and la["빈도"] != "매일":
                act["주간 목표 횟수"] = la["주간 목표 횟수"]
            if la["월간 목표 횟수"]:
                act["월간 목표 횟수"] = la["월간 목표 횟수"]
            # 처음엔 세부목표당 핵심 2~3개 + 마음가짐 + 미션만 활성화 (Step 3 권장)
            active = la["유형"] != "습관" or habit_seen < 3
            if la["유형"] == "습관":
                habit_seen += 1
            act["활성 상태"] = "활성" if active else "쉬는 중"
            if la["유형"] == "미션":
                state = rnd.choice(["done", "done", "late", "soon"])
                if state == "done":
                    act["완료"] = True
                    act["기한"] = D(start_off + rnd.randint(3, 15))
                elif state == "late":
                    act["기한"] = D(-rnd.randint(2, 5))
                else:
                    act["기한"] = D(rnd.randint(1, 6))
            if gname == "매일 읽는 습관" and ai == 0:
                act["수치 집계"] = True
            out["actions"].append(act)

            if not active or la["유형"] == "미션":
                continue
            # 실행 기록 생성
            p_day = reliab_by_goal[gname]
            if la["빈도"] == "주 n회":
                p_day = min(1.0, p_day * la["주간 목표 횟수"] / 7 * 1.15)
            elif la["빈도"] == "월 n회":
                p_day = min(1.0, p_day * la["월간 목표 횟수"] / 30 * 1.2)
            elif la["유형"] == "마음가짐":
                p_day *= 0.55
            asleep = (gname, ai) in sleepy
            for off in range(start_off, 1):
                if asleep and off > -16:
                    continue
                if off == 0 and rnd.random() < 0.5:  # 오늘은 아직 안 한 것도 있게
                    continue
                # 2주 전 주말은 다 같이 무너짐 (재시작 장면용)
                if -13 <= off <= -11:
                    continue
                if rnd.random() < p_day:
                    log = {"기록": f"{act['짧은 이름']} · {(base + dt.timedelta(days=off)).strftime('%-m/%-d')}",
                           "날짜": D(off), "실천항목": [akey], "최소만 했음": rnd.random() < 0.2}
                    if act.get("수치 집계"):
                        log["수행량"] = rnd.randint(6, 25)
                    out["logs"].append(log)

    # 재설계(재시작) 예시: 체력 기초 다지기 3번째 실천 (홈트) → 재시작
    redo = next(a for a in out["actions"] if a["실천항목"].startswith("주 3회 유튜브 홈트"))
    redo.update({"재시작일": D(-6), "재시작 횟수": 1, "이전 버전": "매일 30분 홈트 따라 하기"})

    # ---------------- 기간 목표 (6개월 모드: 12주 스프린트 ×2 + 정비 주간 2주)
    out["periods"] += [
        {"key": "P_S1", "기간 목표": "스프린트 1: 잠·아침 리듬 고정하기", "단위": "12주 스프린트", "기간 시작": D(start_off),
         "상태": "진행 중", "목표치": 840, "현재치": 0, "수치 단위": "쪽", "세부목표": ["SG1", "SG2", "SG6"],
         "_note": "현재치는 빌드 때 샘플 독서량 합계로 채움"},
        {"key": "P_REST", "기간 목표": "정비 주간: 점검·교체·휴식", "단위": "정비 주간", "기간 시작": D(start_off + 84), "상태": "예정"},
        {"key": "P_S2", "기간 목표": "스프린트 2: 몸·돈·마음 확장", "단위": "12주 스프린트", "기간 시작": D(start_off + 98), "상태": "예정"},
    ]
    week_titles = ["1주 차: 12시 전 눕기 5일", "2주 차: 아침 루틴 4일 + 물 1.5L", "3주 차: 무너진 주 → 최소 행동으로 버티기", "4주 차: 다시 페이스 찾기"]
    for k, title in enumerate(week_titles):
        off = start_off + 7 * k
        status = "진행 중" if off + 6 >= 0 else ("미달성" if k == 2 else "달성")
        out["periods"].append({"key": f"P_W{k+1}", "기간 목표": title, "단위": "주", "기간 시작": D(off),
                               "상위 기간 목표": ["P_S1"], "상태": status})
    out["periods"].append({"key": "P_MID", "기간 목표": "6주 차 스프린트 중간 점검", "단위": "주", "기간 시작": D(start_off + 35),
                           "상위 기간 목표": ["P_S1"], "상태": "예정"})

    # ---------------- 할 일
    A = {a["실천항목"]: a["key"] for a in out["actions"]}

    def act_key(prefix):
        return [next(k for n, k in A.items() if n.startswith(prefix))]

    todos = [
        ("오늘 운동: 30분 걷기 (최소 10분)", 0, True, True, "주 3회 30분", "P_W4", "30분"),
        ("가계부 이번 주 몰아서 정리", 0, False, True, "주 1회 지출", "P_W4", "15분"),
        ("「아주 작은 습관의 힘」 10쪽", 0, False, True, "매일 10쪽", "P_W4", "15분"),
        ("스크린타임 제한 앱 3개 설정", 0, False, False, "1회: 앱 사용", "P_W4", "5분"),
        ("자기 전 감정 1단어 기록", 0, False, False, "매일 감정 1단어", None, "5분"),
        ("아침 루틴표 냉장고에 붙이기", -1, True, False, "1회: 아침 루틴", "P_W4", "15분"),
        ("체력 기록(스쿼트 개수) 남기기", -2, False, False, "1회: 지금 체력", "P_W3", "15분"),
        ("눈금 물병 주문 말고 집에 있는 것 지정", -4, True, False, "1회: 눈금", "P_W3", "5분"),
        ("도서관에서 다음 책 빌리기", 1, False, False, None, "P_W4", "30분"),
        ("주간 회고 15분", 3, False, False, None, "P_W4", "15분"),
        ("다음 주 계획 3가지 정하기", 3, False, False, None, "P_W4", "5분"),
        ("구독 서비스 목록 적기", 2, False, False, None, None, "15분"),
        ("둘레길 3km 코스 미리 보기", 4, False, False, "주 2회 공원", None, "15분"),
        ("월 예산 카테고리 5개 정하기", -6, True, False, "1회: 월 예산", "P_W3", "15분"),
        ("수면 시간 앱 대신 노션에 기록하기 시작", -20, True, False, "매일 수면", "P_W1", "5분"),
        ("6주 차 중간 점검 준비", 12, False, False, None, "P_MID", "30분"),
    ]
    for title, off, done, top3, aprefix, pkey, est in todos:
        t = {"할 일": title, "날짜": D(off), "완료": done, "오늘의 3가지": top3, "예상 시간": est}
        if aprefix:
            t["실천항목"] = act_key(aprefix)
        if pkey:
            t["기간 목표"] = [pkey]
        out["todos"].append(t)

    # ---------------- 회고
    def week_range(off):
        return {"start": D(off), "end": D(off + 6)}

    out["retros"] += [
        {"회고": "2주 차 주간 회고", "유형": "주간", "기간": week_range(start_off + 7), "만다라트": ["M_NOW"],
         "이번 기간 실행률": 68, "기분": "🙂",
         "_body": {"잘한 것": "아침 루틴 5일, 물 1.5L는 거의 매일. 기록 버튼 덕분에 1분이면 끝.",
                   "막힌 것": "스마트폰 SNS 1시간 제한은 이틀 만에 깨짐.",
                   "💤 방치 칸 원인": "가계부 주간 합계를 일요일 밤으로 잡았더니 피곤해서 건너뜀.",
                   "다음 주 3가지": "12시 전 눕기 5일 / SNS 앱 홈 화면에서 빼기 / 가계부는 토요일 아침",
                   "실천항목 수정": "없음 — 2주는 그대로 유지"}},
        {"회고": "3주 차 주간 회고 (무너진 주)", "유형": "주간", "기간": week_range(start_off + 14), "만다라트": ["M_NOW"],
         "이번 기간 실행률": 41, "기분": "😕",
         "_body": {"잘한 것": "주말 3일 통째로 무너졌지만 월요일에 최소 행동(물 3컵·1쪽)으로 다시 시작.",
                   "막힌 것": "매일 30분 홈트는 퇴근 후 체력으로 무리.",
                   "💤 방치 칸 원인": "앱 사용 제한·가계부 주간 합계 — 둘 다 '언제 할지'가 없었음.",
                   "다음 주 3가지": "홈트를 주 3회 15분으로 재설계 / 가계부 토요일 9시 알림 / 감정 1단어는 양치 후",
                   "실천항목 수정": "홈트: 매일 30분 → 주 3회 15분 (🔄 다시 시작)"}},
        {"회고": "재설계: 홈트를 주 3회 15분으로", "유형": "재설계", "기간": {"start": D(-6), "end": D(-6)},
         "만다라트": ["M_NOW"], "변경한 실천항목": [redo["key"]], "기분": "🙂",
         "_body": {"무엇이 멈췄나": "매일 30분 홈트 — 10일 중 2일 실행",
                   "왜 멈췄나": "너무 컸다 + 시간대가 정해지지 않음",
                   "어떻게 줄였나": "주 3회 15분, 최소 행동 '한 동작 1세트', 월·수·금 저녁 9시",
                   "다시 시작한 날": "재시작일부터 달성률을 새로 셈"}},
    ]
    snaps = [9, 14, 18, 22, 27, 31]
    for m, v in enumerate(snaps):
        s = prev_start_off + 30 * m
        out["retros"].append({"회고": f"{m+1}개월 차 월간 회고 (지난 만다라트)", "유형": "월간",
                              "기간": {"start": D(s), "end": D(s + 27)}, "만다라트": ["M_PREV"],
                              "누적 달성률": v, "기분": ["🙂", "🙂", "😐", "😕", "😐", "😐"][m]})

    # ---------------- 지난 목표 분석
    out["lessons"] += [
        {"지난 목표": "매일 1시간 운동하기", "언제": "2026 상반기", "분야": "건강·운동",
         "목표했던 것": "매일 1시간 헬스·홈트", "실제 결과": "첫 3주만 하고 중단", "실제 달성률": 12, "멈춘 시점": "1개월 안",
         "실패 원인": ["너무 컸다", "최소 행동이 없었다", "한 번 빠지고 무너졌다"],
         "그래도 잘한 점": "처음 3주는 꽤 성실했다", "교훈 한 줄": "작게 시작하고, 빠진 다음 날이 진짜 승부",
         "재발 방지 규칙": "만약 하루 빠지면 → 다음 날은 최소 행동(스쿼트 5개)만 한다", "다음 결정": "줄여서 다시",
         "분석 대상": ["M_PREV"], "반영할 만다라트": ["M_NOW"], "반영한 세부목표": ["SG4"]},
        {"지난 목표": "영어 공부 열심히 하기", "언제": "2026 상반기", "분야": "외국어",
         "목표했던 것": "영어 실력 늘리기", "실제 결과": "강의 몇 개 듣다 흐지부지", "실제 달성률": 5, "멈춘 시점": "3개월 안",
         "실패 원인": ["목표가 모호했다", "측정할 수 없었다", "기록·확인을 안 했다", "시간이 없었다"],
         "그래도 잘한 점": "무료 팟캐스트 채널을 찾아 둠", "교훈 한 줄": "'열심히'는 목표가 아니다. 숫자와 빈도로",
         "재발 방지 규칙": "만약 목표에 숫자가 없으면 → 등록하지 않는다", "다음 결정": "방식 바꿔 다시",
         "분석 대상": ["M_PREV"], "반영할 만다라트": []},
        {"지난 목표": "월 50만 원 저축", "언제": "2026 상반기", "분야": "돈·저축",
         "목표했던 것": "매달 50만 원 저축", "실제 결과": "4개월 성공, 2개월 실패", "실제 달성률": 67, "멈춘 시점": "끝까지 했지만 미달",
         "실패 원인": ["예상 못 한 사건", "돈·비용 문제"],
         "그래도 잘한 점": "자동이체는 끝까지 유지", "교훈 한 줄": "비상금이 없으면 저축이 깨진다",
         "재발 방지 규칙": "만약 큰 지출이 생기면 → 저축 대신 비상금에서 먼저 쓴다", "다음 결정": "다시 도전",
         "분석 대상": ["M_PREV"], "반영할 만다라트": ["M_NOW"], "반영한 세부목표": ["SG7"]},
    ]

    # 스프린트 1 현재치 = 샘플 독서량
    pages = sum(l.get("수행량", 0) for l in out["logs"])
    out["periods"][0]["현재치"] = pages
    return out


# ---------------------------------------------------------------- 수식 검증
OWN = re.compile(r'(?<![\w.])prop\("([^"]+)"\)')
REL = re.compile(r'\.prop\("([^"]+)"\)')


DUALS = defaultdict(dict)  # db -> {dual 속성명: 대상 db}


def _init_duals():
    for k, db in S.DBS.items():
        for n, d in db["props"].items():
            if d["type"] == "relation":
                DUALS[k][n] = d["target"]
                DUALS[d["target"]][d["dual"]] = k


def rel_props(k):
    return DUALS[k]


def all_props(db):
    k = next(kk for kk, v in S.DBS.items() if v is db)
    return set(db["props"]) | set(db["formulas"]) | set(DUALS[k])


def validate_formulas(errors, notes):
    _init_duals()
    dbs = S.DBS
    graph = defaultdict(set)
    for key, db in dbs.items():
        for fname, expr in db["formulas"].items():
            # 괄호/따옴표 균형
            depth = 0
            in_str = False
            for ch in expr:
                if ch == '"':
                    in_str = not in_str
                elif not in_str:
                    depth += {"(": 1, ")": -1, "[": 1, "]": -1}.get(ch, 0)
                    if depth < 0:
                        break
            if depth != 0 or in_str:
                errors.append(f"[수식 문법] {db['title']}.{fname}: 괄호/따옴표 불균형")
            own = OWN.findall(expr)
            rel = REL.findall(expr)
            for p in own:
                if p not in all_props(db):
                    errors.append(f"[수식 참조] {db['title']}.{fname}: prop(\"{p}\") 없음")
                elif p in db["formulas"]:
                    graph[(key, fname)].add((key, p))
            # 관계형 따라 도달 가능한 DB (자기 DB는 prop(), 도달한 DB는 .prop() 이름으로만 확장)
            reach = set()
            todo = [(key, set(own))]
            while todo:
                src, allowed = todo.pop()
                for n in allowed:
                    pd = rel_props(src).get(n)
                    if pd and pd not in reach:
                        reach.add(pd)
                        todo.append((pd, set(rel)))
            for p in rel:
                hits = [k for k in reach if p in all_props(dbs[k])]
                if not hits:
                    errors.append(f"[수식 참조] {db['title']}.{fname}: .prop(\"{p}\") 를 관계형으로 찾을 수 없음")
                for k in hits:
                    if p in dbs[k]["formulas"]:
                        graph[(key, fname)].add((k, p))
    # 순환 검사
    color = {}

    def dfs(n, stack):
        color[n] = 1
        for m in graph[n]:
            if color.get(m) == 1:
                cyc = stack[stack.index(m):] + [m] if m in stack else [n, m]
                errors.append("[순환 참조] " + " → ".join(f"{S.DBS[a]['title']}.{b}" for a, b in cyc))
            elif not color.get(m):
                dfs(m, stack + [m])
        color[n] = 2

    for n in list(graph):
        if not color.get(n):
            dfs(n, [n])
    # 생성 순서 검사
    seen = set()
    listed = set()
    for key, names in S.FORMULA_ORDER:
        for n in names:
            if n not in S.DBS[key]["formulas"]:
                errors.append(f"[순서] {S.DBS[key]['title']}.{n} 는 수식이 아님")
            for dep in graph[(key, n)]:
                if dep not in seen and dep != (key, n):
                    errors.append(f"[순서] {S.DBS[key]['title']}.{n} 가 아직 안 만든 {S.DBS[dep[0]]['title']}.{dep[1]} 참조")
            seen.add((key, n))
            listed.add((key, n))
    for key, db in S.DBS.items():
        for n in db["formulas"]:
            if (key, n) not in listed:
                errors.append(f"[순서] {db['title']}.{n} 가 FORMULA_ORDER 에 없음")
    notes.append(f"수식 {sum(len(d['formulas']) for d in S.DBS.values())}개, 의존 간선 {sum(len(v) for v in graph.values())}개 검사")


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=dt.date.today().isoformat())
    args = ap.parse_args()
    base = dt.date.fromisoformat(args.base)
    OUT.mkdir(exist_ok=True)
    errors, notes = [], []

    fields, goals, actions = parse_library(ROOT / "seed" / "library_source.txt")
    presets = json.loads((ROOT / "seed" / "presets.json").read_text(encoding="utf-8"))["presets"]
    goals_by_name = {g["항목"]: g for g in goals}

    # --- 라이브러리 검증
    if len(fields) < 12:
        errors.append(f"[라이브러리] 분야 {len(fields)}개 (<12)")
    per_field = defaultdict(int)
    for g in goals:
        per_field[g["분야"]] += 1
        if not 6 <= len(g["actions"]) <= 8:
            errors.append(f"[라이브러리] {g['항목']}: 실천 후보 {len(g['actions'])}개")
    for f, n in per_field.items():
        if n < 8:
            errors.append(f"[라이브러리] {f}: 세부 후보 {n}개 (<8)")
    if len(goals_by_name) != len(goals):
        errors.append("[라이브러리] 세부목표 후보 이름 중복")
    rule = re.compile(r"\d|매일")
    for a in actions:
        if not a["최소 행동"]:
            errors.append(f"[라이브러리] 최소 행동 없음: {a['항목']}")
        if not rule.search(a["항목"]):
            errors.append(f"[라이브러리] 동사+숫자+빈도 규칙 위반: {a['항목']} (line {a['_line']})")
        if any(w in a["항목"] for w in ["헬스장", "PT", "유료", "구독하기", "학원"]):
            errors.append(f"[라이브러리] 0원 위반 의심: {a['항목']}")
    if len(presets) < 10:
        errors.append(f"[프리셋] {len(presets)}개 (<10)")
    for p in presets:
        if len(p["goals"]) != 8 or len(set(p["goals"])) != 8:
            errors.append(f"[프리셋] {p['title']}: 세부목표 8개가 아님")
        for gname in p["goals"]:
            if gname not in goals_by_name:
                errors.append(f"[프리셋] {p['title']}: '{gname}' 라이브러리에 없음")
            elif len(goals_by_name[gname]["actions"]) != 8:
                errors.append(f"[프리셋] {p['title']}: '{gname}' 실천 후보가 8개가 아님")

    # --- 라이브러리 산출
    rows = []
    for i, p in enumerate(presets, 1):
        rows.append({"key": f"P{i:02d}", "항목": p["title"], "종류": "핵심목표 예시", "분야": p["field"], "상위 항목": "",
                     "난이도": "", "유형": "", "권장 빈도": "", "최소 행동": "", "비용": "0원", "소요 시간": "",
                     "추천 기간": p["mode"], "순서": i, "설명": p["desc"], "짧은 이름": p["short"]})
    preset_parents = defaultdict(list)
    for i, p in enumerate(presets, 1):
        for gname in p["goals"]:
            preset_parents[goals_by_name[gname]["key"]].append(f"P{i:02d}")
    for i, g in enumerate(goals, 1):
        rows.append({"key": g["key"], "항목": g["항목"], "종류": "세부목표 후보", "분야": g["분야"],
                     "상위 항목": ";".join(preset_parents[g["key"]]), "난이도": g["난이도"], "유형": "",
                     "권장 빈도": "", "최소 행동": "", "비용": "0원", "소요 시간": "", "추천 기간": "", "순서": i,
                     "설명": g["설명"], "짧은 이름": ""})
    for i, a in enumerate(actions, 1):
        rows.append({"key": a["key"], "항목": a["항목"], "종류": "실천항목 후보", "분야": a["분야"], "상위 항목": a["parent"],
                     "난이도": a["난이도"], "유형": a["유형"], "권장 빈도": a["권장 빈도"], "최소 행동": a["최소 행동"],
                     "비용": a["비용"], "소요 시간": a["소요 시간"], "추천 기간": "", "순서": i, "설명": "", "짧은 이름": ""})
    cols = list(rows[0].keys())
    with open(OUT / "library.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    (OUT / "library.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    # 프리셋 전개본 (프리셋 1개 = 세부 8 + 실천 64)
    expanded = []
    for p in presets:
        expanded.append({"title": p["title"], "mode": p["mode"], "goals": [
            {"위치": pos, "세부목표": gname, "분야": goals_by_name[gname]["분야"],
             "실천항목": [{"위치": j + 1, **{k: a[k] for k in ("항목", "유형", "빈도", "권장 빈도", "주간 목표 횟수", "월간 목표 횟수", "최소 행동", "비용")}}
                       for j, a in enumerate(goals_by_name[gname]["actions"])]}
            for pos, gname in zip(POSITIONS, p["goals"])]})
    (OUT / "presets_expanded.json").write_text(json.dumps(expanded, ensure_ascii=False, indent=1), encoding="utf-8")

    # --- 샘플
    sample = build_sample(base, goals_by_name, presets)
    (OUT / "sample_mandalart.json").write_text(json.dumps(sample, ensure_ascii=False, indent=1), encoding="utf-8")
    if len([g for g in sample["goals"] if g["구분"] == "세부목표"]) != 8 or len(sample["actions"]) != 64:
        errors.append("[샘플] 세부 8 / 실천 64 가 아님")

    # --- 스키마
    validate_formulas(errors, notes)
    schema_out = {k: {"title": v["title"], "icon": v["icon"], "desc": v["desc"],
                      "props": {n: {kk: (list(map(list, vv)) if kk == "options" else vv) for kk, vv in d.items()} for n, d in v["props"].items()},
                      "formulas": v["formulas"]} for k, v in S.DBS.items()}
    schema_out["_formula_order"] = S.FORMULA_ORDER
    (OUT / "schema.json").write_text(json.dumps(schema_out, ensure_ascii=False, indent=1), encoding="utf-8")
    md = ["# 수식 목록 (Formula 2.0)\n", "> `tools/schema.py` 에서 생성. 생성 순서는 FORMULA_ORDER 를 따른다.\n"]
    for key, names in S.FORMULA_ORDER:
        for n in names:
            md.append(f"### {S.DBS[key]['title']} · {n}\n```\n{S.DBS[key]['formulas'][n]}\n```\n")
    (OUT / "formulas.md").write_text("\n".join(md), encoding="utf-8")

    # --- 프리셋 페이지 본문 (라이브러리 '핵심목표 예시' 행의 본문)
    pdir = OUT / "preset_pages"
    pdir.mkdir(exist_ok=True)
    for i, p in enumerate(expanded, 1):
        g = {x["위치"]: x for x in p["goals"]}
        cell = lambda pos: f"**{g[pos]['세부목표']}**"  # noqa: E731
        md = [f'<callout icon="🎁" color="yellow_bg">\n\t{presets[i-1]["desc"]} · 추천 기간 **{p["mode"]}**\n</callout>',
              "## 🗺️ 3×3 한눈에", '<table header-row="false">',
              f"\t<tr><td>{cell(1)}</td><td>{cell(2)}</td><td>{cell(3)}</td></tr>",
              f'\t<tr><td>{cell(4)}</td><td><span color="red">**🎯 {p["title"]}**</span></td><td>{cell(6)}</td></tr>',
              f"\t<tr><td>{cell(7)}</td><td>{cell(8)}</td><td>{cell(9)}</td></tr>", "</table>",
              "## 🧩 세부목표별 실천항목 8"]
        for x in p["goals"]:
            md.append(f"<details>\n<summary>{x['위치']}. {x['세부목표']} <span color=\"gray\">· {x['분야']}</span></summary>")
            for a in x["실천항목"]:
                icon = {"습관": "🔁", "미션": "🎯", "마음가짐": "🧘"}[a["유형"]]
                md.append(f"\t- {icon} {a['항목']} <span color=\"gray\">— 최소: {a['최소 행동']}</span>")
            md.append("</details>")
        md.append('<callout icon="➕" color="gray_bg">\n\t가져오려면: 위 세부목표 이름으로 라이브러리를 검색해 실천항목 행의 ➕ 내 만다라트로, 또는 무료 AI 가이드의 CSV에 이 표를 붙여 넣으세요.\n</callout>')
        (pdir / f"P{i:02d}.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    # --- 페이지 자리표시자 검사
    man = json.loads((ROOT / "pages" / "manifest.json").read_text(encoding="utf-8"))
    pkeys = {p["key"] for p in man["pages"]}
    files = [ROOT / "pages" / p["file"] for p in man["pages"]] + sorted((ROOT / "templates").glob("*.md"))
    used_views = set()
    for f in files:
        if not f.exists():
            errors.append(f"[페이지] 파일 없음: {f.relative_to(ROOT)}")
            continue
        txt = f.read_text(encoding="utf-8")
        for k in re.findall(r"\{\{page:([\w]+)\}\}", txt):
            if k not in pkeys:
                errors.append(f"[페이지] {f.name}: 없는 페이지 키 {k}")
        for k in re.findall(r"\[\[VIEW:([\w.]+)\]\]", txt):
            used_views.add(k)
            if k not in man["views"]:
                errors.append(f"[페이지] {f.name}: 없는 뷰 {k}")
        for k in re.findall(r"\[\[BUTTON:([\w.]+)\]\]", txt):
            if k not in man["buttons"]:
                errors.append(f"[페이지] {f.name}: 없는 버튼 {k}")
    for k, v in man["views"].items():
        if k not in used_views:
            errors.append(f"[뷰] 정의만 있고 안 쓰는 뷰: {k}")
        vv = man["views"][v["same_as"]] | v if "same_as" in v else v
        db = S.DBS[vv["db"]]
        names = all_props(db)
        for p in vv.get("props", []) + ([vv["group"]] if "group" in vv else []):
            if p not in names:
                errors.append(f"[뷰] {k}: '{p}' 속성 없음 ({db['title']})")
    # --- 수동 체크리스트용 표 (뷰·버튼)
    title_of = {p["key"]: p["title"] for p in man["pages"]}
    lines = ["# 뷰 체크리스트 (자동 생성)", "",
             "MCP로 뷰를 만들지 못했을 때: 해당 페이지의 🔧 콜아웃 자리에서 `/링크된 데이터베이스` → 원본 DB 선택 → 아래대로 설정.",
             "공통: 갤러리는 **카드 미리보기 = 없음**, 속성 **줄바꿈 켜기**. 필터의 Today/This week 는 상대 날짜(오늘/이번 주).", "",
             "| ☐ | 페이지 | 뷰 이름 | DB | 레이아웃 | 필터 | 정렬 | 그룹/기타 | 표시 속성 |", "|---|---|---|---|---|---|---|---|---|"]
    for k, v in man["views"].items():
        vv = man["views"][v["same_as"]] | v if "same_as" in v else v
        extra = "; ".join(x for x in [f"그룹: {vv['group']}" if vv.get("group") else "",
                                       f"카드: {vv['card']}" if vv.get("card") else "",
                                       f"날짜: {vv['date']}" if vv.get("date") else "",
                                       f"하위 항목: {vv['subitems']}" if vv.get("subitems") else "",
                                       vv.get("chart", ""), "선택" if vv.get("optional") else ""] if x)
        lines.append(f"| ☐ | {title_of[k.split('.')[0]]} | {vv['name'] if 'same_as' not in v else '보드 위치 ' + v['filter'][-1]} | {S.DBS[vv['db']]['title']} | {vv['layout']} | "
                     f"{vv.get('filter', '—')} | {vv.get('sort', '—')} | {extra or '—'} | {', '.join(vv.get('props', []))} |")
    (OUT / "views_checklist.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    bl = ["# 버튼 체크리스트 (자동 생성)", "", "| ☐ | 위치 | 이름 | 동작 | 설정값 |", "|---|---|---|---|---|"]
    for k, b in man["buttons"].items():
        bb = man["buttons"][b["same_as"]] if "same_as" in b else b
        if k.startswith("prop:"):
            dbk, pname = k[5:].split(".", 1)
            where = f"DB 속성 · {S.DBS[dbk]['title']}.{pname}"
        else:
            where = f"페이지 · {title_of[k.split('.')[0]]}"
        sets = ", ".join(f"{a} = {c}" for a, c in bb.get("set", {}).items())
        if bb.get("template"):
            sets = f"템플릿 '{bb['template']}' 적용; " + sets
        if bb.get("open"):
            sets += "; 만든 뒤 페이지 열기"
        if bb.get("note"):
            sets += f"; {bb['note']}"
        bl.append(f"| ☐ | {where} | {bb.get('label', pname if k.startswith('prop:') else k)} | {bb['action']} | {sets or bb.get('target', '')} |")
    (OUT / "buttons_checklist.md").write_text("\n".join(bl) + "\n", encoding="utf-8")

    notes.append(f"페이지 {len(man['pages'])}개 · 뷰 {len(man['views'])}개 · 버튼 {len(man['buttons'])}개 · 프리셋 본문 {len(expanded)}개")

    stats = (f"분야 {len(fields)} · 세부 후보 {len(goals)} · 실천 후보 {len(actions)} · 프리셋 {len(presets)} · "
             f"라이브러리 총 {len(rows)}행 · 샘플 실행 기록 {len(sample['logs'])}개 · 할 일 {len(sample['todos'])} · 회고 {len(sample['retros'])}")
    report = ["# 검증 결과", f"기준일: {base}", stats, *notes, f"에러: {len(errors)}", *errors]
    (OUT / "validation.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\n".join(report))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
