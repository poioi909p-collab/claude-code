import type { MatchSource, SynonymDictionary, TermMatch } from "./types";

/**
 * 정규화된 단어 → 그 단어가 걸리게 하는 알레르기 항목 키들.
 * 빈 Set이면 '알레르기 아님' 단어(notAllergens): 더 짧은 단어가 잘못 걸리는 것만 막는다.
 */
export type Lexicon = Map<string, Set<string>>;

const ZERO_WIDTH = /[​-‍⁠﻿]/;
const WHITESPACE = /\s/;

/** 전각 영숫자·기호를 반각으로, 영문은 소문자로. */
function normalizeChar(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0xff01 && code <= 0xff5e) ch = String.fromCharCode(code - 0xfee0);
  return ch.toLowerCase();
}

/** 사전 단어 정규화: NFC, 공백 제거, 소문자. */
export function normalizeTerm(term: string): string {
  let out = "";
  for (const ch of term.normalize("NFC")) {
    if (WHITESPACE.test(ch) || ZERO_WIDTH.test(ch)) continue;
    out += normalizeChar(ch);
  }
  return out;
}

interface NormalizedText {
  text: string;
  /** text[i]가 원문의 어느 위치에서 왔는지 */
  map: number[];
}

/**
 * 원문을 매칭용으로 정규화한다. keepSpaces=false면 공백을 지워서
 * "땅콩 버터"도 "땅콩버터"로 찾고, true면 공백을 경계로 남긴다.
 */
function normalizeText(original: string, keepSpaces: boolean): NormalizedText {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < original.length; i++) {
    const ch = original[i]!;
    if (ZERO_WIDTH.test(ch)) continue;
    if (WHITESPACE.test(ch)) {
      if (keepSpaces) {
        text += " ";
        map.push(i);
      }
      continue;
    }
    text += normalizeChar(ch);
    map.push(i);
  }
  return { text, map };
}

export function buildLexicon(
  dict: SynonymDictionary,
  custom: Record<string, string[]> = {},
): Lexicon {
  const lex: Lexicon = new Map();
  const add = (term: string, key: string | null) => {
    const t = normalizeTerm(term);
    if (!t) return;
    let set = lex.get(t);
    if (!set) lex.set(t, (set = new Set()));
    if (key) set.add(key);
  };
  for (const [key, terms] of Object.entries(dict.allergens)) {
    add(key, key);
    for (const t of terms) add(t, key);
  }
  for (const [key, terms] of Object.entries(custom)) {
    add(key, key);
    for (const t of terms) add(t, key);
  }
  for (const t of Object.keys(dict.notAllergens)) add(t, null);
  return lex;
}

interface Occurrence {
  term: string;
  keys: Set<string>;
  start: number; // 정규화 텍스트 기준
  end: number;
}

function findOccurrences(text: string, lex: Lexicon): Occurrence[] {
  const found: Occurrence[] = [];
  for (const [term, keys] of lex) {
    let from = 0;
    for (;;) {
      const idx = text.indexOf(term, from);
      if (idx < 0) break;
      found.push({ term, keys, start: idx, end: idx + term.length });
      from = idx + 1;
    }
  }
  // 더 긴 단어 안에 완전히 들어가는 짧은 단어는 버린다.
  // (예: "땅콩" 안의 "콩", "메밀가루" 안의 "밀가루", "파인애플" 안의 "애플")
  // 겹치기만 하고 감싸지 않으면 둘 다 남긴다 — 놓치는 것보다 더 경고하는 쪽이 안전.
  return found.filter(
    (o) =>
      !found.some(
        (p) => p !== o && p.start <= o.start && p.end >= o.end && p.end - p.start > o.end - o.start,
      ),
  );
}

const WORD_DELIMITER = /[\s,，、;；:：()（）[\]［］{}<>〈〉「」『』/·・|]/;
const TRAILING_PARTICLE = /[을를이가은는과와도의]$/;

/** 걸린 부분을 원문 단어 단위로 넓힌다. "유청" → "유청분말" */
function expandToWord(context: string, start: number, end: number): string {
  let s = start;
  let e = end;
  while (s > 0 && !WORD_DELIMITER.test(context[s - 1]!)) s--;
  while (e < context.length && !WORD_DELIMITER.test(context[e]!)) e++;
  let word = context.slice(s, e);
  // 문장 속 조사는 떼어낸다("땅콩을" → "땅콩"). 걸린 단어 자체의 글자는 건드리지 않는다.
  if (e > end && TRAILING_PARTICLE.test(word)) word = word.slice(0, -1);
  return word.trim();
}

/**
 * 성분표 한 항목(원문)에서 알레르기 단어를 모두 찾는다.
 * 공백을 지운 경우와 공백을 경계로 둔 경우를 둘 다 찾아 합친다.
 * 한쪽에서만 걸려도 결과에 남는다(놓치지 않기 위해).
 */
export function matchText(context: string, source: MatchSource, lex: Lexicon): TermMatch[] {
  const original = context.normalize("NFC");
  const results = new Map<string, TermMatch>();
  for (const keepSpaces of [false, true]) {
    const { text, map } = normalizeText(original, keepSpaces);
    for (const occ of findOccurrences(text, lex)) {
      const start = map[occ.start]!;
      const end = map[occ.end - 1]! + 1;
      for (const allergen of occ.keys) {
        const id = `${allergen}|${start}|${end}`;
        if (results.has(id)) continue;
        results.set(id, {
          allergen,
          source,
          term: occ.term,
          context: original,
          start,
          end,
          word: expandToWord(original, start, end),
        });
      }
    }
  }
  const all = [...results.values()];
  // 같은 항목이 두 번 걸렸으면(예: "땅콩 버터" → "땅콩버터"와 "땅콩") 긴 쪽만 남긴다.
  return all
    .filter(
      (m) =>
        !all.some(
          (n) =>
            n !== m &&
            n.allergen === m.allergen &&
            n.start <= m.start &&
            n.end >= m.end &&
            n.end - n.start > m.end - m.start,
        ),
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
