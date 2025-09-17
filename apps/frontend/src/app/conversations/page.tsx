"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout";
import { conversationsApi, type Message } from "@/lib/api/conversations";
import { Mic, Send } from "lucide-react";
import { toast } from "sonner";

export default function ConversationsPage() {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        const { id } = await conversationsApi.start();
        setConversationId(id);
        const msgs = await conversationsApi.listMessages(id);
        setMessages(msgs);
      } catch {
        toast.error("Failed to start conversation");
      }
    };
    init();
  }, []);

  const sendText = async () => {
    if (!conversationId || !input.trim()) return;
    const text = input.trim();
    setInput("");
    try {
      const { user, ai } = await conversationsApi.send(conversationId, text);
      setMessages((prev) => [...prev, user, ai]);
    } catch {
      toast.error("Failed to send message");
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Placeholder: You can wire this to a speech-to-text API and set the result into input
        toast("Audio recorded. Transcription not yet implemented.");
      };
      rec.start();
      setRecording(true);
    } catch (e) {
      toast.error("Mic permission denied");
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
      setRecording(false);
    }
  };

  return (
    <DashboardLayout
      title="Conversations"
      subtitle="Practice natural dialogues"
    >
      <div className="p-4 h-full flex flex-col gap-4">
        <div className="flex-1 overflow-y-auto space-y-3 bg-[#20242b] border border-[#2e2f36] rounded-xl p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] w-fit rounded-lg px-3 py-2 border ${
                m.role === "user"
                  ? "ml-auto bg-[#2e323a] border-[#3a3f47]"
                  : "mr-auto bg-[#26322b] border-[#35503c]"
              }`}
            >
              <div className="text-white font-inter text-[15px]">{m.hanzi}</div>
              {m.pinyin && (
                <div className="text-[#9aa6ff] text-xs mt-1">{m.pinyin}</div>
              )}
              {m.translation && (
                <div className="text-[#a6a6a6] text-xs mt-1">
                  {m.translation}
                </div>
              )}
              <div className="text-[10px] text-[#808080] mt-1">
                {new Date(m.createdAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`p-2 rounded-lg border transition-colors duration-200 cursor-pointer ${
              recording
                ? "bg-red-600/20 border-red-600/40 text-red-300"
                : "bg-green-600/20 border-green-600/40 text-green-300 hover:border-green-600"
            }`}
            title={recording ? "Release to stop" : "Hold to speak"}
          >
            <Mic className="w-4 h-4" />
          </button>

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendText();
            }}
            placeholder="Type your message in Chinese..."
            className="flex-1 bg-[#1a1d23] border border-[#2e323a] rounded-lg px-3 py-2 text-white outline-none"
          />
          <button
            onClick={sendText}
            className="p-2 rounded-lg bg-[#4040f2] text-white hover:bg-[#3636d9] transition-colors duration-200 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
