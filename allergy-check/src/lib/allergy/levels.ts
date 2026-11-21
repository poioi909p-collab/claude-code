import type { FoodAllergy, LevelReason, Severity } from "./types";

const ORDER: Severity[] = ["none", "info", "caution", "danger"];

export function severityRank(s: Severity): number {
  return ORDER.indexOf(s);
}

export function maxSeverity(...levels: Severity[]): Severity {
  let best: Severity = "none";
  for (const l of levels) if (severityRank(l) > severityRank(best)) best = l;
  return best;
}

export function minSeverity(a: Severity, b: Severity): Severity {
  return severityRank(a) <= severityRank(b) ? a : b;
}

/**
 * 기본 등급 규칙 (가족 설정이 "아직 모름"일 때)
 * Class 4~6 위험 / 3 주의 / 2 참고 / 0~1 표시 안 함
 */
export function classToSeverity(cls: number): Severity {
  if (cls >= 4) return "danger";
  if (cls === 3) return "caution";
  if (cls === 2) return "info";
  return "none";
}

/** 전체 검사와 성분 검사 중 높은 쪽을 따른다. */
export function testSeverity(food: FoodAllergy): Severity {
  return maxSeverity(...food.tests.map((t) => classToSeverity(t.class)));
}

/** 가족 설정 > 검사 Class */
export function profileSeverity(food: FoodAllergy): { level: Severity; reason: LevelReason } {
  switch (food.status) {
    case "reacts":
      return { level: "danger", reason: "family_reacts" };
    case "doctor_avoid":
      return { level: "danger", reason: "family_doctor" };
    case "ok":
      // "먹어도 괜찮음" → 참고로만. 원래 표시 안 하던 항목(Class 0~1)을 새로 띄우지는 않음.
      return { level: minSeverity(testSeverity(food), "info"), reason: "family_ok" };
    case "unknown":
    default:
      return {
        level: testSeverity(food),
        reason: food.tests.length > 0 ? "test_class" : "no_test",
      };
  }
}

/**
 * '같은 제조시설' 문구에만 걸리면 한 단계 낮춤 (위험 → 주의 → 참고).
 * 참고는 더 낮추지 않고 참고로 남긴다(목록에서 사라지지 않게).
 */
export function downgradeForCross(level: Severity): Severity {
  switch (level) {
    case "danger":
      return "caution";
    case "caution":
      return "info";
    default:
      return level;
  }
}
