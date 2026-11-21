import { describe, expect, it } from "vitest";
import { SEED_PROFILE, SYNONYMS, findUnmatchableFoods, hitLine, matchText } from "../src/lib/allergy";
import { lex, levels, run } from "./helpers";

const keysIn = (text: string) => [...new Set(matchText(text, "ingredient", lex).map((m) => m.allergen))].sort();

describe("데이터 무결성", () => {
  it("프로필의 모든 음식 항목이 사전에 있다", () => {
    expect(findUnmatchableFoods(SEED_PROFILE)).toEqual([]);
  });

  it("의무표시 22종이 모두 사전에 있다", () => {
    expect(SYNONYMS.mandatory22).toHaveLength(22);
    for (const k of SYNONYMS.mandatory22) expect(SYNONYMS.allergens).toHaveProperty(k);
  });

  it("'알레르기 아님' 단어가 알레르기 단어와 겹치지 않는다", () => {
    const allTerms = new Set(Object.values(SYNONYMS.allergens).flat());
    for (const t of Object.keys(SYNONYMS.notAllergens)) expect(allTerms.has(t)).toBe(false);
  });

  it("프로필 음식 항목에 중복이 없다", () => {
    const keys = SEED_PROFILE.foods.map((f) => f.allergen);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("동의어 매칭", () => {
  it.each([
    ["유청분말", ["우유"]],
    ["새우추출물", ["새우"]],
    ["보리새우", ["새우"]], // '보리'로 걸리지 않음
    ["이스트", ["효모"]],
    ["굴소스", ["굴"]],
    ["오이스터소스", ["굴"]], // '오이'로 걸리지 않음
    ["낙화생", ["땅콩"]],
    ["땅콩버터", ["땅콩"]], // '콩'(대두)·'버터'(우유)로 걸리지 않음
    ["흰강낭콩추출물", ["강낭콩"]], // '콩'(대두)으로 걸리지 않음
    ["메밀가루", ["메밀"]], // '밀가루'로 걸리지 않음
    ["호밀빵", ["호밀"]],
    ["소맥분", ["밀"]],
    ["밀크초콜릿", ["우유", "카카오"]], // '밀'로 걸리지 않음
    ["코코넛밀크", ["코코넛"]],
    ["코코아버터", ["카카오"]], // '버터'(우유)로 걸리지 않음
    ["옥수수전분", ["옥수수"]],
    ["콘시럽", ["옥수수"]],
    ["현미", ["쌀"]],
    ["토마토케첩", ["토마토"]],
    ["표고버섯분말", ["버섯"]],
    ["애플망고", ["망고"]],
    ["사과농축액", ["사과"]],
    ["해바라기유", ["해바라기씨"]],
    ["누에번데기", ["번데기"]],
    ["빵가루", ["밀", "효모"]],
    ["대두레시틴", ["콩"]],
    ["진간장", ["콩"]],
    ["WHEAT FLOUR", ["밀"]],
    ["Yeast extract", ["효모"]],
    ["ｍｉｌｋ", ["우유"]], // 전각 문자
  ])("%s → %j", (text, expected) => {
    expect(keysIn(text)).toEqual([...expected].sort());
  });

  it("묶음 단어 '갑각류'는 새우·게·랍스터에 동시에 걸린다", () => {
    expect(keysIn("갑각류")).toEqual(["게", "랍스터", "새우"]);
  });

  it("'조개류'는 굴·전복·홍합까지 걸린다 (의무표시 기준)", () => {
    expect(keysIn("조개류")).toEqual(expect.arrayContaining(["굴", "전복", "홍합", "조개"]));
  });

  it.each([
    ["파인애플", []],
    ["망고스틴", []],
    ["산딸기", []],
    ["들깨", []],
    ["아밀라아제", []],
    ["밀랍", []],
    ["실리콘수지", []],
    ["완두콩", []],
    ["시어버터", []],
    ["천연유래 향료", []],
    ["스콘믹스", []],
  ])("잘못 걸리지 않음: %s", (text, expected) => {
    expect(keysIn(text)).toEqual(expected);
  });

  it("띄어쓰기가 달라도 찾는다", () => {
    // 띄어 쓴 '콩'도 따로 대두로 걸린다(놓치는 것보다 더 경고하는 쪽)
    expect(keysIn("땅 콩")).toContain("땅콩");
    expect(keysIn("대두 단백")).toEqual(["콩"]);
    expect(keysIn("효모 추출물")).toEqual(["효모"]);
  });

  it("띄어쓰기 때문에 '알레르기 아님' 단어로 오인되면 안전한 쪽(걸림)으로 남는다", () => {
    // "들 깨"는 붙이면 '들깨'지만, 띄어 쓴 '깨'는 참깨로 본다
    expect(keysIn("들 깨")).toEqual(["참깨"]);
  });

  it("하이라이트 위치와 원문 단어", () => {
    const [m] = matchText("유청분말(우유)", "ingredient", lex).filter((x) => x.term === "유청");
    expect(m).toMatchObject({ start: 0, end: 2, word: "유청분말" });
  });

  it("괄호 속 하위 원료 위치", () => {
    const ms = matchText("양념분말(대두, 밀, 새우)", "ingredient", lex);
    const shrimp = ms.find((m) => m.allergen === "새우")!;
    expect("양념분말(대두, 밀, 새우)".slice(shrimp.start, shrimp.end)).toBe("새우");
    expect(shrimp.word).toBe("새우");
  });

  it("문장 속 조사는 떼고 보여준다", () => {
    const [m] = matchText("이 제품은 땅콩을 사용한 제품과 같은 제조시설에서 제조", "cross", lex);
    expect(m).toMatchObject({ allergen: "땅콩", word: "땅콩" });
  });

  it("같은 항목이 여러 단어로 걸리면 한 줄에 모아 보여준다", () => {
    const r = run({ ingredients: ["건새우", "새우젓"] });
    expect(r.hits).toHaveLength(1);
    expect(hitLine(r.hits[0]!).text).toBe("건새우, 새우젓 → 새우");
  });

  it("원문 단어와 항목 이름이 같으면 한 번만 보여준다", () => {
    const r = run({ ingredients: ["새우", "대두"] });
    expect(r.hits.map((h) => hitLine(h).text)).toEqual(["새우", "대두 → 콩(대두)"]);
  });

  it("흡입 항원은 매칭 대상이 아니다", () => {
    // '집먼지진드기'·'고양이'는 사전에 없으므로 아무것도 걸리지 않는다
    expect(levels(run({ ingredients: ["고양이 모양 젤리"] }))).toEqual({});
  });
});
