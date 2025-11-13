import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConversationUsageToast } from "@/components/conversations/ConversationUsageToast";

describe("ConversationUsageToast", () => {
  it("announces near-limit usage as a polite status", () => {
    render(
      <ConversationUsageToast
        pct={92}
        resetsAt="2025-11-30T23:59:59.000Z"
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(/92% of this period/i);
  });

  it("supports dismissing the banner without stealing focus", async () => {
    const onDismiss = vi.fn();
    render(
      <ConversationUsageToast
        pct={99}
        resetsAt="2025-11-30T23:59:59.000Z"
        onDismiss={onDismiss}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /dismiss usage warning/i }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

