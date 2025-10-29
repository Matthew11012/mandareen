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
  PieChart,
  Pie,
  LabelList,
  AreaChart,
  Area,
} from "recharts";

type ByLevel = Record<number, number>;

const HSK_LEVELS = [1, 2, 3, 4, 5, 6, 7];

export default function ProgressPage() {
  const [byLevel, setByLevel] = useState<ByLevel>({});
  const [totalsByLevel, setTotalsByLevel] = useState<ByLevel>({});
  const [wordsByHsk, setWordsByHsk] = useState<Record<string, number>>({});
  const [wordsTimeline, setWordsTimeline] = useState<{
    points: Array<{ date: string; new: number; learned: number }>;
    totals: { new: number; learned: number };
  }>({ points: [], totals: { new: 0, learned: 0 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  type LessonsChartType = "bars" | "stacked";
  type WordsChartType = "bars" | "pie";
  type WordsTimelineFilter = "all" | "30" | "7";
  const [lessonsChartType, setLessonsChartType] =
    useState<LessonsChartType>("bars");
  const [wordsChartType, setWordsChartType] = useState<WordsChartType>("bars");
  const [wordsTimelineFilter, setWordsTimelineFilter] =
    useState<WordsTimelineFilter>("all");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [finished, allLessons, wordsByHskRes, wordsTimelineRes] =
          await Promise.all([
            lessonsApi.getProgressByLevel(),
            lessonsApi.list(),
            lessonsApi.getWordsReadByHsk(),
            lessonsApi.getWordsTimeline(),
          ]);
        if (!mounted) return;
        setByLevel(finished.byLevel || {});
        const agg: ByLevel = {};
        (allLessons || []).forEach((l: LessonListItem) => {
          agg[l.level] = (agg[l.level] || 0) + 1;
        });
        setTotalsByLevel(agg);
        setWordsByHsk(wordsByHskRes.byHsk || {});
        setWordsTimeline(wordsTimelineRes);
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

  const filteredTimelineData = useMemo(() => {
    if (!wordsTimeline.points || wordsTimeline.points.length === 0) return [];

    const now = new Date();
    let cutoffDate: Date;

    switch (wordsTimelineFilter) {
      case "7":
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30":
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        return wordsTimeline.points;
    }

    return wordsTimeline.points.filter(
      (point) => new Date(point.date) >= cutoffDate
    );
  }, [wordsTimeline.points, wordsTimelineFilter]);

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

  // Custom label renderer that avoids clipping at the top edge
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderBarValueLabel = (props: any) => {
    const toNum = (v: unknown): number => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const { x, y, width, value } = (props || {}) as {
      x?: number | string;
      y?: number | string;
      width?: number | string;
      value?: number | string;
    };
    const numeric = toNum(value);
    if (numeric <= 0) return null;
    const centerX = toNum(x) + toNum(width) / 2;
    // Clamp Y so label remains visible; 12px padding from the top
    const labelY = Math.max(12, toNum(y) - 4);
    return (
      <text
        x={centerX}
        y={labelY}
        fill="#ffffff"
        textAnchor="middle"
        fontSize={12}
        style={{ pointerEvents: "none" }}
      >
        {String(numeric)}
      </text>
    );
  };

  // Custom label renderer to place value inside a stacked bar segment; hides 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderInsideBarLabel = (props: any) => {
    const toNum = (v: unknown): number => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const { x, y, width, height, value } = props || {};
    const numeric = toNum(value);
    if (numeric <= 0) return null;
    const cx = toNum(x) + toNum(width) / 2;
    const cy = toNum(y) + Math.max(12, toNum(height) / 2);
    return (
      <text
        x={cx}
        y={cy}
        fill="#ffffff"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={12}
        style={{ pointerEvents: "none" }}
      >
        {String(numeric)}
      </text>
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

        <div className="mt-6 grid grid-cols-1 min-[920px]:grid-cols-2 min-[920px]:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <section className="bg-[#2e323a] rounded-xl border border-[#404040] p-4 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h2 className="text-white font-inter font-medium text-sm md:text-base">
                Lessons Completed (by HSK)
              </h2>
              <div
                className="inline-flex rounded-lg border border-[#404040] overflow-hidden"
                role="group"
                aria-label="Chart type"
              >
                <button
                  type="button"
                  onClick={() => setLessonsChartType("bars")}
                  className={`px-2 py-1 text-xs font-inter cursor-pointer ${
                    lessonsChartType === "bars"
                      ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                      : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                  }`}
                  aria-pressed={lessonsChartType === "bars"}
                >
                  Bars
                </button>
                <button
                  type="button"
                  onClick={() => setLessonsChartType("stacked")}
                  className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                    lessonsChartType === "stacked"
                      ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                      : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                  }`}
                  aria-pressed={lessonsChartType === "stacked"}
                >
                  Stacked
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
                {lessonsChartType === "bars" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 28 }}
                    >
                      <CartesianGrid stroke="#2e323a" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="level"
                        stroke="#a6a6a6"
                        tick={{
                          fill: "#a6a6a6",
                          fontSize: 12,
                          textAnchor: "end",
                        }}
                        interval={0}
                        tickMargin={5}
                        height={38}
                        angle={-30}
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
                      <Legend
                        formatter={legendFormatter}
                        verticalAlign="bottom"
                        align="center"
                        wrapperStyle={{ paddingTop: 8 }}
                      />
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
                        <LabelList
                          dataKey="finished"
                          content={renderBarValueLabel}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {lessonsChartType === "stacked" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 28 }}
                    >
                      <CartesianGrid stroke="#2e323a" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="level"
                        stroke="#a6a6a6"
                        tick={{
                          fill: "#a6a6a6",
                          fontSize: 12,
                          textAnchor: "end",
                        }}
                        interval={0}
                        tickMargin={5}
                        height={38}
                        angle={-30}
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
                      <Legend
                        formatter={legendFormatter}
                        verticalAlign="bottom"
                        align="center"
                        wrapperStyle={{ paddingTop: 8 }}
                      />
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
                        <LabelList
                          dataKey="finished"
                          content={renderInsideBarLabel}
                        />
                      </Bar>
                      <Bar
                        dataKey="unfinished"
                        name="Unfinished"
                        stackId="a"
                        fill="#59606b"
                        radius={[4, 4, 0, 0]}
                      >
                        <LabelList
                          dataKey="unfinished"
                          content={renderInsideBarLabel}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </section>

          {/* Words Read by HSK */}
          <section className="bg-[#2e323a] rounded-xl border border-[#404040] p-4 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h2 className="text-white font-inter font-medium">
                Words Read (by HSK)
              </h2>
              <div
                className="inline-flex rounded-lg border border-[#404040] overflow-hidden"
                role="group"
                aria-label="Words chart type"
              >
                <button
                  type="button"
                  onClick={() => setWordsChartType("bars")}
                  className={`px-2 py-1 text-xs font-inter cursor-pointer ${
                    wordsChartType === "bars"
                      ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                      : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                  }`}
                  aria-pressed={wordsChartType === "bars"}
                >
                  Bars
                </button>
                <button
                  type="button"
                  onClick={() => setWordsChartType("pie")}
                  className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                    wordsChartType === "pie"
                      ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                      : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                  }`}
                  aria-pressed={wordsChartType === "pie"}
                >
                  Pie
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
                {wordsChartType === "pie" ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart
                      margin={{ top: 0, right: 0, left: 0, bottom: 28 }}
                    >
                      <ReTooltip
                        contentStyle={{
                          background: "#2e323a",
                          border: "1px solid #404040",
                          color: "#fff",
                        }}
                      />
                      <Legend
                        formatter={legendFormatter}
                        verticalAlign="bottom"
                        align="center"
                        wrapperStyle={{ paddingTop: 8 }}
                      />
                      <Pie
                        data={[
                          ...HSK_LEVELS.map((lvl) => ({
                            name: `HSK ${lvl}`,
                            value: wordsByHsk[String(lvl)] || 0,
                            levelNum: lvl,
                          })),
                          {
                            name: "Unknown",
                            value: wordsByHsk["unknown"] || 0,
                            levelNum: 0,
                          },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={40}
                      >
                        {[
                          ...HSK_LEVELS.map((lvl) => ({
                            key: `HSK ${lvl}`,
                            color: getHSKBarColor(lvl),
                          })),
                          { key: "Unknown", color: "#59606b" },
                        ].map((entry) => (
                          <Cell key={entry.key} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        ...HSK_LEVELS.map((lvl) => ({
                          level: `HSK ${lvl}`,
                          levelNum: lvl,
                          count: wordsByHsk[String(lvl)] || 0,
                        })),
                        {
                          level: "Unknown",
                          levelNum: 0,
                          count: wordsByHsk["unknown"] || 0,
                        },
                      ]}
                      margin={{ top: 10, right: 10, left: 0, bottom: 28 }}
                    >
                      <CartesianGrid stroke="#2e323a" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="level"
                        stroke="#a6a6a6"
                        tick={{
                          fill: "#a6a6a6",
                          fontSize: 12,
                          textAnchor: "end",
                        }}
                        interval={0}
                        tickMargin={5}
                        height={38}
                        angle={-30}
                      />
                      <YAxis
                        stroke="#a6a6a6"
                        tick={{ fill: "#a6a6a6", fontSize: 12 }}
                        allowDecimals={false}
                      />
                      <ReTooltip
                        contentStyle={{
                          background: "#2e323a",
                          border: "1px solid #404040",
                          color: "#fff",
                        }}
                      />
                      <Legend
                        formatter={legendFormatter}
                        verticalAlign="bottom"
                        align="center"
                        wrapperStyle={{ paddingTop: 8 }}
                      />
                      <Bar
                        dataKey="count"
                        name="Words Read"
                        fill="#ffffff"
                        radius={[4, 4, 0, 0]}
                      >
                        {[
                          ...HSK_LEVELS.map((lvl) => ({
                            key: `HSK ${lvl}`,
                            color: getHSKBarColor(lvl),
                          })),
                          { key: "Unknown", color: "#59606b" },
                        ].map((entry) => (
                          <Cell key={entry.key} fill={entry.color} />
                        ))}
                        <LabelList
                          dataKey="count"
                          content={renderBarValueLabel}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </section>

          {/* Words Progress Timeline */}
          <section className="bg-[#2e323a] rounded-xl border border-[#404040] p-4 min-[920px]:col-span-2">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-white font-inter font-medium text-sm md:text-base">
                Words Progress
              </h2>
              <div
                className="inline-flex rounded-lg border border-[#404040] overflow-hidden"
                role="group"
                aria-label="Timeline filter"
              >
                <button
                  type="button"
                  onClick={() => setWordsTimelineFilter("all")}
                  className={`px-2 py-1 text-xs font-inter cursor-pointer ${
                    wordsTimelineFilter === "all"
                      ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                      : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                  }`}
                  aria-pressed={wordsTimelineFilter === "all"}
                >
                  All Time
                </button>
                <button
                  type="button"
                  onClick={() => setWordsTimelineFilter("30")}
                  className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                    wordsTimelineFilter === "30"
                      ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                      : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                  }`}
                  aria-pressed={wordsTimelineFilter === "30"}
                >
                  30 days
                </button>
                <button
                  type="button"
                  onClick={() => setWordsTimelineFilter("7")}
                  className={`px-2 py-1 text-xs font-inter border-l border-[#404040] cursor-pointer ${
                    wordsTimelineFilter === "7"
                      ? "bg-[#4040f2]/10 text-[#9aa6ff]"
                      : "text-[#a6a6a6] hover:bg-[#4040f2]/10"
                  }`}
                  aria-pressed={wordsTimelineFilter === "7"}
                >
                  7 days
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
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={filteredTimelineData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#2e323a" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      stroke="#a6a6a6"
                      tick={{ fill: "#a6a6a6", fontSize: 12 }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
                      }}
                    />
                    <YAxis
                      stroke="#a6a6a6"
                      tick={{ fill: "#a6a6a6", fontSize: 12 }}
                      allowDecimals={false}
                    />
                    <ReTooltip
                      contentStyle={{
                        background: "#2e323a",
                        border: "1px solid #404040",
                        color: "#fff",
                      }}
                      labelFormatter={(value) => {
                        const date = new Date(value);
                        const day = String(date.getDate()).padStart(2, "0");
                        const month = String(date.getMonth() + 1).padStart(
                          2,
                          "0"
                        );
                        const year = String(date.getFullYear()).slice(-2);
                        return `${day}/${month}/${year}`;
                      }}
                    />
                    <Legend formatter={legendFormatter} wrapperStyle={{}} />
                    <Area
                      type="monotone"
                      dataKey="learned"
                      stackId="1"
                      stroke="#10b981"
                      fill="#10b981"
                      name="Learned Words"
                    />
                    <Area
                      type="monotone"
                      dataKey="new"
                      stackId="1"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      name="New Words"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Summary Tiles */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-[#1a1d23] rounded-lg p-3 border border-[#404040]">
                <div className="text-[#a6a6a6] text-xs font-inter mb-1">
                  New Words
                </div>
                <div className="text-white text-lg font-semibold">
                  {wordsTimeline.totals.new}
                </div>
                <div className="text-[#a6a6a6] text-xs">
                  Read less than ten times
                </div>
              </div>
              <div className="bg-[#1a1d23] rounded-lg p-3 border border-[#404040]">
                <div className="text-[#a6a6a6] text-xs font-inter mb-1">
                  Learned Words
                </div>
                <div className="text-white text-lg font-semibold">
                  {wordsTimeline.totals.learned}
                </div>
                <div className="text-[#a6a6a6] text-xs">
                  Read ten times or more
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
