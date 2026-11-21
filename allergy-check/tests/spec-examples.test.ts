import { describe, expect, it } from "vitest";
import { analyzeText, hitLine } from "../src/lib/allergy";
import { levels, run } from "./helpers";

// SPEC.md 9장 1단계에 적힌 테스트 예시
describe("SPEC 1단계 예시", () => {
  it('"양념분말(대두, 밀, 새우)" → 새우=주의, 콩·밀=참고', () => {
    const r = run({ ingredients: ["양념분말(대두, 밀, 새우)"] });
    expect(levels(r)).toEqual({ 새우: "caution", 콩: "info", 밀: "info" });
    expect(r.level).toBe("caution");
    expect(r.hits[0]!.allergen).toBe("새우");
  });

  it('"효모추출물" → 효모=위험', () => {
    const r = run({ ingredients: ["효모추출물"] });
    expect(levels(r)).toEqual({ 효모: "danger" });
    expect(r.level).toBe("danger");
  });

  it('"본 제품은 땅콩을 사용한 제품과 같은 제조시설에서 제조" → 땅콩 한 단계 하향', () => {
    const r = analyzeText("본 제품은 땅콩을 사용한 제품과 같은 제조시설에서 제조");
    const peanut = r.hits.find((h) => h.allergen === "땅콩")!;
    expect(peanut.baseLevel).toBe("caution"); // h8 Class 3
    expect(peanut.level).toBe("info"); // 한 단계 아래
    expect(peanut.crossOnly).toBe(true);
    expect(hitLine(peanut).note).toBe("공장에서 섞였을 수 있어요");
  });

  it("결과 화면 예시: 새우추출물·효모추출물·대두", () => {
    const r = run({ ingredients: ["새우추출물", "효모추출물", "대두"] });
    expect(r.level).toBe("danger");
    expect(r.hits.map((h) => [h.allergen, h.level])).toEqual([
      ["효모", "danger"],
      ["새우", "caution"],
      ["콩", "info"],
    ]);
    expect(r.hits.map((h) => hitLine(h).text)).toEqual([
      "효모추출물 → 효모",
      "새우추출물 → 새우",
      "대두 → 콩(대두)",
    ]);
  });

  it('하이라이트: "유청분말 → 우유" (우유는 음성이라 다른 성분으로만 표시)', () => {
    const r = run({ ingredients: ["유청분말"] });
    expect(r.hits).toEqual([]);
    expect(r.otherDetected).toEqual(["우유"]);
  });
});
