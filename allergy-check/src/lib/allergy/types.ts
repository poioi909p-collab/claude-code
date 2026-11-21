/** 결과 등급. 순서가 곧 심각도(뒤로 갈수록 높음). */
export type Severity = "none" | "info" | "caution" | "danger";

/** 결과 화면 맨 위 카드의 등급. 'clear' = 초록(못 찾았어요), 'unknown' = 회색(확인 불가). */
export type OverallLevel = "unknown" | "clear" | "info" | "caution" | "danger";

/**
 * 가족이 항목마다 지정하는 실제 상태. 검사 Class보다 우선한다.
 * - reacts: 먹으면 증상 있음 → 항상 위험
 * - doctor_avoid: 의사가 피하라고 함 → 항상 위험
 * - unknown: 아직 모름(기본값) → 검사 Class 기준
 * - ok: 먹어도 괜찮음 → 참고로만 표시
 */
export type FamilyStatus = "reacts" | "doctor_avoid" | "unknown" | "ok";

export interface TestResult {
  /** 검사지에 적힌 이름 (예: "땅콩 성분 h8") */
  name: string;
  /** MAST Class 0~6 */
  class: number;
  /** IU/mL. 음성 항목은 null */
  value: number | null;
  /** 성분(component) 검사 여부 */
  component?: boolean;
  note?: string;
}

export interface FoodAllergy {
  /** 동의어 사전의 항목 키 (예: "땅콩") */
  allergen: string;
  status: FamilyStatus;
  /** 같은 음식의 전체 검사 + 성분 검사. 가장 높은 쪽을 따른다. */
  tests: TestResult[];
}

export interface NonFoodAllergy {
  name: string;
  group: string;
  class: number;
}

export interface AllergyProfile {
  schemaVersion: 1;
  /** 부모가 첫 실행 때 프로필을 확인했는지. false면 홈에 "부모님 확인 필요" 배너 */
  confirmedByParent: boolean;
  test: {
    type: string;
    date: string;
    unit: string;
    totalIgE?: number;
    notes?: string[];
  };
  foods: FoodAllergy[];
  nonFoods: NonFoodAllergy[];
  /** 의사가 처방한 응급약 등 가족이 직접 쓰는 메모 */
  emergencyMemo: string;
}

export interface SynonymDictionary {
  schemaVersion: 1;
  mandatory22: string[];
  /** 항목 키 → 성분표에서 찾을 단어 목록 */
  allergens: Record<string, string[]>;
  /** 알레르기 단어를 품고 있지만 그 알레르기가 아닌 단어 → 이유 */
  notAllergens: Record<string, string>;
}

/** 이미지 분석 API(LLM)가 돌려주는 JSON. 텍스트 직접 입력도 같은 모양으로 만든다. */
export interface LabelExtraction {
  product_name: string | null;
  ingredients: string[];
  allergen_statement: string[];
  cross_contamination: string[];
  is_ingredient_label: boolean;
  confidence: "high" | "medium" | "low";
  unreadable_parts: string | null;
}

/** 성분이 성분표의 어느 부분에서 나왔는지 */
export type MatchSource = "ingredient" | "statement" | "cross";

export interface TermMatch {
  allergen: string;
  source: MatchSource;
  /** 사전에서 걸린 단어 (예: "유청") */
  term: string;
  /** 성분표 원문 한 항목 (예: "양념분말(대두, 밀, 새우)") */
  context: string;
  /** context 안에서 걸린 부분의 위치 [start, end) — 하이라이트용 */
  start: number;
  end: number;
  /** 화면에 보여줄 원문 단어 (예: "유청분말") */
  word: string;
}

export type LevelReason = "family_reacts" | "family_doctor" | "family_ok" | "test_class" | "no_test";

export interface AllergenHit {
  allergen: string;
  /** 최종 등급 (같은 제조시설 하향 반영) */
  level: Severity;
  /** 프로필 기준 등급 (하향 전) */
  baseLevel: Severity;
  levelReason: LevelReason;
  /** 원재료/함유 표시에는 없고 '같은 제조시설' 문구에만 있음 */
  crossOnly: boolean;
  matches: TermMatch[];
  tests: TestResult[];
}

export type UnknownReason = "not_label" | "low_confidence" | "empty" | "uncertain";

export interface AnalysisResult {
  level: OverallLevel;
  /** level === 'unknown'일 때 이유 */
  unknownReason?: UnknownReason;
  /** 프로필에 걸린 항목. 높은 등급 순 */
  hits: AllergenHit[];
  /** 성분표에서 찾았지만 내 알레르기는 아닌 항목 (예: 음성인 우유) */
  otherDetected: string[];
  /** 사진 일부가 흐리거나 하는 등 추가 안내가 필요한지 */
  partlyUncertain: boolean;
  productName: string | null;
}
