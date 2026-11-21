import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LabelExtraction } from "../src/lib/allergy";

const extract = vi.fn();
vi.mock("../src/lib/server/extractLabel", async (orig) => {
  const real = await orig<typeof import("../src/lib/server/extractLabel")>();
  return { ...real, extractLabelFromImage: (...args: unknown[]) => extract(...args) };
});

const { POST } = await import("../src/app/api/analyze/route");
const { ExtractError } = await import("../src/lib/server/extractLabel");

const LABEL: LabelExtraction = {
  product_name: null,
  ingredients: ["효모추출물"],
  allergen_statement: [],
  cross_contamination: [],
  is_ingredient_label: true,
  confidence: "high",
  unreadable_parts: null,
};

function request(opts: { type?: string; bytes?: number; code?: string; noFile?: boolean } = {}) {
  const form = new FormData();
  if (!opts.noFile) {
    const data = new Uint8Array(opts.bytes ?? 100);
    form.append("image", new File([data], "label.jpg", { type: opts.type ?? "image/jpeg" }));
  }
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: form,
    headers: opts.code ? { "x-family-code": opts.code } : {},
  });
}

beforeEach(() => {
  extract.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("FAMILY_ACCESS_CODE", "");
  vi.stubEnv("CLAUDE_MODEL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/analyze", () => {
  it("사진 → 성분표 JSON", async () => {
    extract.mockResolvedValue(LABEL);
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, label: LABEL });
    expect(extract.mock.calls[0]![1]).toBe("image/jpeg");
    expect(extract.mock.calls[0]![2]).toEqual({ model: "claude-opus-5-5" });
  });

  it("CLAUDE_MODEL 환경변수로 모델을 바꿀 수 있다", async () => {
    vi.stubEnv("CLAUDE_MODEL", "claude-sonnet-5-5");
    extract.mockResolvedValue(LABEL);
    await POST(request());
    expect(extract.mock.calls[0]![2]).toEqual({ model: "claude-sonnet-5-5" });
  });

  it("API 키가 없으면 503 not_configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "not_configured" });
    expect(extract).not.toHaveBeenCalled();
  });

  describe("가족 코드", () => {
    beforeEach(() => vi.stubEnv("FAMILY_ACCESS_CODE", "1234abcd"));

    it("코드가 없거나 틀리면 401, Claude를 부르지 않는다", async () => {
      for (const code of [undefined, "wrong", "1234abc"]) {
        const res = await POST(request({ code }));
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ ok: false, error: "access_code" });
      }
      expect(extract).not.toHaveBeenCalled();
    });

    it("코드가 맞으면 통과", async () => {
      extract.mockResolvedValue(LABEL);
      expect((await POST(request({ code: "1234abcd" }))).status).toBe(200);
    });
  });

  it.each([
    [{ noFile: true }, 400, "bad_request"],
    [{ type: "image/gif" }, 400, "bad_request"],
    [{ type: "text/plain" }, 400, "bad_request"],
    [{ bytes: 4 * 1024 * 1024 + 1 }, 413, "too_large"],
  ])("잘못된 업로드 %j → %i", async (opts, status, error) => {
    const res = await POST(request(opts));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, error });
    expect(extract).not.toHaveBeenCalled();
  });

  it("거절·잘림·형식 오류 → unreadable (회색 안내)", async () => {
    extract.mockRejectedValue(new ExtractError("refusal"));
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: "unreadable" });
  });

  it("잘못된 API 키 → 503 not_configured", async () => {
    extract.mockRejectedValue(
      new Anthropic.AuthenticationError(401, { type: "error" }, "invalid x-api-key", new Headers()),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "not_configured" });
  });

  it("사용량 제한 → 429 busy", async () => {
    extract.mockRejectedValue(
      new Anthropic.RateLimitError(429, { type: "error" }, "rate limited", new Headers()),
    );
    const res = await POST(request());
    expect(res.status).toBe(429);
  });

  it("오류 로그에 사진이나 응답 내용을 남기지 않는다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    extract.mockRejectedValue(new Error("secret ingredient text 새우"));
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(JSON.stringify(log.mock.calls)).not.toContain("새우");
  });
});
