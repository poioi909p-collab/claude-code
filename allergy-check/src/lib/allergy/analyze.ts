import { matchText, type Lexicon } from "./lexicon";
import { downgradeForCross, maxSeverity, profileSeverity, severityRank } from "./levels";
import type {
  AllergenHit,
  AllergyProfile,
  AnalysisResult,
  LabelExtraction,
  OverallLevel,
  TermMatch,
} from "./types";

/**
 * 추출된 성분표 → 동의어 사전 → 알레르기 프로필 대조.
 * 위험 판단은 전부 여기 코드 규칙으로 하며, LLM은 글자를 읽어오기만 한다.
 */
export function analyzeLabel(
  label: LabelExtraction,
  profile: AllergyProfile,
  lexicon: Lexicon,
): AnalysisResult {
  const base = {
    hits: [] as AllergenHit[],
    otherDetected: [] as string[],
    partlyUncertain: false,
    productName: label.product_name ?? null,
  };

  if (!label.is_ingredient_label) {
    return { ...base, level: "unknown", unknownReason: "not_label" };
  }

  const matches: TermMatch[] = [
    ...label.ingredients.flatMap((t) => matchText(t, "ingredient", lexicon)),
    ...label.allergen_statement.flatMap((t) => matchText(t, "statement", lexicon)),
    ...label.cross_contamination.flatMap((t) => matchText(t, "cross", lexicon)),
  ];

  const byAllergen = new Map<string, TermMatch[]>();
  for (const m of matches) {
    const list = byAllergen.get(m.allergen) ?? [];
    list.push(m);
    byAllergen.set(m.allergen, list);
  }

  const foods = new Map(profile.foods.map((f) => [f.allergen, f]));
  const hits: AllergenHit[] = [];
  const otherDetected: string[] = [];

  for (const [allergen, ms] of byAllergen) {
    const food = foods.get(allergen);
    if (!food) {
      otherDetected.push(allergen);
      continue;
    }
    const { level: baseLevel, reason } = profileSeverity(food);
    const crossOnly = ms.every((m) => m.source === "cross");
    // 원재료나 함유 표시에 한 번이라도 있으면 그대로, '같은 제조시설'에만 있으면 한 단계 낮춤.
    const level = crossOnly ? downgradeForCross(baseLevel) : baseLevel;
    if (level === "none") {
      otherDetected.push(allergen);
      continue;
    }
    hits.push({
      allergen,
      level,
      baseLevel,
      levelReason: reason,
      crossOnly,
      matches: ms,
      tests: food.tests,
    });
  }

  const firstIndex = (h: AllergenHit) => matches.indexOf(h.matches[0]!);
  hits.sort(
    (a, b) =>
      severityRank(b.level) - severityRank(a.level) ||
      Number(a.crossOnly) - Number(b.crossOnly) ||
      firstIndex(a) - firstIndex(b),
  );

  const partlyUncertain =
    label.confidence !== "high" || Boolean(label.unreadable_parts?.trim());
  const result = { ...base, hits, otherDetected, partlyUncertain };

  const nothingRead =
    label.ingredients.length + label.allergen_statement.length + label.cross_contamination.length ===
    0;
  if (nothingRead) return { ...result, level: "unknown", unknownReason: "empty" };

  // 신뢰도 low면 무조건 회색. 찾은 성분은 목록에는 보여준다.
  if (label.confidence === "low") {
    return { ...result, level: "unknown", unknownReason: "low_confidence" };
  }

  const top = maxSeverity(...hits.map((h) => h.level));
  if (top === "none") {
    // 일부라도 불확실하면 '못 찾았어요'(초록)를 띄우지 않는다.
    if (partlyUncertain) return { ...result, level: "unknown", unknownReason: "uncertain" };
    return { ...result, level: "clear" };
  }
  return { ...result, level: top as OverallLevel };
}
