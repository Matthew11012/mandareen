"use client";

import {
  useEffect,
  useMemo,
  useState,
  useRef,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/layout";
import { lessonsApi, type LessonDetail } from "@/lib/api/lessons";
import { Eye, EyeOff, RefreshCw, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LessonViewerPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params?.id);
  const [data, setData] = useState<LessonDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showPinyin, setShowPinyin] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [chunkPinyinOn, setChunkPinyinOn] = useState<Record<number, boolean>>(
    {}
  );
  const [chunkTransOn, setChunkTransOn] = useState<Record<number, boolean>>({});
  const [turnPinyinOn, setTurnPinyinOn] = useState<Record<number, boolean>>({});
  const [turnTransOn, setTurnTransOn] = useState<Record<number, boolean>>({});

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await lessonsApi.getById(id);
      setData(detail);
    } catch {
      setError("Failed to load lesson");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const storySection = useMemo(
    () => data?.sections.find((s) => s.sectionType === "story"),
    [data]
  );
  type LessonToken = {
    text: string;
    isWord?: boolean;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
  };
  const story = storySection?.content as
    | {
        title?: string | null;
        titlePinyin?: string | null;
        titleTranslation?: string | null;
        hanzi: string;
        pinyin?: string;
        translation?: string;
        segments?: LessonToken[];
      }
    | undefined;

  const dialogueSection = useMemo(
    () => data?.sections.find((s) => s.sectionType === "dialogue"),
    [data]
  );
  const dialogue = dialogueSection?.content as
    | {
        title?: string | null;
        titlePinyin?: string | null;
        titleTranslation?: string | null;
        turns?: Array<{
          speaker: string;
          hanzi: string;
          pinyin?: string;
          translation?: string;
          segments?: LessonToken[];
        }>;
      }
    | undefined;

  // Popup for token details
  const [popup, setPopup] = useState<{
    open: boolean;
    x: number;
    y: number;
    word: string;
    pinyin?: string;
    definition?: string;
    definitions?: string[];
  }>({ open: false, x: 0, y: 0, word: "" });
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopup((p) => ({ ...p, open: false }));
      }
    };
    if (popup.open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [popup.open]);

  const isChunkPinyinOn = (idx: number) => showPinyin || !!chunkPinyinOn[idx];
  const isChunkTransOn = (idx: number) =>
    showTranslation || !!chunkTransOn[idx];
  const isTurnPinyinOn = (idx: number) => showPinyin || !!turnPinyinOn[idx];
  const isTurnTransOn = (idx: number) => showTranslation || !!turnTransOn[idx];

  const storyParagraphs = useMemo(
    () =>
      (story?.hanzi || "")
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [story?.hanzi]
  );
  const translationParagraphs = useMemo(
    () =>
      (story?.translation || "")
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [story?.translation]
  );

  const segmentedParagraphs: LessonToken[][] = useMemo(() => {
    if (!story || !Array.isArray(story.segments) || story.segments.length === 0)
      return [];
    const result: LessonToken[][] = [];
    let cursor = 0;
    for (const para of storyParagraphs) {
      const paraEnd = cursor + para.length;
      const bucket: LessonToken[] = [];
      // inline compute segment cumulative indices
      let idxAcc = 0;
      for (const seg of story.segments) {
        const start = idxAcc;
        const end = start + seg.text.length;
        if (start >= cursor && end <= paraEnd) {
          bucket.push(seg);
        }
        idxAcc = end;
      }
      result.push(bucket);
      cursor = paraEnd + 2; // account for double newline
    }
    return result;
  }, [story, storyParagraphs]);

  if (!id) return null;

  return (
    <DashboardLayout
      title={data?.title || `Lesson #${id}`}
      subtitle={`HSK ${data?.level ?? ""}`}
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between sticky top-0 z-20 -mx-6 px-6 py-2 bg-[#222831]/80 backdrop-blur border-b border-[#30333a]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/lessons")}
              className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] transition-colors duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[#a6a6a6]">
                <ArrowLeft className="w-4 h-4" />
                <span className="font-inter text-sm">Exit</span>
              </div>
            </button>
            <button
              onClick={() => setShowPinyin((v) => !v)}
              className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] transition-colors duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[#a6a6a6]">
                {showPinyin ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                <span className="font-inter text-sm">Pinyin (All)</span>
              </div>
            </button>
            <button
              onClick={() => setShowTranslation((v) => !v)}
              className="px-3 py-2 bg-[#2e323a] border border-[#404040] rounded-lg hover:border-[#4040f2] transition-colors duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[#a6a6a6]">
                {showTranslation ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                <span className="font-inter text-sm">Translation (All)</span>
              </div>
            </button>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 hover:bg-[#404040] rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RefreshCw
              className={`w-4 h-4 text-[#a6a6a6] ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {(story?.titlePinyin ||
          story?.titleTranslation ||
          dialogue?.titlePinyin ||
          dialogue?.titleTranslation ||
          data?.title) && (
          <div className="bg-[#2e323a] rounded-lg p-4 border border-[#404040]">
            {data?.title ? (
              <div className="text-white font-inter text-base mb-1">
                {data.title}
              </div>
            ) : null}
            {story?.titlePinyin || dialogue?.titlePinyin ? (
              <div className="text-[#9aa6ff] font-inter text-sm mb-1">
                {story?.titlePinyin || dialogue?.titlePinyin}
              </div>
            ) : null}
            {story?.titleTranslation || dialogue?.titleTranslation ? (
              <div className="text-[#a6a6a6] font-inter text-sm">
                {story?.titleTranslation || dialogue?.titleTranslation}
              </div>
            ) : null}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-[#a6a6a6]">
            <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span className="font-inter text-sm">Loading...</span>
          </div>
        ) : error ? (
          <p className="text-red-400 font-inter text-sm">{error}</p>
        ) : !data ? (
          <p className="text-[#a6a6a6] font-inter text-sm">No content</p>
        ) : (
          <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
            {story && (
              <div className="space-y-6">
                {segmentedParagraphs.map((segChunk, ci) => (
                  <div key={ci} className="space-y-2">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() =>
                          setChunkPinyinOn((s) => ({ ...s, [ci]: !s[ci] }))
                        }
                        className={`px-2 py-1 text-xs rounded border ${isChunkPinyinOn(ci) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer`}
                      >
                        Pinyin {isChunkPinyinOn(ci) ? "On" : "Off"}
                      </button>
                      <button
                        onClick={() =>
                          setChunkTransOn((s) => ({ ...s, [ci]: !s[ci] }))
                        }
                        className={`px-2 py-1 text-xs rounded border ${isChunkTransOn(ci) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer`}
                      >
                        Translation {isChunkTransOn(ci) ? "On" : "Off"}
                      </button>
                    </div>
                    <div className="leading-8 text-white font-inter text-[18px]">
                      {segChunk.map((seg: LessonToken, idx) => {
                        const isWord = Boolean(seg.isWord);
                        return (
                          <span
                            key={`${ci}-${idx}`}
                            className={`inline-flex ${isWord ? "flex-col items-center align-top" : "items-center"} mr-[2px]`}
                          >
                            {isChunkPinyinOn(ci) ? (
                              isWord && seg.pinyin ? (
                                <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                                  {seg.pinyin}
                                </span>
                              ) : (
                                <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                                  •
                                </span>
                              )
                            ) : null}
                            <span
                              className={`px-[1px] rounded ${isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                              title={seg.definition || ""}
                              onClick={(
                                e: ReactMouseEvent<HTMLSpanElement>
                              ) => {
                                if (!isWord) return;
                                setPopup({
                                  open: true,
                                  x: e.clientX,
                                  y: e.clientY,
                                  word: seg.text,
                                  pinyin: seg.pinyin,
                                  definition: seg.definition,
                                  definitions: seg.definitions,
                                });
                              }}
                            >
                              {seg.text}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                    {isChunkTransOn(ci) && translationParagraphs[ci] && (
                      <div className="text-[#a6a6a6] font-inter text-[15px] border-l border-[#404040] pl-3">
                        {translationParagraphs[ci]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {dialogue && Array.isArray(dialogue.turns) && (
              <div className="space-y-4 mt-6">
                {dialogue.turns.map((turn, ti) => (
                  <div
                    key={ti}
                    className="bg-[#262a31] rounded-lg p-3 border border-[#3a3a3a]"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[#9aa6ff] font-inter text-sm">
                        {turn.speaker}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setTurnPinyinOn((s) => ({ ...s, [ti]: !s[ti] }))
                          }
                          className={`px-2 py-1 text-xs rounded border ${isTurnPinyinOn(ti) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer`}
                        >
                          Pinyin {isTurnPinyinOn(ti) ? "On" : "Off"}
                        </button>
                        <button
                          onClick={() =>
                            setTurnTransOn((s) => ({ ...s, [ti]: !s[ti] }))
                          }
                          className={`px-2 py-1 text-xs rounded border ${isTurnTransOn(ti) ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer`}
                        >
                          Translation {isTurnTransOn(ti) ? "On" : "Off"}
                        </button>
                      </div>
                    </div>
                    <div className="leading-8 text-white font-inter text-[18px]">
                      {(turn.segments ?? []).map((seg: LessonToken, idx) => {
                        const isWord = Boolean(seg.isWord);
                        return (
                          <span
                            key={`${ti}-${idx}`}
                            className={`inline-flex ${isWord ? "flex-col items-center align-top" : "items-center"} mr-[2px]`}
                          >
                            {isTurnPinyinOn(ti) ? (
                              isWord && seg.pinyin ? (
                                <span className="text-xs text-[#9aa6ff] leading-none mb-[2px]">
                                  {seg.pinyin}
                                </span>
                              ) : (
                                <span className="text-xs opacity-0 leading-none mb-[2px] select-none">
                                  •
                                </span>
                              )
                            ) : null}
                            <span
                              className={`px-[1px] rounded ${isWord ? "hover:bg-[#404040] cursor-pointer" : ""}`}
                              title={seg.definition || ""}
                              onClick={(
                                e: ReactMouseEvent<HTMLSpanElement>
                              ) => {
                                if (!isWord) return;
                                setPopup({
                                  open: true,
                                  x: e.clientX,
                                  y: e.clientY,
                                  word: seg.text,
                                  pinyin: seg.pinyin,
                                  definition: seg.definition,
                                  definitions: seg.definitions,
                                });
                              }}
                            >
                              {seg.text}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                    {isTurnTransOn(ti) && turn.translation && (
                      <div className="text-[#a6a6a6] font-inter text-[15px] border-l border-[#404040] pl-3 mt-2">
                        {turn.translation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {popup.open && (
              <div
                ref={popupRef}
                style={{
                  position: "fixed",
                  left: Math.max(
                    10,
                    Math.min(popup.x - 110, window.innerWidth - 260)
                  ),
                  top: Math.max(10, popup.y - 130),
                  zIndex: 1000,
                }}
                className="bg-[#2e323a] border border-[#404040] rounded-xl shadow-2xl p-4 w-64"
              >
                <div className="font-bold text-white text-lg truncate">
                  {popup.word}
                </div>
                {popup.pinyin && (
                  <div className="text-[#4040f2] text-sm font-medium truncate">
                    {popup.pinyin}
                  </div>
                )}
                {popup.definition && (
                  <div className="text-xs text-[#a6a6a6] mt-2">
                    {popup.definition}
                  </div>
                )}
                {Array.isArray(popup.definitions) &&
                  popup.definitions.length > 0 && (
                    <div className="text-xs text-[#a6a6a6] mt-2 space-y-1">
                      {popup.definitions.map((d, i) => (
                        <div key={i}>• {d}</div>
                      ))}
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
