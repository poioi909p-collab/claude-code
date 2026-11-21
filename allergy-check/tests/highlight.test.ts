import { describe, expect, it } from "vitest";
import { highlightSegments, labelSections, parseLabelText } from "../src/lib/allergy";
import { run } from "./helpers";

describe("원문 하이라이트", () => {
  it("걸린 단어만 조각으로 나눈다", () => {
    expect(highlightSegments("양념분말(대두, 새우)", [
      { start: 5, end: 7, level: "info" },
      { start: 9, end: 11, level: "caution" },
    ])).toEqual([
      { text: "양념분말(", level: null },
      { text: "대두", level: "info" },
      { text: ", ", level: null },
      { text: "새우", level: "caution" },
      { text: ")", level: null },
    ]);
  });

  it("겹치면 높은 등급이 이긴다", () => {
    expect(highlightSegments("통밀크", [
      { start: 0, end: 2, level: "info" },
      { start: 1, end: 3, level: "danger" },
    ])).toEqual([
      { text: "통", level: "info" },
      { text: "밀크", level: "danger" },
    ]);
  });

  it("결과의 걸린 성분이 원문 섹션에 표시된다", () => {
    const label = parseLabelText("원재료명: 설탕, 효모추출물\n이 제품은 굴을 사용한 제품과 같은 제조시설에서 제조");
    const result = run(label);
    const sections = labelSections(label, result);
    expect(sections.map((s) => s.source)).toEqual(["ingredient", "cross"]);
    expect(sections[0]!.items[1]!.segments).toEqual([{ text: "효모추출물", level: "danger" }]);
    const cross = sections[1]!.items[0]!.segments.find((s) => s.level);
    expect(cross).toEqual({ text: "굴", level: "caution" });
  });
});
