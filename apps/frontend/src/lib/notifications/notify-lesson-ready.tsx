import React from "react";
import { toast } from "sonner";

export interface LessonReadyNotification {
  id: number;
  title?: string | null;
  topic?: string | null;
  type?: "story" | "dialogue";
  onOpen: () => void;
}

const CTA_LABEL_BY_TYPE: Record<"story" | "dialogue", string> = {
  story: "Open story",
  dialogue: "Open dialogue",
};

export function notifyLessonReady(payload: LessonReadyNotification) {
  const trimmedTitle = payload.title?.trim();
  const trimmedTopic = payload.topic?.trim();
  const heading = trimmedTitle || trimmedTopic || "Your lesson";
  const type = payload.type ?? "story";
  const actionLabel = CTA_LABEL_BY_TYPE[type] ?? "Open lesson";

  const descriptionLines: string[] = [];

  if (trimmedTopic && trimmedTopic !== heading) {
    descriptionLines.push(`Topic: ${trimmedTopic}`);
  }

  toast.success(
    <div className="flex flex-col w-full min-w-full">
      <div className="font-semibold mb-1.5 pr-4">{`Lesson ready: ${heading}`}</div>
      <div className="text-sm opacity-90 flex flex-col gap-1 mb-3 pr-4">
        {descriptionLines.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
      </div>
      <div className="flex justify-end mt-auto w-full">
        <button
          onClick={payload.onOpen}
          className="px-4 py-1.5 bg-white text-black rounded-md text-sm font-medium hover:bg-gray-100 transition-colors cursor-pointer"
        >
          {actionLabel}
        </button>
      </div>
    </div>,
    {
      id: `lesson-ready-${payload.id}`,
      duration: 10000,
      className: "!w-full",
    }
  );
}
