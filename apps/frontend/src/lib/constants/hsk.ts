export const getHSKPillClasses = (level?: number | null): string => {
  const map: Record<number, string> = {
    1: "bg-green-500/20 text-green-300 border border-green-500/30",
    2: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    3: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    4: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30",
    5: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
    6: "bg-pink-500/20 text-pink-300 border border-pink-500/30",
    7: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
  };
  if (!level || !map[level])
    return "bg-[#3a3a3a] text-[#d0d0d0] border border-[#4a4a4a]";
  return map[level];
};
