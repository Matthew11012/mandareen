import type { ReplySuggestion } from "@/lib/api/conversations";

type ReplySuggestionsProps = {
  suggestions: ReplySuggestion[];
  showPinyin: boolean;
};

export function ReplySuggestions({
  suggestions,
  showPinyin,
}: ReplySuggestionsProps) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return null;

  const renderPinyin = (s: ReplySuggestion) => {
    if (!showPinyin) return null;
    const fromSegments =
      Array.isArray(s.segments) && s.segments.length > 0
        ? s.segments
            .map((seg) => (seg.pinyin || "").trim())
            .filter(Boolean)
            .join(" ")
        : "";
    if (!fromSegments) return null;
    return (
      <div className="text-xs text-[#9aa6ff] leading-tight mb-1">
        {fromSegments}
      </div>
    );
  };

  return (
    <div className="mt-3 flex flex-col gap-2" aria-label="Suggested replies">
      {suggestions.map((s, idx) => (
        <div
          key={`${s.zh}-${idx}`}
          className="rounded-lg border border-[#404040] bg-[#1f2430] px-3 py-2 shadow-sm"
        >
          {renderPinyin(s)}
          <div className="text-base text-white leading-snug">{s.zh}</div>
          {s.translation ? (
            <div className="text-xs text-[#a6a6a6] leading-tight mt-1">
              {s.translation}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}