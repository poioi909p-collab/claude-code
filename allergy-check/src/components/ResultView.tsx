"use client";

import { useEffect, useRef } from "react";
import {
  DISCLAIMER,
  LEVEL_STYLE,
  displayName,
  hitLine,
  labelSections,
  resultCard,
  type AnalysisResult,
  type LabelExtraction,
} from "@/lib/allergy";
import { BADGE, CARD_CLASS, MARK_CLASS, ROW_CLASS } from "./levelStyles";

interface Props {
  result: AnalysisResult;
  label: LabelExtraction;
  /** 다시 찍기 / 다시 입력 */
  onRetry: () => void;
  retryLabel: string;
  sourceLabel: string;
}

export function ResultView({ result, label, onRetry, retryLabel, sourceLabel }: Props) {
  const card = resultCard(result);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [result]);

  const sections = labelSections(label, result);

  return (
    <div className="flex flex-col gap-5">
      {/* 큰 신호등 카드 */}
      <section
        role="status"
        aria-live="polite"
        data-level={result.level}
        className={`rounded-3xl px-6 py-8 shadow-sm ${CARD_CLASS[result.level]}`}
      >
        <div aria-hidden className="text-7xl leading-none">
          {card.icon}
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-4 text-4xl font-black leading-tight outline-none"
        >
          <span className="sr-only">{LEVEL_STYLE[result.level].label}: </span>
          {card.title}
        </h1>
        {card.subtitle && <p className="mt-2 text-2xl font-bold">{card.subtitle}</p>}
        {card.fine.map((f) => (
          <p key={f} className="mt-3 text-base opacity-90">
            {f}
          </p>
        ))}
      </section>

      {/* 걸린 성분 목록 */}
      {result.hits.length > 0 && (
        <section aria-labelledby="hits-title">
          <h2 id="hits-title" className="sr-only">
            찾은 성분
          </h2>
          <ul className="flex flex-col gap-3">
            {result.hits.map((hit) => {
              const line = hitLine(hit);
              const badge = BADGE[hit.level];
              return (
                <li
                  key={hit.allergen}
                  className={`flex items-start gap-3 rounded-2xl border-l-8 px-4 py-3 ${ROW_CLASS[hit.level]}`}
                >
                  <span aria-hidden className="text-3xl leading-none">
                    {line.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-bold">{line.text}</p>
                    {line.note && <p className="mt-1 text-base">🏭 {line.note}</p>}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-base font-bold ${badge.className}`}
                  >
                    {badge.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {result.otherDetected.length > 0 && (
        <p className="text-base text-gray-600 dark:text-gray-400">
          내 알레르기가 아닌 성분: {result.otherDetected.map(displayName).join(", ")}
        </p>
      )}

      {/* 성분표 원문 (하이라이트) */}
      {sections.length > 0 && (
        <details className="group rounded-2xl border border-gray-300 dark:border-gray-700">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 text-lg font-bold">
            {sourceLabel}
            <span aria-hidden className="text-base transition-transform group-open:rotate-180">
              ▼
            </span>
          </summary>
          <div className="flex flex-col gap-4 px-5 pb-5">
            {sections.map((s) => (
              <div key={s.source}>
                <h3 className="text-base font-bold text-gray-600 dark:text-gray-400">{s.title}</h3>
                <p className="mt-1 text-lg leading-relaxed">
                  {s.items.map((item, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      {item.segments.map((seg, j) =>
                        seg.level && seg.level !== "none" ? (
                          <mark
                            key={j}
                            className={`rounded px-0.5 font-bold underline decoration-2 underline-offset-4 ${MARK_CLASS[seg.level]}`}
                          >
                            {seg.text}
                          </mark>
                        ) : (
                          <span key={j}>{seg.text}</span>
                        ),
                      )}
                    </span>
                  ))}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      <button
        type="button"
        onClick={onRetry}
        className="min-h-14 rounded-2xl bg-gray-900 px-6 text-xl font-bold text-white active:scale-[0.98] dark:bg-gray-100 dark:text-gray-950"
      >
        {retryLabel}
      </button>

      <p className="border-t border-gray-200 pt-4 text-base text-gray-600 dark:border-gray-800 dark:text-gray-400">
        {DISCLAIMER}
      </p>
    </div>
  );
}
