"use client";
import { useEffect, useMemo, useState } from "react";
import { lessonsApi, type LessonListItem } from "@/lib/api/lessons";
import { DashboardLayout } from "@/components/layout";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";

type ByLevel = Record<number, number>;

const HSK_LEVELS = [1, 2, 3, 4, 5, 6, 7];

export default function ProgressPage() {
  const [byLevel, setByLevel] = useState<ByLevel>({});
  const [totalsByLevel, setTotalsByLevel] = useState<ByLevel>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  type ChartType = "bars" | "stacked" | "line";
  const [chartType, setChartType] = useState<ChartType>("bars");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [finished, allLessons] = await Promise.all([
          lessonsApi.getProgressByLevel(),
          lessonsApi.list(),
        ]);
        if (!mounted) return;
        setByLevel(finished.byLevel || {});
        const agg: ByLevel = {};
        (allLessons || []).forEach((l: LessonListItem) => {
          agg[l.level] = (agg[l.level] || 0) + 1;
        });
        setTotalsByLevel(agg);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setError("Failed to load progress");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const maxValue = useMemo(() => {
    const maxFinished = Math.max(
      1,
      ...HSK_LEVELS.map((lvl) => byLevel[lvl] || 0)
    );
    const maxTotals = Math.max(
      1,
      ...HSK_LEVELS.map((lvl) => totalsByLevel[lvl] || 0)
    );
    return Math.max(maxFinished, maxTotals);
  }, [byLevel, totalsByLevel]);

  const chartData = useMemo(
    () =>
      HSK_LEVELS.map((lvl) => {
        const finished = byLevel[lvl] || 0;
        const total = totalsByLevel[lvl] || 0;
        const unfinished = Math.max(total - finished, 0);
        const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
        return {
          level: `HSK ${lvl}`,
          levelNum: lvl,
          finished,
          unfinished,
          total,
          pct,
        };
      }),
    [byLevel, totalsByLevel]
  );

  const getHSKBarColor = (lvl: number): string => {
    switch (lvl) {
      case 1:
        return "#22c55e"; // green-500
      case 2:
        return "#10b981"; // emerald-500
      case 3:
        return "#3b82f6"; // blue-500
      case 4:
        return "#6366f1"; // indigo-500
      case 5:
        return "#a855f7"; // purple-500
      case 6:
        return "#ec4899"; // pink-500
      case 7:
        return "#f97316"; // orange-500
      default:
        return "#4040f2"; // fallback
    }
  };

  const legendFormatter = (value: string) => {
    return value === "Finished" ? (
      <span style={{ color: "#ffffff" }}>{value}</span>
    ) : (
      <span style={{ color: "#a6a6a6" }}>{value}</span>
    );
  };

  return (
    <DashboardLayout
      title="Progress"
      subtitle="Your learning progress by HSK levels"
    >
      <div className="p-4 sm:p-6">
        <h1 className="text-white font-inter text-xl sm:text-2xl font-semibold">
          Progress
        </h1>

        <div className="mt-6 grid gap-4">
          <section className="bg-[#2e323a] rounded-xl border border-[#404040] p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-white font-inter font-medium">
                AI Lessons Completed by HSK
              </h2>
              <div
                className="inline-flex rounded-lg border border-[#404040] overflow-hidden"
                role="group"
                aria-label="Chart type"
              >
                <button
                  type="button"
                  onClick={() => setChartType("bars")}
                  className={`px-2 py-1 text-xs font-inter cursor-pointer ${
                    chartType === "bars"
                      ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                      : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                  }`}
                  aria-pressed={chartType === "bars"}
                >
                  Bars
                </button>
                <button
                  type="button"
                  onClick={() => setChartType("stacked")}
                  className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                    chartType === "stacked"
                      ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                      : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                  }`}
                  aria-pressed={chartType === "stacked"}
                >
                  Stacked
                </button>
                <button
                  type="button"
                  onClick={() => setChartType("line")}
                  className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                    chartType === "line"
                      ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                      : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                  }`}
                  aria-pressed={chartType === "line"}
                >
                  Line
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-[#a6a6a6] text-sm">Loading…</div>
            ) : error ? (
              <div className="text-red-400 text-sm" role="alert">
                {error}
              </div>
            ) : (
              <div className="mt-2 h-64 sm:h-80">
                {chartType === "bars" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid stroke="#2e323a" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="level"
                        stroke="#a6a6a6"
                        tick={{ fill: "#a6a6a6", fontSize: 12 }}
                      />
                      <YAxis
                        stroke="#a6a6a6"
                        tick={{ fill: "#a6a6a6", fontSize: 12 }}
                        allowDecimals={false}
                        domain={[0, maxValue]}
                      />
                      <ReTooltip
                        contentStyle={{
                          background: "#2e323a",
                          border: "1px solid #404040",
                          color: "#fff",
                        }}
                      />
                      <Legend formatter={legendFormatter} wrapperStyle={{}} />
                      <Bar
                        dataKey="finished"
                        name="Finished"
                        fill="#ffffff"
                        radius={[4, 4, 0, 0]}
                      >
                        {chartData.map((entry) => (
                          <Cell
                            key={entry.level}
                            fill={getHSKBarColor(entry.levelNum)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {chartType === "stacked" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid stroke="#2e323a" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="level"
                        stroke="#a6a6a6"
                        tick={{ fill: "#a6a6a6", fontSize: 12 }}
                      />
                      <YAxis
                        stroke="#a6a6a6"
                        tick={{ fill: "#a6a6a6", fontSize: 12 }}
                        allowDecimals={false}
                        domain={[0, maxValue]}
                      />
                      <ReTooltip
                        contentStyle={{
                          background: "#2e323a",
                          border: "1px solid #404040",
                          color: "#fff",
                        }}
                      />
                      <Legend formatter={legendFormatter} wrapperStyle={{}} />
                      <Bar
                        dataKey="finished"
                        name="Finished"
                        fill="#ffffff"
                        stackId="a"
                        radius={[4, 4, 0, 0]}
                      >
                        {chartData.map((entry) => (
                          <Cell
                            key={entry.level}
                            fill={getHSKBarColor(entry.levelNum)}
                          />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="unfinished"
                        name="Unfinished"
                        stackId="a"
                        fill="#59606b"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {chartType === "line" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid stroke="#2e323a" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="level"
                        stroke="#a6a6a6"
                        tick={{ fill: "#a6a6a6", fontSize: 12 }}
                      />
                      <YAxis
                        stroke="#a6a6a6"
                        tick={{ fill: "#a6a6a6", fontSize: 12 }}
                        allowDecimals={false}
                        domain={[0, maxValue]}
                      />
                      <ReTooltip
                        contentStyle={{
                          background: "#2e323a",
                          border: "1px solid #404040",
                          color: "#fff",
                        }}
                      />
                      <Legend formatter={legendFormatter} wrapperStyle={{}} />
                      <Line
                        type="monotone"
                        dataKey="finished"
                        name="Finished"
                        stroke="#9aa6ff"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </section>

          {/* Words Learned (coming soon) */}
          <section className="bg-[#2e323a] rounded-xl border border-[#404040] p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-white font-inter font-medium">
                Words Learned (by HSK)
              </h2>
              <span className="text-[11px] text-[#a6a6a6]">Coming soon</span>
            </div>
            <div className="text-[#a6a6a6] text-sm">
              We’ll visualize learned words per HSK level once tracking is
              enabled.
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
