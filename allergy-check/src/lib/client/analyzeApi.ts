import { LabelExtractionSchema } from "@/lib/allergy/labelSchema";
import type { LabelExtraction } from "@/lib/allergy/types";

export type AnalyzeErrorCode =
  | "access_code" // 가족 코드가 없거나 틀림
  | "not_configured" // 서버에 API 키가 없음/잘못됨
  | "too_large"
  | "bad_request"
  | "unreadable" // 분석은 됐지만 결과를 쓸 수 없음 → 회색
  | "busy"
  | "upstream"
  | "server"
  | "network"; // 서버에 닿지 못함(오프라인 등)

export type AnalyzeResponse =
  | { ok: true; label: LabelExtraction }
  | { ok: false; error: AnalyzeErrorCode };

/** 아이 화면용 안내 문구 */
export const ANALYZE_ERROR_MESSAGE: Record<AnalyzeErrorCode, string> = {
  access_code: "가족 코드를 넣어주세요",
  not_configured: "사진 분석이 아직 준비 안 됐어요. 글자로 입력해 주세요",
  too_large: "사진이 너무 커요. 다시 찍어주세요",
  bad_request: "사진을 열 수 없어요. 다시 찍어주세요",
  unreadable: "글씨가 잘 안 보여요. 다시 찍어주세요",
  busy: "지금 사람이 많아요. 조금 있다가 다시 해주세요",
  upstream: "사진을 읽지 못했어요. 다시 해주세요",
  server: "문제가 생겼어요. 다시 해주세요",
  network: "인터넷 연결을 확인해 주세요",
};

const FAMILY_CODE_KEY = "allergy-check:family-code";

export function getFamilyCode(): string {
  try {
    return localStorage.getItem(FAMILY_CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setFamilyCode(code: string): void {
  try {
    localStorage.setItem(FAMILY_CODE_KEY, code);
  } catch {
    // 저장이 막혀 있어도 이번 요청에는 쓸 수 있다
  }
}

/** 사진(이미 줄인 JPEG)을 서버로 보내 성분표 글자를 받는다. 프로필은 보내지 않는다. */
export async function analyzePhoto(
  image: Blob,
  {
    familyCode = getFamilyCode(),
    fetchImpl = fetch,
    signal,
  }: { familyCode?: string; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("image", image, "label.jpg");
  let res: Response;
  try {
    res = await fetchImpl("/api/analyze", {
      method: "POST",
      body: form,
      headers: familyCode ? { "x-family-code": familyCode } : {},
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ok: false, error: "network" };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: "server" };
  }
  if (body && typeof body === "object" && "ok" in body) {
    if (body.ok === true && "label" in body) {
      const parsed = LabelExtractionSchema.safeParse(body.label);
      return parsed.success ? { ok: true, label: parsed.data } : { ok: false, error: "unreadable" };
    }
    if (body.ok === false && "error" in body && typeof body.error === "string") {
      const code = body.error as AnalyzeErrorCode;
      if (code in ANALYZE_ERROR_MESSAGE) return { ok: false, error: code };
    }
  }
  return { ok: false, error: "server" };
}
