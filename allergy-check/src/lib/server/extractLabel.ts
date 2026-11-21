import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { LabelExtractionSchema } from "@/lib/allergy/labelSchema";
import type { LabelExtraction } from "@/lib/allergy/types";

/**
 * 성분표 사진 → 글자 추출 (SPEC 7장).
 *
 * 안전 규칙
 * - 사진만 보낸다. 아이의 알레르기 프로필은 절대 보내지 않는다 (SPEC 8-5).
 * - Claude는 글자를 '읽기만' 한다. 위험 판단은 src/lib/allergy의 코드 규칙이 한다 (SPEC 8-3).
 * - 사진은 메모리에서만 다루고 저장·로그하지 않는다 (SPEC 8-6).
 */

export const DEFAULT_MODEL = "claude-opus-5-5";

/** 서버측 거절 대체(fallbacks)를 지원하는 모델. Haiku 5.5 등은 이 파라미터를 보내면 안 된다. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-2"]);

export const SYSTEM_PROMPT = `당신은 한국 가공식품 포장지 사진에서 글자를 옮겨 적는 역할만 합니다.
알레르기 위험을 판단하거나 조언하지 마세요. 판단은 다른 프로그램이 합니다.
사진 속 원재료명·알레르기 표시 부분의 글자를 보이는 그대로 정확하게 옮기는 것이 목표입니다.

규칙:
1. ingredients: 원재료명 목록을 표기된 그대로, 하나씩 적습니다.
   - 괄호가 있는 원재료는 괄호까지 포함한 원문 그대로 한 항목으로 적고, 괄호 안의 하위 원료도 각각 따로 한 항목씩 추가합니다.
     예) "양념분말(대두, 밀, 새우)" → "양념분말(대두, 밀, 새우)", "대두", "밀", "새우"
   - 원산지·함량(%)은 원문에 있으면 그대로 둡니다.
2. allergen_statement: "○○ 함유", "알레르기 유발물질: ○○" 같은 표시란에 적힌 항목을 하나씩 적습니다.
3. cross_contamination: "이 제품은 ○○을 사용한 제품과 같은 제조시설에서 제조" 같은 문구에 나오는 항목만 하나씩 적습니다.
   이 문구에 나온 항목을 ingredients나 allergen_statement에 넣지 마세요.
4. 앞면 광고 문구("무첨가", "글루텐 프리" 등)나 영양정보표는 옮기지 않습니다.
5. 읽기 어려운 글자를 추측해서 채우지 마세요. 확실히 읽을 수 없는 부분은 unreadable_parts에 어디가 왜 안 보이는지 짧게 적고, 없으면 null입니다.
6. confidence:
   - high: 원재료명과 알레르기 표시를 모두 또렷하게 읽음
   - medium: 대부분 읽었지만 일부가 흐리거나 가려지거나 잘림
   - low: 많은 부분을 읽을 수 없음 (흐림, 반사, 너무 멂, 잘림)
7. is_ingredient_label: 사진에 원재료명 목록이 보이면 true. 앞면·바코드·음식 사진처럼 원재료명이 없으면 false로 하고 목록은 비웁니다.
8. product_name: 제품명이 보이면 적고, 없으면 null입니다.
9. 원문이 영어 등 다른 언어면 번역하지 말고 원문 그대로 적습니다.`;

export type ExtractErrorCode = "refusal" | "truncated" | "parse_failed";

export class ExtractError extends Error {
  constructor(public code: ExtractErrorCode) {
    super(code);
  }
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

/** 테스트에서 가짜 클라이언트를 넣을 수 있게 필요한 부분만 받는다. */
export type ParseClient = Pick<Anthropic, "beta">;

export interface ExtractOptions {
  client?: ParseClient;
  model?: string;
}

export async function extractLabelFromImage(
  imageBase64: string,
  mediaType: ImageMediaType,
  { client = new Anthropic({ timeout: 55_000, maxRetries: 1 }), model = DEFAULT_MODEL }: ExtractOptions = {},
): Promise<LabelExtraction> {
  const useFallbacks = FALLBACK_MODELS.has(model);

  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    // 글자 옮기기라 깊게 생각할 필요는 적다. 정확도가 모자라면 6단계에서 조정.
    output_config: { effort: "medium", format: betaZodOutputFormat(LabelExtractionSchema) },
    ...(useFallbacks
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "이 사진의 성분표를 규칙대로 옮겨 적어 주세요." },
        ],
      },
    ],
  });

  // 거절은 내용을 읽기 전에 확인한다.
  if (response.stop_reason === "refusal") throw new ExtractError("refusal");
  if (response.stop_reason === "max_tokens") throw new ExtractError("truncated");
  const parsed = response.parsed_output;
  if (!parsed) throw new ExtractError("parse_failed");
  return parsed;
}
