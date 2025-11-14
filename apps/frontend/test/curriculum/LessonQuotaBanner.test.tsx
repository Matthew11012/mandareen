import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  LessonQuotaBanner,
  type LessonQuotaError,
} from "@/components/curriculum/lesson-quota-banner";

const baseError: LessonQuotaError = {
  type: "quota_exceeded",
  message: "You've reached your curriculum generation limit.",
  planCap: 10,
  used: 10,
};

describe("LessonQuotaBanner", () => {
  it("renders usage details and upgrade CTA when quota is exceeded", () => {
    render(
      <LessonQuotaBanner
        error={baseError}
        generating={false}
        isQuotaExceeded
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(
      screen.getByText(/you've reached your curriculum generation limit/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/used: 10 \/ 10/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /upgrade plan/i }),
    ).toHaveAttribute("href", "/pricing");
  });

  it("calls retry and dismiss handlers", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onDismiss = vi.fn();

    render(
      <LessonQuotaBanner
        error={baseError}
        generating={false}
        isQuotaExceeded={false}
        onRetry={onRetry}
        onDismiss={onDismiss}
      />,
    );

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /dismiss error/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows retry messaging for rate-limited errors", () => {
    render(
      <LessonQuotaBanner
        error={{
          type: "rate_limited",
          message: "Please slow down.",
        }}
        generating={false}
        isQuotaExceeded={false}
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

