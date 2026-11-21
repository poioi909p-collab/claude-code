import { describe, expect, it, vi } from "vitest";
import {
  ExtractError,
  SYSTEM_PROMPT,
  extractLabelFromImage,
  type ParseClient,
} from "../src/lib/server/extractLabel";
import type { LabelExtraction } from "../src/lib/allergy";

const LABEL: LabelExtraction = {
  product_name: "새우맛 과자",
  ingredients: ["밀가루", "양념분말(대두, 밀, 새우)", "대두", "밀", "새우"],
  allergen_statement: ["밀", "대두", "새우"],
  cross_contamination: ["땅콩"],
  is_ingredient_label: true,
  confidence: "high",
  unreadable_parts: null,
};

function fakeClient(response: Record<string, unknown>) {
  const parse = vi.fn().mockResolvedValue(response);
  return { client: { beta: { messages: { parse } } } as unknown as ParseClient, parse };
}

describe("이미지 분석 요청", () => {
  it("사진만 보내고 프로필은 보내지 않는다", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: LABEL });
    await extractLabelFromImage("BASE64DATA", "image/jpeg", { client });

    const params = parse.mock.calls[0]![0];
    const sent = JSON.stringify(params);
    // 프로필에만 있는 정보(검사 수치·가족 상태)가 요청에 들어가지 않는다
    for (const secret of ["30.04", "MAST", "IU/mL", "status", "1915", "번데기"]) {
      expect(sent).not.toContain(secret);
    }
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "BASE64DATA" },
    });
  });

  it("기본 모델은 Opus 5.5, 거절 시 서버측 대체 사용, 구조화 출력", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: LABEL });
    await extractLabelFromImage("x", "image/jpeg", { client });
    const params = parse.mock.calls[0]![0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.output_config.format).toBeDefined();
    expect(params.system).toBe(SYSTEM_PROMPT);
  });

  it("Haiku 5.5처럼 대체를 지원하지 않는 모델에는 fallbacks를 보내지 않는다", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: LABEL });
    await extractLabelFromImage("x", "image/jpeg", { client, model: "claude-haiku-5-5" });
    const params = parse.mock.calls[0]![0];
    expect(params).not.toHaveProperty("fallbacks");
    expect(params).not.toHaveProperty("betas");
  });

  it("지시문은 위험 판단을 하지 말고 글자만 옮기라고 한다", () => {
    expect(SYSTEM_PROMPT).toContain("알레르기 위험을 판단하거나 조언하지 마세요");
    expect(SYSTEM_PROMPT).toContain("양념분말(대두, 밀, 새우)");
    expect(SYSTEM_PROMPT).toContain("추측해서 채우지 마세요");
  });

  it("결과를 그대로 돌려준다", async () => {
    const { client } = fakeClient({ stop_reason: "end_turn", parsed_output: LABEL });
    await expect(extractLabelFromImage("x", "image/jpeg", { client })).resolves.toEqual(LABEL);
  });

  it.each([
    [{ stop_reason: "refusal", parsed_output: null }, "refusal"],
    [{ stop_reason: "max_tokens", parsed_output: null }, "truncated"],
    [{ stop_reason: "end_turn", parsed_output: null }, "parse_failed"],
  ])("쓸 수 없는 응답 → ExtractError(%j)", async (response, code) => {
    const { client } = fakeClient(response);
    const err = await extractLabelFromImage("x", "image/jpeg", { client }).catch((e) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect(err.code).toBe(code);
  });
});

describe("실제 SDK로 요청 모양 확인 (네트워크 없이)", () => {
  it("구조화 출력 JSON 스키마·베타 헤더가 실리고, 응답이 파싱된다", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    let captured: { url: string; headers: Headers; body: Record<string, any> } | null = null;
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      captured = {
        url: String(url),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      };
      return new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [{ type: "text", text: JSON.stringify(LABEL) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const client = new Anthropic({ apiKey: "test", fetch: fakeFetch as typeof fetch, maxRetries: 0 });
    const label = await extractLabelFromImage("QUJD", "image/jpeg", { client });

    expect(label).toEqual(LABEL);
    expect(captured!.url).toMatch(/\/v1\/messages/);
    expect(captured!.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const body = captured!.body;
    expect(body.fallbacks).toBe("default");
    expect(body.output_config.effort).toBe("medium");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(Object.keys(body.output_config.format.schema.properties).sort()).toEqual(
      Object.keys(LABEL).sort(),
    );
    expect(body.output_config.format.schema.additionalProperties).toBe(false);
  });
});
