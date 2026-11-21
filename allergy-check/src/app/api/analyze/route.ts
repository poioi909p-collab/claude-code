import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
import {
  DEFAULT_MODEL,
  ExtractError,
  extractLabelFromImage,
  type ImageMediaType,
} from "@/lib/server/extractLabel";
import type { AnalyzeResponse } from "@/lib/client/analyzeApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 클라이언트가 긴 변 1600px JPEG로 줄여 보내므로 보통 1MB 미만. Vercel 본문 한도(4.5MB)보다 작게. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set<ImageMediaType>(["image/jpeg", "image/png", "image/webp"]);

function reply(body: AnalyzeResponse, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function sameCode(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<Response> {
  // 배포 주소가 알려져도 남이 API 크레딧을 쓰지 못하게, 가족 코드를 설정했으면 확인한다.
  const familyCode = process.env.FAMILY_ACCESS_CODE;
  if (familyCode && !sameCode(req.headers.get("x-family-code") ?? "", familyCode)) {
    return reply({ ok: false, error: "access_code" }, 401);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return reply({ ok: false, error: "not_configured" }, 503);
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) return reply({ ok: false, error: "too_large" }, 413);

  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get("image");
    file = value instanceof File ? value : null;
  } catch {
    file = null;
  }
  if (!file) return reply({ ok: false, error: "bad_request" }, 400);
  if (!ALLOWED_TYPES.has(file.type as ImageMediaType)) {
    return reply({ ok: false, error: "bad_request" }, 400);
  }
  if (file.size > MAX_IMAGE_BYTES) return reply({ ok: false, error: "too_large" }, 413);

  // 사진은 이 요청 안에서만 메모리로 다루고 저장하지 않는다.
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    const label = await extractLabelFromImage(base64, file.type as ImageMediaType, {
      model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    });
    return reply({ ok: true, label });
  } catch (err) {
    if (err instanceof ExtractError) return reply({ ok: false, error: "unreadable" });
    // 로그에는 오류 종류만 남긴다(사진·응답 내용은 남기지 않음).
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("[analyze] auth error", err.status);
      return reply({ ok: false, error: "not_configured" }, 503);
    }
    if (err instanceof Anthropic.RateLimitError) {
      return reply({ ok: false, error: "busy" }, 429);
    }
    if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError) {
      console.error("[analyze] upstream error", err.constructor.name);
      return reply({ ok: false, error: "upstream" }, 502);
    }
    if (err instanceof Anthropic.APIError) {
      console.error("[analyze] api error", err.status);
      return reply({ ok: false, error: "upstream" }, 502);
    }
    console.error("[analyze] unexpected error", err instanceof Error ? err.name : typeof err);
    return reply({ ok: false, error: "server" }, 500);
  }
}
