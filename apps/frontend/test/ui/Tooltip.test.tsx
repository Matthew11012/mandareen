import React from "react";
import { render, waitFor, act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Tooltip } from "@/components/ui/tooltip";

describe("Tooltip", () => {
  // Mock touch detection to ensure tooltips work in tests
  beforeEach(() => {
    // Remove ontouchstart completely so "ontouchstart" in window returns false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).ontouchstart;

    // Mock navigator.maxTouchPoints
    Object.defineProperty(navigator, "maxTouchPoints", {
      writable: true,
      configurable: true,
      value: 0,
    });

    // Mock matchMedia to return false for pointer: coarse
    const matchMediaMock = vi.fn().mockImplementation((query: string) => {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as MediaQueryList;
    });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: matchMediaMock,
    });

    // Mock requestAnimationFrame to execute callbacks immediately
    let rafId = 0;
    const rafCallbacks: Array<FrameRequestCallback> = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      // Execute in next tick
      setTimeout(() => {
        const callback = rafCallbacks.shift();
        if (callback) callback(performance.now());
      }, 0);
      return ++rafId;
    });

    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows tooltip content when hovering a disabled trigger", async () => {
    const { container } = render(
      <Tooltip content="Monthly cap reached" delay={0}>
        <button disabled>Generate lesson</button>
      </Tooltip>
    );

    // Wait for touch detection useEffect to complete and ensure isTouchDevice is false
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // For disabled buttons, the wrapper div handles hover events
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toBeInTheDocument();

    // Use fireEvent to trigger mouseenter on the wrapper
    await act(async () => {
      fireEvent.mouseEnter(wrapper);
    });

    // Wait for tooltip to appear - it's rendered via portal to document.body
    // Steps: delay timeout (0ms) -> isVisible -> position calculation (RAF + setTimeout) -> render
    await waitFor(
      async () => {
        // Allow time for async operations
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
        });

        // Query from document.body since tooltip is rendered via portal
        const tooltip = document.body.querySelector('[role="tooltip"]');
        if (!tooltip) {
          throw new Error("Tooltip not found in document.body");
        }
        expect(tooltip).toHaveTextContent("Monthly cap reached");
      },
      { timeout: 3000, interval: 100 }
    );
  });

  it("is keyboard accessible with aria-describedby semantics", async () => {
    const { container } = render(
      <Tooltip content="Helpful info" delay={0}>
        <button>Focus me</button>
      </Tooltip>
    );

    // Wait for touch detection useEffect to complete and ensure isTouchDevice is false
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Find button and focus it using fireEvent
    const button = container.querySelector("button");
    expect(button).toBeInTheDocument();

    await act(async () => {
      fireEvent.focus(button!);
    });

    // Wait for tooltip to appear on focus - it's rendered via portal to document.body
    await waitFor(
      async () => {
        // Allow time for async operations
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
        });

        // Query from document.body since tooltip is rendered via portal
        const tooltip = document.body.querySelector('[role="tooltip"]');
        if (!tooltip) {
          throw new Error("Tooltip not found in document.body");
        }
        expect(tooltip).toHaveTextContent("Helpful info");
        expect(button).toHaveAttribute("aria-describedby", tooltip.id);
      },
      { timeout: 3000, interval: 100 }
    );
  });
});
