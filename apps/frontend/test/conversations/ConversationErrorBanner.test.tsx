import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConversationErrorBanner } from "@/components/conversations/ConversationErrorBanner";

describe("ConversationErrorBanner", () => {
  it("announces quota overruns with upgrade link", async () => {
    const onDismiss = vi.fn();
    render(
      <ConversationErrorBanner
        error={{
          kind: "quota",
          message: "Plan limit reached",
          resource: "convo_message_text",
          planCap: 120,
          used: 120,
        }}
        onDismiss={onDismiss}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "polite");
    expect(
      screen.getByRole("link", { name: /view plans & upgrade/i }),
    ).toBeInTheDocument();

    const dismissButton = screen.getByRole("button", { name: /dismiss/i });
    await userEvent.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("communicates rate limits with countdown messaging", () => {
    render(
      <ConversationErrorBanner
        error={{
          kind: "rate",
          message: "Too fast",
          resource: "convo_message_text",
          retrySeconds: 5,
          retryAt: Date.now() + 5000,
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/try again in/i);
  });

  it("handles concurrency collisions with optional retry messaging", async () => {
    const onDismiss = vi.fn();
    render(
      <ConversationErrorBanner
        error={{
          kind: "concurrency",
          message: "Another session active",
          resource: "convo_stream",
          limit: 1,
          retrySeconds: 3,
          retryAt: Date.now() + 3000,
        }}
        onDismiss={onDismiss}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/one live ai conversation/i);
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

