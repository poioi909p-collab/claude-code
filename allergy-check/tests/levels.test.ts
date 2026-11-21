import { describe, expect, it } from "vitest";
import { classToSeverity, downgradeForCross, profileSeverity } from "../src/lib/allergy";
import { levels, profileWith, run } from "./helpers";

describe("기본 등급 규칙 (Class)", () => {
  it.each([
    [0, "none"],
    [1, "none"],
    [2, "info"],
    [3, "caution"],
    [4, "danger"],
    [5, "danger"],
    [6, "danger"],
  ] as const)("Class %i → %s", (cls, expected) => {
    expect(classToSeverity(cls)).toBe(expected);
  });

  it("성분 검사가 있으면 높은 쪽을 따른다: 땅콩(2)+h8(3) → 주의", () => {
    expect(levels(run({ ingredients: ["땅콩"] }))).toEqual({ 땅콩: "caution" });
  });

  it("복숭아(2)+p4(3) → 주의", () => {
    expect(levels(run({ ingredients: ["황도"] }))).toEqual({ 복숭아: "caution" });
  });

  it("밀가루(2)+글루텐(1) → 참고", () => {
    expect(levels(run({ ingredients: ["글루텐"] }))).toEqual({ 밀: "info" });
  });
});

describe("가족 설정이 Class보다 우선", () => {
  it("먹으면 증상 있음 → 항상 위험 (음성인 우유라도)", () => {
    const r = run({ ingredients: ["탈지분유"] }, profileWith({ 우유: "reacts" }));
    expect(levels(r)).toEqual({ 우유: "danger" });
    expect(r.hits[0]!.levelReason).toBe("family_reacts");
  });

  it("의사가 피하라고 함 → 항상 위험 (Class 2 대두)", () => {
    const r = run({ ingredients: ["대두"] }, profileWith({ 콩: "doctor_avoid" }));
    expect(levels(r)).toEqual({ 콩: "danger" });
  });

  it("먹어도 괜찮음 → 참고로만 (Class 3 쌀)", () => {
    const r = run({ ingredients: ["쌀가루"] }, profileWith({ 쌀: "ok" }));
    expect(levels(r)).toEqual({ 쌀: "info" });
    expect(r.level).toBe("info");
  });

  it("먹어도 괜찮음 → Class 4 효모도 참고로", () => {
    const r = run({ ingredients: ["효모"] }, profileWith({ 효모: "ok" }));
    expect(levels(r)).toEqual({ 효모: "info" });
  });

  it("먹어도 괜찮음 + 음성 → 표시 안 함 (새로 띄우지 않음)", () => {
    const food = profileWith({ 우유: "ok" }).foods.find((f) => f.allergen === "우유")!;
    expect(profileSeverity(food).level).toBe("none");
  });
});

describe("같은 제조시설 하향", () => {
  it("위험 → 주의 → 참고, 참고는 참고로 남음", () => {
    expect(downgradeForCross("danger")).toBe("caution");
    expect(downgradeForCross("caution")).toBe("info");
    expect(downgradeForCross("info")).toBe("info");
    expect(downgradeForCross("none")).toBe("none");
  });

  it("굴(위험)이 같은 제조시설 문구에만 있으면 주의", () => {
    const r = run({ ingredients: ["밀가루"], cross_contamination: ["굴"] });
    expect(levels(r)).toEqual({ 굴: "caution", 밀: "info" });
    expect(r.level).toBe("caution");
  });

  it("원재료에도 있고 같은 제조시설 문구에도 있으면 하향하지 않음", () => {
    const r = run({ ingredients: ["굴소스"], cross_contamination: ["굴"] });
    expect(levels(r)).toEqual({ 굴: "danger" });
    expect(r.hits[0]!.crossOnly).toBe(false);
  });

  it("함유 표시에 있으면 하향하지 않음", () => {
    const r = run({ allergen_statement: ["새우"], cross_contamination: ["새우"] });
    expect(levels(r)).toEqual({ 새우: "caution" });
  });

  it("먹으면 증상 있음 + 같은 제조시설 → 주의", () => {
    const r = run({ cross_contamination: ["우유"] }, profileWith({ 우유: "reacts" }));
    expect(levels(r)).toEqual({ 우유: "caution" });
  });
});
