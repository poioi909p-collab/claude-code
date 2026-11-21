import seedProfile from "../../../data/profile.seed.json";
import synonyms from "../../../data/synonyms.json";
import { analyzeLabel } from "./analyze";
import { buildLexicon, type Lexicon } from "./lexicon";
import { parseLabelText } from "./parseLabel";
import type { AllergyProfile, AnalysisResult, SynonymDictionary } from "./types";

export * from "./types";
export * from "./levels";
export * from "./lexicon";
export * from "./parseLabel";
export * from "./analyze";
export * from "./messages";

export const SEED_PROFILE = seedProfile as AllergyProfile;
export const SYNONYMS = synonyms as SynonymDictionary;

/** 프로필에 있는데 사전에 단어가 없는 항목 (매칭이 절대 안 되므로 반드시 비어 있어야 함) */
export function findUnmatchableFoods(
  profile: AllergyProfile,
  dict: SynonymDictionary = SYNONYMS,
  custom: Record<string, string[]> = {},
): string[] {
  return profile.foods
    .map((f) => f.allergen)
    .filter((k) => !(k in dict.allergens) && !(custom[k]?.length));
}

export function defaultLexicon(custom: Record<string, string[]> = {}): Lexicon {
  return buildLexicon(SYNONYMS, custom);
}

/** 텍스트 직접 입력 → 결과 (2단계 화면용 편의 함수) */
export function analyzeText(
  text: string,
  profile: AllergyProfile = SEED_PROFILE,
  lexicon: Lexicon = defaultLexicon(),
): AnalysisResult {
  return analyzeLabel(parseLabelText(text), profile, lexicon);
}
