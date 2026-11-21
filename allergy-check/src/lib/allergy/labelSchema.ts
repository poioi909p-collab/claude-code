import { z } from "zod";
import type { LabelExtraction } from "./types";

/** 이미지 분석 API 응답 형식 (SPEC 7장). 서버(구조화 출력)와 클라이언트(응답 검증)가 같이 쓴다. */
export const LabelExtractionSchema = z.object({
  product_name: z.string().nullable(),
  ingredients: z.array(z.string()),
  allergen_statement: z.array(z.string()),
  cross_contamination: z.array(z.string()),
  is_ingredient_label: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  unreadable_parts: z.string().nullable(),
});

// 타입이 types.ts의 LabelExtraction과 어긋나면 컴파일 오류가 나게 한다.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _check: Same<z.infer<typeof LabelExtractionSchema>, LabelExtraction> = true;
void _check;
