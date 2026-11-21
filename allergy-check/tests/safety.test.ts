import { describe, expect, it } from "vitest";
import { DISCLAIMER, resultCard } from "../src/lib/allergy";
import { run } from "./helpers";

describe("안전 규칙: 불확실하면 초록을 띄우지 않는다", () => {
  it("신뢰도 low → 무조건 회색 (위험 성분이 보여도)", () => {
    const r = run({ ingredients: ["효모추출물"], confidence: "low" });
    expect(r.level).toBe("unknown");
    expect(r.unknownReason).toBe("low_confidence");
    expect(r.hits.map((h) => h.allergen)).toEqual(["효모"]); // 목록에는 보여줌
  });

  it("신뢰도 low + 아무것도 못 찾음 → 회색", () => {
    expect(run({ ingredients: ["설탕"], confidence: "low" }).level).toBe("unknown");
  });

  it("신뢰도 medium + 아무것도 못 찾음 → 회색", () => {
    const r = run({ ingredients: ["설탕", "정제소금"], confidence: "medium" });
    expect(r.level).toBe("unknown");
    expect(r.unknownReason).toBe("uncertain");
  });

  it("일부를 못 읽음 + 아무것도 못 찾음 → 회색", () => {
    const r = run({ ingredients: ["설탕"], unreadable_parts: "아래쪽 두 줄이 가려짐" });
    expect(r.level).toBe("unknown");
  });

  it("신뢰도 medium이어도 찾은 성분이 있으면 그 등급 + 흐림 안내", () => {
    const r = run({ ingredients: ["새우"], confidence: "medium" });
    expect(r.level).toBe("caution");
    expect(resultCard(r).fine).toContain("일부 글씨가 흐려서 더 있을 수 있어요");
  });

  it("성분표가 아니면 회색 + 다시 찍기 안내", () => {
    const r = run({ ingredients: ["효모"], is_ingredient_label: false });
    expect(r.level).toBe("unknown");
    expect(r.unknownReason).toBe("not_label");
    expect(resultCard(r).subtitle).toBe("성분표 부분을 찍어주세요");
  });

  it("읽은 내용이 하나도 없으면 회색", () => {
    expect(run({}).level).toBe("unknown");
  });

  it("음성 항목만 있으면 초록 — 문구는 '못 찾았어요'이고 '안전'이라 하지 않음", () => {
    const r = run({ ingredients: ["설탕", "탈지분유", "계란"] });
    expect(r.level).toBe("clear");
    expect(r.otherDetected.sort()).toEqual(["계란", "우유"]);
    const card = resultCard(r);
    expect(card.title).toBe("내 알레르기 성분은 못 찾았어요");
    expect(card.fine).toContain("성분표가 틀리거나 빠졌을 수 있어요");
    expect(JSON.stringify(card)).not.toMatch(/안전/);
  });

  it("면책 문구", () => {
    expect(DISCLAIMER).toBe("이 앱은 참고용이에요. 처음 먹는 음식은 부모님과 확인하세요");
  });
});
