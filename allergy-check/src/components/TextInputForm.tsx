"use client";

import { useState } from "react";

/** 카메라 대신 성분표 글자를 붙여넣는 입력 (폰의 '사진 속 글자 복사' 기능과 함께 쓰기 좋음) */
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

interface Props {
  initialText?: string;
  onSubmit: (text: string) => void;
}

export function TextInputForm({ initialText = "", onSubmit }: Props) {
  const [text, setText] = useState(initialText);

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSubmit(text);
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
