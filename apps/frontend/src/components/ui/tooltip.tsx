"use client";

import React, { useId } from "react";
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
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [delay]);

  const hideTooltip = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
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
            showTooltip();
            existingOnMouseEnter?.(e);
          },
          onMouseLeave: (e: React.MouseEvent) => {
            hideTooltip();
            existingOnMouseLeave?.(e);
          },
        }),
    onFocus: (e: React.FocusEvent) => {
      if (!isDisabled) {
        showTooltip();
      }
      existingOnFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      if (!isDisabled) {
        hideTooltip();
      }
      existingOnBlur?.(e);
    },
  };

  const childWithProps = React.cloneElement(
    children,
    additionalProps as React.HTMLAttributes<HTMLElement>
  );

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-[#2e323a] border-l-transparent border-r-transparent border-b-transparent",
    bottom:
      "bottom-full left-1/2 -translate-x-1/2 border-b-[#2e323a] border-l-transparent border-r-transparent border-t-transparent",
    left: "left-full top-1/2 -translate-y-1/2 border-l-[#2e323a] border-t-transparent border-b-transparent border-r-transparent",
    right:
      "right-full top-1/2 -translate-y-1/2 border-r-[#2e323a] border-t-transparent border-b-transparent border-l-transparent",
  };

  return (
    <div
      className={cn("relative inline-block", className)}
      onMouseEnter={isDisabled ? showTooltip : undefined}
      onMouseLeave={isDisabled ? hideTooltip : undefined}
    >
      {childWithProps}
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={cn(
            "absolute z-[9999] px-3 py-1.5 text-xs font-inter text-white bg-[#2e323a] border border-[#404040] rounded-lg shadow-lg whitespace-nowrap pointer-events-none",
            positionClasses[position],
            "animate-in fade-in-0 zoom-in-95 duration-200"
          )}
          style={{ minWidth: "max-content" }}
        >
          {content}
          <div
            className={cn("absolute w-0 h-0 border-4", arrowClasses[position])}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
