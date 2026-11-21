import type { OverallLevel, Severity } from "@/lib/allergy";

/** Tailwind가 찾을 수 있도록 클래스 이름을 문자열 그대로 둔다. */

/** 결과 카드 전체 배경. 흰 글자 대비 4.5:1 이상(노랑은 검은 글자). */
export const CARD_CLASS: Record<OverallLevel, string> = {
  danger: "bg-red-700 text-white",
  caution: "bg-orange-700 text-white",
  info: "bg-yellow-300 text-gray-950",
  clear: "bg-green-700 text-white",
  unknown: "bg-gray-600 text-white",
};

/** 걸린 성분 한 줄 */
export const ROW_CLASS: Record<Severity, string> = {
  danger: "border-red-700 bg-red-50 dark:border-red-500 dark:bg-red-950/60",
  caution: "border-orange-600 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/60",
  info: "border-yellow-500 bg-yellow-50 dark:border-yellow-400 dark:bg-yellow-950/50",
  none: "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900",
};

/** 등급 글자 배지 — 색만으로 구분하지 않도록 항상 글자와 함께 */
export const BADGE: Record<Severity, { text: string; className: string }> = {
  danger: { text: "위험", className: "bg-red-700 text-white" },
  caution: { text: "주의", className: "bg-orange-700 text-white" },
  info: { text: "참고", className: "bg-yellow-300 text-gray-950" },
  none: { text: "", className: "" },
};

/** 원문 하이라이트 — 색 + 굵게 + 밑줄 */
export const MARK_CLASS: Record<Severity, string> = {
  danger: "bg-red-200 text-red-950 dark:bg-red-800 dark:text-white",
  caution: "bg-orange-200 text-orange-950 dark:bg-orange-800 dark:text-white",
  info: "bg-yellow-200 text-yellow-950 dark:bg-yellow-700 dark:text-white",
  none: "",
};
