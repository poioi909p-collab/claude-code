import {
  SEED_PROFILE,
  analyzeLabel,
  defaultLexicon,
  type AllergyProfile,
  type AnalysisResult,
  type FamilyStatus,
  type LabelExtraction,
  type Severity,
} from "../src/lib/allergy";

export const lex = defaultLexicon();

export function label(partial: Partial<LabelExtraction>): LabelExtraction {
  return {
    product_name: null,
    ingredients: [],
    allergen_statement: [],
    cross_contamination: [],
    is_ingredient_label: true,
    confidence: "high",
    unreadable_parts: null,
    ...partial,
  };
}

/** 시드 프로필을 복사하고 일부 항목의 가족 상태만 바꾼다. */
export function profileWith(statuses: Record<string, FamilyStatus> = {}): AllergyProfile {
  const p = structuredClone(SEED_PROFILE);
  for (const f of p.foods) if (statuses[f.allergen]) f.status = statuses[f.allergen]!;
  return p;
}

export function run(
  partial: Partial<LabelExtraction>,
  profile: AllergyProfile = SEED_PROFILE,
): AnalysisResult {
  return analyzeLabel(label(partial), profile, lex);
}

/** 항목 키 → 등급 */
export function levels(r: AnalysisResult): Record<string, Severity> {
  return Object.fromEntries(r.hits.map((h) => [h.allergen, h.level]));
}
