"use client";

import React from "react";

type NoteSegment = {
  text: string;
  isWord?: boolean;
  pinyin?: string;
  definition?: string;
  definitions?: string[];
};

type GrammarNote = {
  point: string;
  pointPinyin?: string;
  pointEn?: string;
  brief: string;
  briefPinyin?: string;
  briefEn?: string;
  pointSegments?: NoteSegment[];
  briefSegments?: NoteSegment[];
  examples?: Array<{
    zh: string;
    en?: string;
    pinyin?: string;
    segments?: NoteSegment[];
  }>;
};

export function NotesSection({
  title = "Notes",
  notes,
  notesPinyinOn,
  onTogglePinyin,
  renderSegments,
  sectionKey,
}: {
  title?: string;
  notes: GrammarNote[];
  notesPinyinOn: boolean;
  onTogglePinyin: () => void;
  renderSegments: (
    segments: NoteSegment[],
    zh: string,
    en: string | undefined,
    showPinyin: boolean,
    ctx: { section: "dialogue" | "story"; noteIndex: number; field: string }
  ) => React.ReactNode;
  sectionKey: "dialogue" | "story";
}) {
  if (!Array.isArray(notes) || notes.length === 0) return null;

  return (
    <div className="mt-4 border border-[#3a3a3a] rounded-lg p-3 bg-[#1e2229]">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-white">{title}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePinyin}
            className={`px-2 py-1 text-xs rounded border ${
              notesPinyinOn
                ? "border-[#4040f2] text-[#9aa6ff]"
                : "border-[#404040] text-[#a6a6a6]"
            } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-[#1e2229]`}
            type="button"
            aria-pressed={notesPinyinOn}
            aria-label={
              notesPinyinOn ? "Hide notes pinyin" : "Show notes pinyin"
            }
          >
            Pinyin {notesPinyinOn ? "On" : "Off"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {notes.slice(0, 3).map((gn, gi) => (
          <div
            key={gi}
            className="text-[16px] text-[#c9d1d9] border border-[#2a2e36] bg-[#1a1f27] rounded-lg p-2 space-y-2"
          >
            {/* Point */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                  Point
                </span>
              </div>
              <div>
                {Array.isArray(gn.pointSegments) &&
                gn.pointSegments.length > 0 ? (
                  renderSegments(
                    gn.pointSegments,
                    gn.point,
                    gn.pointEn,
                    notesPinyinOn,
                    {
                      section: sectionKey,
                      noteIndex: gi,
                      field: "point",
                    }
                  )
                ) : (
                  <>
                    <div className="text-white">{gn.point}</div>
                    {notesPinyinOn && gn.pointPinyin ? (
                      <div className="text-[#9aa6ff]">{gn.pointPinyin}</div>
                    ) : null}
                  </>
                )}
              </div>
              {gn.pointEn ? (
                <div className="text-[14px] text-[#8b949e]">{gn.pointEn}</div>
              ) : null}
            </div>

            {/* Brief */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-wide text-[#8a8f99] bg-[#2a2e36] px-2 py-[1px] rounded">
                  Brief
                </span>
              </div>
              <div>
                {Array.isArray(gn.briefSegments) &&
                gn.briefSegments.length > 0 ? (
                  renderSegments(
                    gn.briefSegments,
                    gn.brief,
                    gn.briefEn,
                    notesPinyinOn,
                    {
                      section: sectionKey,
                      noteIndex: gi,
                      field: "brief",
                    }
                  )
                ) : (
                  <>
                    <div className="text-white">{gn.brief}</div>
                    {notesPinyinOn && gn.briefPinyin ? (
                      <div className="text-[#9aa6ff]">{gn.briefPinyin}</div>
                    ) : null}
                  </>
                )}
              </div>
              {gn.briefEn ? (
                <div className="text-[14px] text-[#8b949e]">{gn.briefEn}</div>
              ) : null}
            </div>

            {/* Examples */}
            {Array.isArray(gn.examples) && gn.examples.length > 0 ? (
              <div className="space-y-2">
                {gn.examples.map((ex, ei) => (
                  <div key={ei} className="border-l border-[#2a2e36] pl-2">
                    {Array.isArray(ex.segments) && ex.segments.length > 0 ? (
                      <>
                        {renderSegments(
                          ex.segments,
                          ex.zh,
                          ex.en,
                          notesPinyinOn,
                          {
                            section: sectionKey,
                            noteIndex: gi,
                            field: `example-${ei}`,
                          }
                        )}
                        {ex.en ? (
                          <div className="text-[#8b949e] text-xs">{ex.en}</div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="text-white">{ex.zh}</div>
                        {notesPinyinOn && ex.pinyin ? (
                          <div className="text-[#9aa6ff] text-[14px]">
                            {ex.pinyin}
                          </div>
                        ) : null}
                        {ex.en ? (
                          <div className="text-[#8b949e] text-xs">{ex.en}</div>
                        ) : null}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
