"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import { lessonsApi, type LessonListItem } from "@/lib/api/lessons";
import { Plus, RefreshCw, BookOpen, MessageSquare } from "lucide-react";
import { getHSKPillClasses } from "@/lib/constants/hsk";
import { useRouter } from "next/navigation";

export default function LessonsPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const router = useRouter();
  const [items, setItems] = useState<LessonListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [topic, setTopic] = useState("");
  const suggestions = [
    "At the market",
    "First day at university",
    "Ordering food at a restaurant",
    "Job interview",
    "Traveling on the subway",
    "Visiting the doctor",
  ];

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lessonsApi.list();
      setItems(data);
    } catch {
      setError("Failed to load lessons");
    } finally {
      setLoading(false);
    }
  };

  const getLevelPillColor = (level: number) => getHSKPillClasses(level);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { id } = await lessonsApi.generate({
        type: "story",
        readTimeMinutes: 10,
        topic: topic.trim() || undefined,
      });
      await load();
      router.push(`/lessons/${id}`);
    } catch {
      setError("Failed to generate lesson");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateDialogue = async () => {
    setGenerating(true);
    try {
      const { id } = await lessonsApi.generate({
        type: "dialogue",
        readTimeMinutes: 5,
        topic: topic.trim() || undefined,
      });
      await load();
      router.push(`/lessons/${id}`);
    } catch {
      setError("Failed to generate dialogue");
    } finally {
      setGenerating(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <DashboardLayout
      title="AI Lessons"
      subtitle="Generate and study AI-crafted lessons"
    >
      <div className="p-6 space-y-6">
        {/* Topic selection */}
        <div className="bg-[#2e323a] rounded-xl p-4 border border-[#404040] space-y-3">
          <div className="text-white font-inter font-semibold">
            Choose a topic (optional)
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setTopic(s)}
                className={`px-3 py-1 rounded-full text-xs font-inter border ${topic === s ? "border-[#4040f2] text-[#9aa6ff]" : "border-[#404040] text-[#a6a6a6]"} cursor-pointer hover:border-[#4040f2]`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              className="flex-1 bg-transparent border border-[#404040] rounded-lg px-3 py-2 text-white placeholder-[#777] focus:outline-none focus:border-[#4040f2]"
              placeholder="Or type your own detailed topic or prompt..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <button
              onClick={() => setTopic("")}
              className="px-3 py-2 bg-[#2e323a] border border-[#404040] text-[#a6a6a6] rounded-lg hover:border-[#4040f2] cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 bg-orange-500/80 text-white rounded-lg hover:bg-orange-600 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                <span className="font-inter">Generate Story</span>
              </div>
            </button>
            <button
              onClick={handleGenerateDialogue}
              disabled={generating}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <span className="font-inter">Generate Dialogue</span>
              </div>
            </button>
            <button
              onClick={() => setTopic("")}
              disabled={generating}
              className="px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 hover:bg-orange-500/20 rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RefreshCw
              className={`w-4 h-4 text-[#a6a6a6] ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {error && <p className="text-red-400 font-inter text-sm">{error}</p>}

        {loading ? (
          <div className="flex items-center gap-2 text-[#a6a6a6]">
            <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <span className="font-inter text-sm">Loading...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-[#a6a6a6] font-inter text-sm">
            No lessons yet. Click &quot;Generate Story&quot; to create one.
          </div>
        ) : (
          <div className="space-y-8">
            {/* Stories Section */}
            <div className="space-y-3">
              <h3 className="text-white font-inter font-semibold">Stories</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items
                  .filter((i) => i.lessonType === "story")
                  .map((l) => (
                    <div
                      key={l.id}
                      className="bg-[#2e323a] rounded-xl p-4 border border-[#404040] hover:border-[#4040f2] transition-all duration-200 cursor-pointer"
                      onClick={() => router.push(`/lessons/${l.id}`)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-orange-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-white font-inter font-semibold truncate">
                              {l.title || `Lesson #${l.id}`}
                            </p>
                            <span
                              className={`ml-2 px-2 py-0.5 rounded-full text-xs font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(l.level)}`}
                            >
                              HSK {l.level}
                            </span>
                          </div>
                          {l.titlePinyin && (
                            <p className="text-[#9aa6ff] font-inter text-xs truncate">
                              {l.titlePinyin}
                            </p>
                          )}
                          {l.titleTranslation && (
                            <p className="text-[#a6a6a6] font-inter text-xs truncate">
                              {l.titleTranslation}
                            </p>
                          )}
                          <p className="text-[#a6a6a6] font-inter text-xs mt-1">
                            {new Date(l.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="h-px bg-[#3a3a3a]" />

            {/* Dialogues Section */}
            <div className="space-y-3">
              <h3 className="text-white font-inter font-semibold">Dialogues</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items
                  .filter((i) => i.lessonType === "dialogue")
                  .map((l) => (
                    <div
                      key={l.id}
                      className="bg-[#2e323a] rounded-xl p-4 border border-[#404040] hover:border-[#4040f2] transition-all duration-200 cursor-pointer"
                      onClick={() => router.push(`/lessons/${l.id}`)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
                          <MessageSquare className="w-5 h-5 text-purple-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-white font-inter font-semibold truncate">
                              {l.title || `Dialogue #${l.id}`}
                            </p>
                            <span
                              className={`ml-2 px-2 py-0.5 rounded-full text-xs font-inter whitespace-nowrap inline-flex items-center ${getLevelPillColor(l.level)}`}
                            >
                              HSK {l.level}
                            </span>
                          </div>
                          {l.titlePinyin && (
                            <p className="text-[#9aa6ff] font-inter text-xs truncate">
                              {l.titlePinyin}
                            </p>
                          )}
                          {l.titleTranslation && (
                            <p className="text-[#a6a6a6] font-inter text-xs truncate">
                              {l.titleTranslation}
                            </p>
                          )}
                          <p className="text-[#a6a6a6] font-inter text-xs mt-1">
                            {new Date(l.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
