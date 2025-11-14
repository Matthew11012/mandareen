import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComponentProps, useMemo, useState } from "react";
import { describe, expect, it } from "vitest";
import { ConversationErrorBanner } from "@/components/conversations/ConversationErrorBanner";
import { MessageInput } from "@/components/conversations/MessageInput";

function RateLimitHarness() {
  const [error, setError] =
    useState<ComponentProps<typeof ConversationErrorBanner>["error"]>();
  const [input, setInput] = useState("");

  const sendDisabled = !!(error?.kind === "rate" && error.retrySeconds > 0);
  const disableReason = useMemo(() => {
    if (error?.kind === "rate" && error.retrySeconds > 0) {
      return `Try again in ${error.retrySeconds}s`;
    }
    return undefined;
  }, [error]);

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          setError({
            kind: "rate",
            message: "Too many messages at once",
            resource: "convo_message_text",
            retrySeconds: 3,
            retryAt: Date.now() + 3000,
          })
        }
      >
        Trigger rate limit
      </button>
      <button
        type="button"
        onClick={() =>
          setError((prev) => {
            if (!prev || prev.kind !== "rate") return prev;
            const nextRetry = Math.max(0, prev.retrySeconds - 1);
            return {
              ...prev,
              retrySeconds: nextRetry,
            };
          })
        }
      >
        Advance countdown
      </button>
      <MessageInput
        input={input}
        onInputChange={setInput}
        onSend={() => undefined}
        recording={false}
        recPrompt="Hold to speak"
        uploadingAudio={false}
        onStartRecording={() => undefined}
        onStopRecording={() => undefined}
        sendDisabled={sendDisabled}
        sendDisabledReason={disableReason}
        audioDisabled={sendDisabled}
        audioDisabledReason={disableReason}
      />
      {error ? <ConversationErrorBanner error={error} /> : null}
    </div>
  );
}

describe("Conversation flow SSE error handling", () => {
  it("disables the composer until rate limit countdown expires", async () => {
    const user = userEvent.setup();

    render(<RateLimitHarness />);

    const triggerButton = screen.getByRole("button", {
      name: /trigger rate limit/i,
    });
    await user.click(triggerButton);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/try again in/i);

    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute(
      "title",
      expect.stringMatching(/try again/i)
    );

    const advanceButton = screen.getByRole("button", {
      name: /advance countdown/i,
    });
    await user.click(advanceButton);
    await user.click(advanceButton);
    await user.click(advanceButton);

    expect(sendButton).not.toBeDisabled();
    expect(alert).toHaveTextContent(/you can send another message now/i);
  });
});
