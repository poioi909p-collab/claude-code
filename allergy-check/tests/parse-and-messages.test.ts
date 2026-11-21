import { describe, expect, it } from "vitest";
import { analyzeText, josa, parseLabelText, resultCard, splitTopLevel } from "../src/lib/allergy";
import { levels, run } from "./helpers";

describe("텍스트 성분표 파싱", () => {
  it("괄호 깊이를 지켜서 나눈다", () => {
    expect(splitTopLevel("밀가루(미국산), 양념분말(대두, 밀, 새우), 설탕")).toEqual([
      "밀가루(미국산)",
      "양념분말(대두, 밀, 새우)",
      "설탕",
    ]);
  });

  it("실제 라면 스프 성분표 형태", () => {
    const text = [
      "원재료명: 소맥분(밀:미국산, 호주산), 팜유, 감자전분, 정제염, 효모추출물, 대두유, 양파, 마늘",
      "대두, 밀, 우유, 새우, 쇠고기 함유",
      "이 제품은 땅콩, 메밀, 계란, 게를 사용한 제품과 같은 제조시설에서 제조하고 있습니다.",
    ].join("\n");
    const p = parseLabelText(text);
    expect(p.ingredients[0]).toBe("소맥분(밀:미국산, 호주산)");
    expect(p.ingredients).toContain("효모추출물");
    expect(p.allergen_statement).toEqual(["대두", "밀", "우유", "새우", "쇠고기"]);
    expect(p.cross_contamination).toHaveLength(1);

    const r = analyzeText(text);
    expect(r.level).toBe("danger");
    expect(levels(r)).toEqual({
      효모: "danger",
      새우: "caution",
      양파: "caution",
      땅콩: "info", // 같은 제조시설: 주의 → 참고
      메밀: "info",
      게: "info",
      밀: "info",
      감자: "info",
      콩: "info",
      마늘: "info",
    });
    const peanut = r.hits.find((h) => h.allergen === "땅콩")!;
    expect(peanut.crossOnly).toBe(true);
    // '들어 있음'인 항목이 같은 등급의 '같은 제조시설' 항목보다 앞에 온다
    const order = r.hits.map((h) => h.allergen);
    expect(order.indexOf("밀")).toBeLessThan(order.indexOf("땅콩"));
  });

  it("함유 표시와 같은 제조시설 문구가 한 줄에 붙어 있어도 나눈다", () => {
    const p = parseLabelText("우유, 굴 함유, 같은 제조시설에서 땅콩을 사용한 제품을 제조");
    expect(p.allergen_statement).toEqual(["우유", "굴"]);
    expect(p.cross_contamination).toEqual(["같은 제조시설에서 땅콩을 사용한 제품을 제조"]);
    // 굴은 함유 표시에 있으므로 하향되지 않는다
    expect(levels(analyzeText("우유, 굴 함유, 같은 제조시설에서 땅콩을 사용한 제품을 제조"))).toMatchObject({
      굴: "danger",
      땅콩: "info",
    });
  });

  it("'알레르기 유발물질: …' 형식", () => {
    const p = parseLabelText("알레르기 유발물질 : 우유, 대두, 밀 함유");
    expect(p.allergen_statement).toEqual(["우유", "대두", "밀"]);
  });

  it("숫자 속 점은 문장 끝이 아니다", () => {
    const p = parseLabelText("설탕, 새우분말 0.5%, 소금");
    expect(p.ingredients).toEqual(["설탕", "새우분말 0.5%", "소금"]);
  });

  it("'혼입' 문구도 같은 제조시설로 본다", () => {
    const p = parseLabelText("제조 과정에서 게가 혼입될 수 있습니다");
    expect(p.cross_contamination).toHaveLength(1);
  });

  it("빈 입력은 성분표 아님", () => {
    expect(parseLabelText("   \n ").is_ingredient_label).toBe(false);
    expect(analyzeText("").level).toBe("unknown");
  });
});

describe("결과 카드 문구", () => {
  it("받침에 따라 조사를 고른다", () => {
    expect(josa("새우", "이", "가")).toBe("새우가");
    expect(josa("굴", "이", "가")).toBe("굴이");
    expect(josa("콩(대두)", "이", "가")).toBe("콩(대두)가");
    expect(josa("ABC", "이", "가")).toBe("ABC이(가)");
  });

  it("위험: 먹지 마세요 — ○○이(가) 들어 있어요", () => {
    const card = resultCard(analyzeText("굴소스, 설탕"));
    expect(card).toMatchObject({
      level: "danger",
      color: "red",
      icon: "⛔",
      title: "먹지 마세요",
      subtitle: "굴이 들어 있어요",
    });
  });

  it("위험 항목이 여러 개면 두 개까지 + 등", () => {
    const card = resultCard(analyzeText("효모추출물, 굴소스, 번데기"));
    expect(card.subtitle).toBe("효모, 굴 등이 들어 있어요");
  });

  it("주의: 조심하세요 — 부모님께 물어보세요", () => {
    expect(resultCard(analyzeText("새우"))).toMatchObject({
      color: "orange",
      icon: "⚠️",
      title: "조심하세요",
      subtitle: "부모님께 물어보세요",
    });
  });

  it("같은 제조시설로 주의가 되면 '공장에서 섞였을 수 있어요'", () => {
    const card = resultCard(analyzeText("설탕\n이 제품은 굴을 사용한 제품과 같은 제조시설에서 제조합니다"));
    expect(card.title).toBe("조심하세요");
    expect(card.fine).toContain("굴은 공장에서 섞였을 수 있어요");
  });

  it("참고 / 회색 문구", () => {
    expect(resultCard(analyzeText("대두"))).toMatchObject({
      color: "yellow",
      icon: "💡",
      title: "약한 반응 성분이 있어요",
    });
    expect(resultCard(run({ ingredients: ["설탕"], confidence: "low" }))).toMatchObject({
      color: "gray",
      icon: "❓",
      title: "글씨가 잘 안 보여요",
      subtitle: "다시 찍어주세요",
    });
    expect(resultCard(analyzeText(""))).toMatchObject({
      color: "gray",
      title: "성분표가 안 보여요",
      subtitle: "성분표 부분을 찍어주세요",
    });
  });
});
