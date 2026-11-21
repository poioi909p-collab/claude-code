"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SEED_PROFILE,
  analyzeLabel,
  defaultLexicon,
  parseLabelText,
  type AnalysisResult,
  type LabelExtraction,
} from "@/lib/allergy";
import {
  ANALYZE_ERROR_MESSAGE,
  analyzePhoto,
  getFamilyCode,
  setFamilyCode,
  type AnalyzeErrorCode,
} from "@/lib/client/analyzeApi";
import { resizeForUpload } from "@/lib/client/resizeImage";
import { ResultView } from "./ResultView";
import { TextInputForm } from "./TextInputForm";
import { BTN_PRIMARY, BTN_SECONDARY } from "./ui";

type Screen =
  | { kind: "home" }
  | { kind: "text"; text: string }
  | { kind: "analyzing"; photoUrl: string }
  | { kind: "error"; error: AnalyzeErrorCode; photoUrl?: string }
  | {
      kind: "result";
      label: LabelExtraction;
      result: AnalysisResult;
      photoUrl?: string;
      text?: string;
    };

export function HomeScreen() {
  const lexicon = useMemo(() => defaultLexicon(), []);
  // TODO(4단계): IndexedDB에 저장된 프로필로 교체
  const profile = SEED_PROFILE;

  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const lastPhoto = useRef<Blob | null>(null);
  const photoUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const setPhotoUrl = useCallback((blob: Blob | null) => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = blob ? URL.createObjectURL(blob) : null;
    return photoUrlRef.current;
  }, []);

  useEffect(() => () => void setPhotoUrl(null), [setPhotoUrl]);

  const goHome = useCallback(() => {
    abortRef.current?.abort();
    lastPhoto.current = null;
    setPhotoUrl(null);
    setScreen({ kind: "home" });
    window.scrollTo({ top: 0 });
  }, [setPhotoUrl]);

  const runPhoto = useCallback(
    async (photo: Blob) => {
      const photoUrl = photoUrlRef.current ?? setPhotoUrl(photo)!;
      setScreen({ kind: "analyzing", photoUrl });
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await analyzePhoto(photo, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setScreen({ kind: "error", error: res.error, photoUrl });
          return;
        }
        setScreen({
          kind: "result",
          label: res.label,
          result: analyzeLabel(res.label, profile, lexicon),
          photoUrl,
        });
      } catch {
        // 취소됨
      }
    },
    [lexicon, profile, setPhotoUrl],
  );

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // 같은 사진을 다시 골라도 동작하게
      if (!file) return;
      let photo: Blob;
      try {
        photo = await resizeForUpload(file);
      } catch {
        setScreen({ kind: "error", error: "bad_request" });
        return;
      }
      lastPhoto.current = photo;
      setPhotoUrl(photo);
      void runPhoto(photo);
    },
    [runPhoto, setPhotoUrl],
  );

  const checkText = useCallback(
    (text: string) => {
      const label = parseLabelText(text);
      setPhotoUrl(null);
      setScreen({ kind: "result", label, result: analyzeLabel(label, profile, lexicon), text });
    },
    [lexicon, profile, setPhotoUrl],
  );

  const openCamera = () => cameraRef.current?.click();
  const openGallery = () => galleryRef.current?.click();

  const retakeButton = (
    <button type="button" onClick={openCamera} className={BTN_PRIMARY}>
      📷 다시 찍기
    </button>
  );
  const homeButton = (
    <button type="button" onClick={goHome} className={BTN_SECONDARY}>
      🏠 처음으로
    </button>
  );

  return (
    <>
      {/* 앱 설치 없이 카메라를 여는 입력 (SPEC 3-1). 항상 붙어 있어야 '다시 찍기'에서도 쓸 수 있다. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
        data-testid="camera-input"
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
        data-testid="gallery-input"
      />

      {screen.kind === "home" && (
        <div className="flex flex-col gap-4">
          {!profile.confirmedByParent && (
            <p
              role="note"
              className="rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-lg font-bold text-amber-950 dark:bg-amber-950/60 dark:text-amber-100"
            >
              👪 부모님 확인 필요 — 알레르기 정보를 아직 부모님이 확인하지 않았어요
            </p>
          )}
          <h1 className="text-3xl font-black">안녕! 오늘 뭐 먹어?</h1>
          <button
            type="button"
            onClick={openCamera}
            className="flex min-h-[45dvh] flex-col items-center justify-center gap-4 rounded-3xl bg-blue-700 px-6 text-white shadow-sm active:scale-[0.98]"
          >
            <span aria-hidden className="text-8xl leading-none">
              📷
            </span>
            <span className="text-4xl font-black">성분표 찍기</span>
          </button>
          <button type="button" onClick={openGallery} className={BTN_SECONDARY}>
            🖼 사진 불러오기
          </button>
          <button
            type="button"
            onClick={() => setScreen({ kind: "text", text: "" })}
            className={BTN_SECONDARY}
          >
            ✏️ 글자로 입력하기
          </button>
        </div>
      )}

      {screen.kind === "text" && (
        <div className="flex flex-col gap-5">
          <TextInputForm initialText={screen.text} onSubmit={checkText} />
          {homeButton}
        </div>
      )}

      {screen.kind === "analyzing" && (
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-6 pt-10 text-center">
          <span aria-hidden className="animate-pulse text-8xl leading-none">
            🔍
          </span>
          <p className="text-3xl font-black">성분표 읽는 중…</p>
          <p className="text-lg text-gray-600 dark:text-gray-400">10초쯤 걸려요</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- 메모리 속 사진(blob URL) */}
          <img
            src={screen.photoUrl}
            alt="찍은 성분표 사진"
            className="max-h-60 w-auto rounded-2xl border border-gray-300 dark:border-gray-700"
          />
          <button type="button" onClick={goHome} className={BTN_SECONDARY}>
            취소
          </button>
        </div>
      )}

      {screen.kind === "error" && (
        <ErrorView
          error={screen.error}
          photoUrl={screen.photoUrl}
          onRetryWithCode={() => lastPhoto.current && void runPhoto(lastPhoto.current)}
          actions={
            <>
              {retakeButton}
              <button
                type="button"
                onClick={() => setScreen({ kind: "text", text: "" })}
                className={BTN_SECONDARY}
              >
                ✏️ 글자로 입력하기
              </button>
              {homeButton}
            </>
          }
        />
      )}

      {screen.kind === "result" && (
        <ResultView
          result={screen.result}
          label={screen.label}
          photoUrl={screen.photoUrl}
          actions={
            screen.photoUrl ? (
              <>
                {retakeButton}
                {homeButton}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setScreen({ kind: "text", text: screen.text ?? "" })}
                  className={BTN_PRIMARY}
                >
                  ✏️ 다시 입력하기
                </button>
                {homeButton}
              </>
            )
          }
        />
      )}
    </>
  );
}

function ErrorView({
  error,
  photoUrl,
  actions,
  onRetryWithCode,
}: {
  error: AnalyzeErrorCode;
  photoUrl?: string;
  actions: React.ReactNode;
  onRetryWithCode: () => void;
}) {
  const [code, setCode] = useState(() => (error === "access_code" ? getFamilyCode() : ""));
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [error]);

  return (
    <div className="flex flex-col gap-5">
      <section role="status" aria-live="polite" className="rounded-3xl bg-gray-600 px-6 py-8 text-white">
        <div aria-hidden className="text-7xl leading-none">
          ❓
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-3xl font-black leading-tight outline-none">
          {ANALYZE_ERROR_MESSAGE[error]}
        </h1>
      </section>

      {error === "access_code" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!code.trim()) return;
            setFamilyCode(code.trim());
            onRetryWithCode();
          }}
        >
          <label htmlFor="family-code" className="text-lg font-bold">
            가족 코드 (부모님께 물어보세요)
          </label>
          <input
            id="family-code"
            type="password"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="min-h-14 rounded-2xl border-2 border-gray-300 bg-white px-4 text-xl dark:border-gray-700 dark:bg-gray-900"
          />
          <button type="submit" disabled={!code.trim()} className={BTN_PRIMARY}>
            저장하고 다시 하기
          </button>
        </form>
      )}

      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- 메모리 속 사진(blob URL)
        <img
          src={photoUrl}
          alt="찍은 성분표 사진"
          className="max-h-72 w-auto self-center rounded-2xl border border-gray-300 dark:border-gray-700"
        />
      )}

      <div className="flex flex-col gap-3">{actions}</div>
    </div>
  );
}
