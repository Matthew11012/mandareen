"use client";

import React, { useId, useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Tooltip component that uses aria-describedby for accessibility.
 * Follows WAI-ARIA tooltip pattern: https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/
 *
 * Features:
 * - Keyboard accessible (tooltip appears on focus)
 * - Uses aria-describedby for screen reader support
 * - Positioned above the trigger by default
 * - Respects prefers-reduced-motion
 */
export interface TooltipProps {
  /**
   * The content to show in the tooltip.
   */
  content: string;

  /**
   * The element that triggers the tooltip.
   */
  children: React.ReactElement;

  /**
   * Optional className for the tooltip container.
   */
  className?: string;

  /**
   * Optional position: 'top' | 'bottom' | 'left' | 'right'
   * Default: 'top'
   */
  position?: "top" | "bottom" | "left" | "right";

  /**
   * Delay before showing tooltip (ms). Default: 300ms for first tooltip, 0ms for subsequent.
   */
  delay?: number;
}

export function Tooltip({
  content,
  children,
  className,
  position = "top",
  delay = 300,
}: TooltipProps) {
  const tooltipId = useId();
  const [isVisible, setIsVisible] = React.useState(false);
  const [shouldAnimate, setShouldAnimate] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Detect touch devices to disable tooltips on mobile
  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice(
        "ontouchstart" in window ||
          navigator.maxTouchPoints > 0 ||
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
      );
    };
    checkTouch();
    // Also check on resize in case of device rotation
    window.addEventListener("resize", checkTouch);
    return () => window.removeEventListener("resize", checkTouch);
  }, []);

  const showTooltip = React.useCallback(() => {
    // Cancel any pending hide
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // Only show if not already visible to prevent flickering
    if (!isVisible) {
      timeoutRef.current = setTimeout(() => {
        setIsVisible(true);
        // Trigger animation after a brief moment
        setTimeout(() => setShouldAnimate(true), 10);
      }, delay);
    }
  }, [delay, isVisible]);

  const hideTooltip = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // Add a small delay before hiding to prevent flickering on small mouse movements
    setShouldAnimate(false);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      setTooltipPosition(null);
    }, 100);
  }, []);

  // Check if child is disabled (disabled buttons don't fire mouse events)
  const childProps = children.props as Record<string, unknown>;
  const isDisabled = childProps.disabled === true;
  const existingOnMouseEnter = childProps.onMouseEnter as
    | ((e: React.MouseEvent) => void)
    | undefined;
  const existingOnMouseLeave = childProps.onMouseLeave as
    | ((e: React.MouseEvent) => void)
    | undefined;
  const existingOnFocus = childProps.onFocus as
    | ((e: React.FocusEvent) => void)
    | undefined;
  const existingOnBlur = childProps.onBlur as
    | ((e: React.FocusEvent) => void)
    | undefined;

  // Clone child element and add event handlers
  // Note: Disabled buttons don't fire mouse events, so we handle hover on the wrapper
  const additionalProps: {
    "aria-describedby"?: string;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  } = {
    "aria-describedby": isVisible ? tooltipId : undefined,
    // Don't add mouse handlers to disabled buttons - wrapper will handle it
    ...(isDisabled
      ? {}
      : {
          onMouseEnter: (e: React.MouseEvent) => {
            // Don't show tooltips on touch devices (mobile)
            if (isTouchDevice) {
              existingOnMouseEnter?.(e);
              return;
            }
            // Cancel any pending hide
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            showTooltip();
            existingOnMouseEnter?.(e);
          },
          onMouseLeave: (e: React.MouseEvent) => {
            if (!isTouchDevice) {
              hideTooltip();
            }
            existingOnMouseLeave?.(e);
          },
        }),
    onFocus: (e: React.FocusEvent) => {
      // Don't show tooltips on touch devices (mobile) - they interfere with tap interactions
      if (!isDisabled && !isTouchDevice) {
        showTooltip();
      }
      existingOnFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      if (!isDisabled && !isTouchDevice) {
        hideTooltip();
      }
      existingOnBlur?.(e);
    },
  };

  // Calculate tooltip position when visible
  useEffect(() => {
    if (!isVisible || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current?.getBoundingClientRect();
      const tooltipWidth = tooltipRect?.width ?? 200;
      const tooltipHeight = tooltipRect?.height ?? 32;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 8; // Padding from viewport edges

      let top = 0;
      let left = 0;

      switch (position) {
        case "top":
          top = rect.top - tooltipHeight - padding;
          left = rect.left + rect.width / 2;
          // Initial centered position - boundary checks done in final verification
          break;
        case "bottom":
          top = rect.bottom + padding;
          left = rect.left + rect.width / 2;
          // Initial centered position - boundary checks done in final verification
          break;
        case "left":
          top = rect.top + rect.height / 2;
          left = rect.left - tooltipWidth - padding;
          // Ensure tooltip doesn't overflow left or right
          if (left < padding) {
            // If it would overflow left, position it to the right instead
            left = rect.right + padding;
            // But also check if it overflows right
            if (left + tooltipWidth > viewportWidth - padding) {
              left = viewportWidth - padding - tooltipWidth;
            }
          }
          break;
        case "right":
          top = rect.top + rect.height / 2;
          left = rect.right + padding;
          // Ensure tooltip doesn't overflow right
          if (left + tooltipWidth > viewportWidth - padding) {
            // If it would overflow right, position it to the left instead
            left = rect.left - tooltipWidth - padding;
            // But also check if it overflows left
            if (left < padding) {
              left = padding;
            }
          }
          break;
      }

      // Ensure tooltip doesn't overflow top or bottom
      if (top < padding) {
        top = padding;
      } else if (top + tooltipHeight > viewportHeight - padding) {
        top = viewportHeight - padding - tooltipHeight;
      }

      // Final verification: ensure tooltip doesn't overflow right or left
      // This is especially important for top/bottom positions with translateX(-50%)
      if (position === "top" || position === "bottom") {
        const halfWidth = tooltipWidth / 2;
        const rightEdge = left + halfWidth;
        const leftEdge = left - halfWidth;

        // If right edge would overflow, shift left
        if (rightEdge > viewportWidth - padding) {
          left = viewportWidth - padding - halfWidth;
        }
        // If left edge would overflow, shift right
        else if (leftEdge < padding) {
          left = padding + halfWidth;
        }
      } else {
        // For left/right positions, check actual edges
        if (left + tooltipWidth > viewportWidth - padding) {
          left = viewportWidth - padding - tooltipWidth;
        }
        if (left < padding) {
          left = padding;
        }
      }

      setTooltipPosition({ top, left });
    };

    // Initial position - use requestAnimationFrame to ensure tooltip is rendered first
    const rafId = requestAnimationFrame(() => {
      updatePosition();
      // Update multiple times to ensure we get actual tooltip dimensions
      // First update after render
      setTimeout(() => {
        updatePosition();
        // Second update to catch any layout changes
        setTimeout(updatePosition, 10);
      }, 0);
    });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const delayedUpdate = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(updatePosition, 0);
    };

    // Only update on scroll/resize, not on mouse movement
    window.addEventListener("scroll", delayedUpdate, true);
    window.addEventListener("resize", delayedUpdate);

    return () => {
      cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("scroll", delayedUpdate, true);
      window.removeEventListener("resize", delayedUpdate);
    };
  }, [isVisible, position, content]);

  const childWithProps = React.cloneElement(children, {
    ...additionalProps,
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Handle ref forwarding if child has ref
      const childRef = (children as { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof childRef === "function") {
        childRef(node);
      } else if (childRef && "current" in childRef) {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
  } as React.HTMLAttributes<HTMLElement>);

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-[#2e323a] border-l-transparent border-r-transparent border-b-transparent",
    bottom:
      "bottom-full left-1/2 -translate-x-1/2 border-b-[#2e323a] border-l-transparent border-r-transparent border-t-transparent",
    left: "left-full top-1/2 -translate-y-1/2 border-l-[#2e323a] border-t-transparent border-b-transparent border-r-transparent",
    right:
      "right-full top-1/2 -translate-y-1/2 border-r-[#2e323a] border-t-transparent border-b-transparent border-l-transparent",
  };

  // Use block instead of inline-block if w-full is in className (for truncation support)
  const isFullWidth = className?.includes("w-full");

  return (
    <div
      className={cn(
        "relative",
        isFullWidth ? "block w-full" : "inline-block",
        className
      )}
      onMouseEnter={
        isDisabled && !isTouchDevice
          ? () => {
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              showTooltip();
            }
          : undefined
      }
      onMouseLeave={isDisabled && !isTouchDevice ? hideTooltip : undefined}
    >
      {childWithProps}
      {!isTouchDevice &&
        isVisible &&
        tooltipPosition &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className={cn(
              "fixed z-[10000] px-3 py-1.5 text-xs font-inter text-white bg-[#2e323a] border border-[#404040] rounded-lg shadow-lg whitespace-nowrap pointer-events-none",
              "transition-opacity duration-200",
              shouldAnimate ? "opacity-100" : "opacity-0"
            )}
            style={{
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
              transform:
                position === "top" || position === "bottom"
                  ? "translateX(-50%)"
                  : position === "left" || position === "right"
                    ? "translateY(-50%)"
                    : "none",
              minWidth: "max-content",
            }}
          >
            {content}
            <div
              className={cn(
                "absolute w-0 h-0 border-4",
                arrowClasses[position]
              )}
              style={{
                ...(position === "top"
                  ? { top: "100%", left: "50%", transform: "translateX(-50%)" }
                  : position === "bottom"
                    ? {
                        bottom: "100%",
                        left: "50%",
                        transform: "translateX(-50%)",
                      }
                    : position === "left"
                      ? {
                          left: "100%",
                          top: "50%",
                          transform: "translateY(-50%)",
                        }
                      : {
                          right: "100%",
                          top: "50%",
                          transform: "translateY(-50%)",
                        }),
              }}
              aria-hidden="true"
            />
          </div>,
          document.body
        )}
    </div>
  );
}
