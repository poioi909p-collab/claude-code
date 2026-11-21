import type { AllergenHit, AnalysisResult, OverallLevel, Severity } from "./types";

/** 받침 유무로 조사 고르기. 한글이 아니면 "이(가)" 식으로 둘 다 쓴다. */
function hasFinalConsonant(word: string): boolean | null {
  const last = word.trim().replace(/[)\]）」』'"\s]+$/, "").slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(last)) return "013678".includes(last); // 영, 일, 삼, 육, 칠, 팔
  return null;
}

export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const f = hasFinalConsonant(word);
  if (f === null) return `${word}${withFinal}(${withoutFinal})`;
  return `${word}${f ? withFinal : withoutFinal}`;
}

/** 아이 화면용 이름 */
const DISPLAY_NAME: Record<string, string> = {
  콩: "콩(대두)",
};
export function displayName(allergen: string): string {
  return DISPLAY_NAME[allergen] ?? allergen;
}

export const LEVEL_STYLE: Record<OverallLevel, { color: string; icon: string; label: string }> = {
  danger: { color: "red", icon: "⛔", label: "위험" },
  caution: { color: "orange", icon: "⚠️", label: "주의" },
  info: { color: "yellow", icon: "💡", label: "참고" },
  clear: { color: "green", icon: "✅", label: "해당 없음" },
  unknown: { color: "gray", icon: "❓", label: "확인 불가" },
};

export const DISCLAIMER = "이 앱은 참고용이에요. 처음 먹는 음식은 부모님과 확인하세요";
export const CROSS_NOTE = "공장에서 섞였을 수 있어요";

export interface ResultCard {
  level: OverallLevel;
  color: string;
  icon: string;
  title: string;
  subtitle: string;
  /** 작은 글씨 안내 */
  fine: string[];
}

/** "새우, 굴" / "새우, 굴, 게 등" */
function joinNames(hits: AllergenHit[], max = 2): string {
  const names = [...new Set(hits.map((h) => h.allergen))];
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown} 등` : shown;
}

export function resultCard(result: AnalysisResult): ResultCard {
  const style = LEVEL_STYLE[result.level];
  const fine: string[] = [];
  const atTop = (s: Severity) => result.hits.filter((h) => h.level === s);
  let title: string;
  let subtitle: string;

  switch (result.level) {
    case "danger":
      title = "먹지 마세요";
      subtitle = `${josa(joinNames(atTop("danger")), "이", "가")} 들어 있어요`;
      break;
    case "caution": {
      const top = atTop("caution");
      title = "조심하세요";
      subtitle = "부모님께 물어보세요";
      const cross = top.filter((h) => h.crossOnly);
      if (cross.length > 0) fine.push(`${josa(joinNames(cross), "은", "는")} ${CROSS_NOTE}`);
      break;
    }
    case "info":
      title = "약한 반응 성분이 있어요";
      subtitle = `${josa(joinNames(atTop("info")), "이", "가")} 있어요`;
      break;
    case "clear":
      title = "내 알레르기 성분은 못 찾았어요";
      subtitle = "";
      fine.push("성분표가 틀리거나 빠졌을 수 있어요");
      break;
    case "unknown":
    default:
      if (result.unknownReason === "not_label") {
        title = "성분표가 안 보여요";
        subtitle = "성분표 부분을 찍어주세요";
      } else {
        title = "글씨가 잘 안 보여요";
        subtitle = "다시 찍어주세요";
      }
      break;
  }

  if (result.partlyUncertain && result.level !== "unknown") {
    fine.push("일부 글씨가 흐려서 더 있을 수 있어요");
  }
  return { level: result.level, color: style.color, icon: style.icon, title, subtitle, fine };
}

export interface HitLine {
  icon: string;
  /** "유청분말 → 우유" */
  text: string;
  note?: string;
}

export function hitLine(hit: AllergenHit): HitLine {
  const words = [...new Set(hit.matches.map((m) => m.word || m.term))];
  const name = displayName(hit.allergen);
  return {
    icon: LEVEL_STYLE[hit.level === "none" ? "clear" : hit.level].icon,
    // "새우 → 새우"처럼 같은 말이 반복되면 이름만 보여준다
    text: words.every((w) => w === hit.allergen || w === name) ? name : `${words.join(", ")} → ${name}`,
    note: hit.crossOnly ? CROSS_NOTE : undefined,
  };
}
