import type { LabelExtraction } from "./types";

/**
 * 텍스트로 직접 입력한 성분표를 이미지 분석 API와 같은 모양(LabelExtraction)으로 바꾼다.
 *
 * 안전 원칙: '같은 제조시설' 문구로 분류되면 등급이 한 단계 내려가므로, 그 분류만은 좁게 한다.
 * 원재료와 함유 표시는 둘 다 '들어 있음'으로 취급되므로 둘 사이 분류가 틀려도 등급은 변하지 않는다.
 */

const CROSS_KEYWORD =
  /(같은|동일한?)(제조|생산)?(시설|공장|라인|공정)|제조시설|생산시설|혼입/;
const STATEMENT_KEYWORD = /함유|알레르기|알러지|알레르겐|유발물질|유발성분/;
const INGREDIENT_PREFIX =
  /^\s*(원재료명?\s*(및\s*(그\s*)?함량)?|원료명?|재료명?|성분명?|ingredients?)\s*[:：]?\s*/i;
const STATEMENT_PREFIX =
  /^\s*[:：\-\s]*(알레르기|알러지)?\s*(유발\s*(물질|성분)|알레르겐)?\s*(표시)?\s*[:：]?\s*/;

function compact(s: string): string {
  return s.replace(/\s+/g, "");
}

/** 괄호 깊이를 지키며 쉼표류로 나눈다. "양념분말(대두, 밀), 설탕" → ["양념분말(대두, 밀)", "설탕"] */
export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if ("([{（［".includes(ch)) depth++;
    else if (")]}）］".includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && ",，、;；".includes(ch)) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** 줄·문장 단위로 나눈다. 숫자 사이의 점(0.5%)은 나누지 않는다. */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (let seg of line.split(/(?<!\d)[.。](?!\d)/)) {
      // "대두, 밀 함유, 같은 제조시설에서 …"처럼 한 줄에 붙어 있으면 '함유' 뒤에서 끊는다.
      // 단 "함유: 우유, 대두"처럼 함유 뒤에 목록이 오는 경우는 끊지 않는다.
      const pieces = seg.split(/(?<=함유)\s*[,/]\s*|(?<=함유)\s+(?![:：])/);
      for (seg of pieces) if (seg.trim()) out.push(seg.trim());
    }
  }
  return out;
}

export function parseLabelText(input: string): LabelExtraction {
  const text = input.normalize("NFC");
  const ingredients: string[] = [];
  const allergen_statement: string[] = [];
  const cross_contamination: string[] = [];

  for (const sentence of splitSentences(text)) {
    const c = compact(sentence);
    if (CROSS_KEYWORD.test(c)) {
      // 문장 전체를 한 항목으로 둔다. 매칭은 문장 안의 알레르기 단어를 찾는다.
      cross_contamination.push(sentence);
    } else if (STATEMENT_KEYWORD.test(c)) {
      const body = sentence.replace(STATEMENT_PREFIX, "").replace(/\s*함유\s*$/, "");
      allergen_statement.push(...splitTopLevel(body.replace(/\s*함유\s*/g, ",")));
    } else {
      ingredients.push(...splitTopLevel(sentence.replace(INGREDIENT_PREFIX, "")));
    }
  }

  const hasContent =
    ingredients.length + allergen_statement.length + cross_contamination.length > 0;
  return {
    product_name: null,
    ingredients,
    allergen_statement,
    cross_contamination,
    is_ingredient_label: hasContent,
    confidence: "high",
    unreadable_parts: null,
  };
}
