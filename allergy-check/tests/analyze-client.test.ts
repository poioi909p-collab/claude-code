import { describe, expect, it, vi } from "vitest";
import { analyzePhoto } from "../src/lib/client/analyzeApi";
import { fitWithin } from "../src/lib/client/resizeImage";

const LABEL = {
  product_name: null,
  ingredients: ["새우"],
  allergen_statement: [],
  cross_contamination: [],
  is_ingredient_label: true,
  confidence: "high",
  unreadable_parts: null,
};

const json = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("업로드 전 축소 크기", () => {
  it("긴 변을 1600px로 맞춘다", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it("이미 작으면 그대로", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("analyzePhoto", () => {
  it("사진만 보내고, 가족 코드는 헤더로", async () => {
    const fetchImpl = json({ ok: true, label: LABEL });
    const res = await analyzePhoto(new Blob(["jpg"], { type: "image/jpeg" }), {
      familyCode: "abcd",
      fetchImpl,
    });
    expect(res).toEqual({ ok: true, label: LABEL });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/analyze");
    expect(init.headers).toEqual({ "x-family-code": "abcd" });
    const form = init.body as FormData;
    expect([...form.keys()]).toEqual(["image"]);
  });

  it("서버 응답 모양이 틀리면 unreadable", async () => {
    const res = await analyzePhoto(new Blob(["x"]), {
      familyCode: "",
      fetchImpl: json({ ok: true, label: { ...LABEL, confidence: "very high" } }),
    });
    expect(res).toEqual({ ok: false, error: "unreadable" });
  });

  it("서버 오류 코드를 전달한다", async () => {
    const res = await analyzePhoto(new Blob(["x"]), {
      familyCode: "",
      fetchImpl: json({ ok: false, error: "access_code" }, 401),
    });
    expect(res).toEqual({ ok: false, error: "access_code" });
  });

  it("모르는 오류 코드·깨진 응답 → server", async () => {
    expect(
      await analyzePhoto(new Blob(["x"]), { familyCode: "", fetchImpl: json({ ok: false, error: "???" }) }),
    ).toEqual({ ok: false, error: "server" });
    expect(
      await analyzePhoto(new Blob(["x"]), {
        familyCode: "",
        fetchImpl: vi.fn().mockResolvedValue(new Response("<html>", { status: 504 })),
      }),
    ).toEqual({ ok: false, error: "server" });
  });

  it("연결 실패 → network", async () => {
    const res = await analyzePhoto(new Blob(["x"]), {
      familyCode: "",
      fetchImpl: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    });
    expect(res).toEqual({ ok: false, error: "network" });
  });
});
