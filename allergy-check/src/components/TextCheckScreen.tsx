"use client";

import { useMemo, useState } from "react";
import {
  SEED_PROFILE,
  analyzeLabel,
  defaultLexicon,
  parseLabelText,
  type AnalysisResult,
  type LabelExtraction,
} from "@/lib/allergy";
import { ResultView } from "./ResultView";

/** 2단계: 카메라 없이 성분표 글자를 붙여넣어 결과 화면을 검증한다. */
const EXAMPLES: { name: string; text: string }[] = [
  {
    name: "라면",
    text: [
      "원재료명: 소맥분(밀:미국산, 호주산), 팜유, 감자전분, 정제염, 효모추출물, 양념분말(대두, 밀, 새우), 마늘",
      "대두, 밀, 새우, 쇠고기 함유",
      "이 제품은 땅콩, 메밀, 계란을 사용한 제품과 같은 제조시설에서 제조하고 있습니다.",
    ].join("\n"),
  },
  {
    name: "과자",
    text: [
      "원재료명: 설탕, 정백당, 탈지분유, 유청분말(우유), 식물성유지, 코코아버터, 정제소금",
      "우유 함유",
      "이 제품은 굴을 사용한 제품과 같은 제조시설에서 제조하고 있습니다.",
    ].join("\n"),
  },
  {
    name: "음료",
    text: "원재료명: 정제수, 설탕, 구연산, 비타민C, 천연향료",
  },
];

export function TextCheckScreen() {
  const lexicon = useMemo(() => defaultLexicon(), []);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<{ label: LabelExtraction; result: AnalysisResult } | null>(
    null,
  );

  // TODO(4단계): IndexedDB에 저장된 프로필로 교체
  const profile = SEED_PROFILE;

  function check() {
    const label = parseLabelText(text);
    setChecked({ label, result: analyzeLabel(label, profile, lexicon) });
  }

  if (checked) {
    return (
      <ResultView
        result={checked.result}
        label={checked.label}
        onRetry={() => setChecked(null)}
        retryLabel="✏️ 다시 입력하기"
        sourceLabel="입력한 성분표 보기"
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {!profile.confirmedByParent && (
        <p
          role="note"
          className="rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-lg font-bold text-amber-950 dark:bg-amber-950/60 dark:text-amber-100"
        >
          👪 부모님 확인 필요 — 알레르기 정보를 아직 부모님이 확인하지 않았어요
        </p>
      )}

      <h1 className="text-3xl font-black">안녕! 오늘 뭐 먹어?</h1>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <label htmlFor="label-text" className="text-xl font-bold">
          ✏️ 성분표 글자 입력
        </label>
        <textarea
          id="label-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"원재료명: 밀가루, 설탕, 새우분말…\n○○ 함유\n같은 제조시설에서 ○○ 사용…"}
          className="w-full rounded-2xl border-2 border-gray-300 bg-white p-4 text-lg leading-relaxed placeholder:text-gray-500 focus:border-blue-600 focus:outline-none dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="min-h-20 rounded-3xl bg-blue-700 px-6 text-3xl font-black text-white shadow-sm active:scale-[0.98] disabled:bg-gray-400 dark:disabled:bg-gray-700"
        >
          🔍 확인하기
        </button>
      </form>

      <div>
        <p className="text-base text-gray-600 dark:text-gray-400">예시로 해보기</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.name}
              type="button"
              onClick={() => setText(ex.text)}
              className="min-h-14 rounded-2xl border-2 border-gray-300 px-5 text-lg font-bold dark:border-gray-700"
            >
              {ex.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
