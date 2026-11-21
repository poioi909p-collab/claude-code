import { severityRank } from "./levels";
import type { AnalysisResult, LabelExtraction, MatchSource, Severity } from "./types";

export interface HighlightRange {
  start: number;
  end: number;
  level: Severity;
}

export interface TextSegment {
  text: string;
  /** null = 하이라이트 없음 */
  level: Severity | null;
}

/**
 * 원문을 하이라이트 조각으로 나눈다. 범위가 겹치면 더 높은 등급이 이긴다.
 * "양념분말(대두, 새우)" + [새우=caution] → ["양념분말(대두, ", "새우"(caution), ")"]
 */
export function highlightSegments(text: string, ranges: HighlightRange[]): TextSegment[] {
  const perChar: (Severity | null)[] = Array.from({ length: text.length }, () => null);
  for (const r of ranges) {
    for (let i = Math.max(0, r.start); i < Math.min(text.length, r.end); i++) {
      const cur = perChar[i];
      if (cur === null || cur === undefined || severityRank(r.level) > severityRank(cur)) {
        perChar[i] = r.level;
      }
    }
  }
  const segments: TextSegment[] = [];
  for (let i = 0; i < text.length; i++) {
    const level = perChar[i] ?? null;
    const last = segments[segments.length - 1];
    if (last && last.level === level) last.text += text[i];
    else segments.push({ text: text[i]!, level });
  }
  return segments;
}

export interface LabelSection {
  source: MatchSource;
  title: string;
  items: { text: string; segments: TextSegment[] }[];
}

const SECTION_TITLE: Record<MatchSource, string> = {
  ingredient: "원재료",
  statement: "함유 표시",
  cross: "같은 공장에서 만드는 것",
};

/** 결과 화면의 '성분표 원문 보기'용: 읽은 항목마다 걸린 단어를 하이라이트한다. */
export function labelSections(label: LabelExtraction, result: AnalysisResult): LabelSection[] {
  const rangesBy = new Map<string, HighlightRange[]>();
  for (const hit of result.hits) {
    for (const m of hit.matches) {
      const key = `${m.source}|${m.context}`;
      const list = rangesBy.get(key) ?? [];
      list.push({ start: m.start, end: m.end, level: hit.level });
      rangesBy.set(key, list);
    }
  }
  const sections: [MatchSource, string[]][] = [
    ["ingredient", label.ingredients],
    ["statement", label.allergen_statement],
    ["cross", label.cross_contamination],
  ];
  return sections
    .filter(([, items]) => items.length > 0)
    .map(([source, items]) => ({
      source,
      title: SECTION_TITLE[source],
      items: items.map((raw) => {
        const text = raw.normalize("NFC");
        return { text, segments: highlightSegments(text, rangesBy.get(`${source}|${text}`) ?? []) };
      }),
    }));
}
