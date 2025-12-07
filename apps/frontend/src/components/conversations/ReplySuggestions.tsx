import type { ReplySuggestion } from "@/lib/api/conversations";

type ReplySuggestionsProps = {
  suggestions: ReplySuggestion[];
  showPinyin?: boolean;
  layout?: "row" | "column";
  heading?: string;
};

export function ReplySuggestions({
  suggestions,
  showPinyin = true,
  layout = "column",
  heading = "Suggested replies",
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

  const isRow = layout === "row";

  return (
    <div className="mt-4" aria-label="Suggested replies">
      <div className="text-xs font-semibold text-[#9aa6ff] mb-2 uppercase tracking-wide">
        {heading}
      </div>
      <div
        className={
          isRow
            ? "grid grid-cols-1 sm:grid-cols-2 gap-2"
            : "flex flex-col gap-2"
        }
      >
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
    </div>
  );
}
