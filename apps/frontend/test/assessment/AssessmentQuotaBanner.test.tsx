import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AssessmentQuotaBanner,
  type AssessmentQuotaError,
} from "@/components/assessment/assessment-quota-banner";

const baseError: AssessmentQuotaError = {
  type: "quota_exceeded",
  message: "You've reached your assessment limit.",
  planCap: 10,
  used: 10,
};

describe("AssessmentQuotaBanner", () => {
  it("renders usage details and upgrade CTA when quota is exceeded", () => {
    render(
      <AssessmentQuotaBanner
        error={baseError}
        starting={false}
        isQuotaExceeded
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(
      screen.getByText(/you've reached your assessment limit/i),
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

    // Use rate_limited error type so dismiss button is shown
    render(
      <AssessmentQuotaBanner
        error={{
          type: "rate_limited",
          message: "Please slow down.",
        }}
        starting={false}
        isQuotaExceeded={false}
        onRetry={onRetry}
        onDismiss={onDismiss}
      />,
    );

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /dismiss error/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows retry messaging for rate-limited errors", () => {
    render(
      <AssessmentQuotaBanner
        error={{
          type: "rate_limited",
          message: "Please slow down.",
        }}
        starting={false}
        isQuotaExceeded={false}
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("disables retry button when quota is exceeded", () => {
    render(
      <AssessmentQuotaBanner
        error={baseError}
        starting={false}
        isQuotaExceeded
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    const retryButton = screen.getByRole("button", { name: /try again/i });
    expect(retryButton).toBeDisabled();
  });

  it("disables retry button when starting", () => {
    render(
      <AssessmentQuotaBanner
        error={{
          type: "rate_limited",
          message: "Please slow down.",
        }}
        starting
        isQuotaExceeded={false}
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    const retryButton = screen.getByRole("button", { name: /retry/i });
    expect(retryButton).toBeDisabled();
  });

  it("renders nothing when error is null", () => {
    const { container } = render(
      <AssessmentQuotaBanner
        error={null}
        starting={false}
        isQuotaExceeded={false}
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("has accessible attributes", () => {
    render(
      <AssessmentQuotaBanner
        error={baseError}
        starting={false}
        isQuotaExceeded
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );

    const banner = screen.getByRole("alert");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveAttribute("aria-atomic", "true");
    expect(banner).toHaveAttribute("tabIndex", "-1");
  });
});

