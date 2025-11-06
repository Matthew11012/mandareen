"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PopupCoreState<TData> = {
  open: boolean;
  x: number; // relative to container left
  y: number; // relative to container top
  anchorH?: number; // clicked element height for below placement
  data?: TData;
};

export type PopupPosition = { left: number; top: number } | null;

export type UsePopupOptions = {
  containerRef: React.RefObject<HTMLElement | null>;
  toolbarSelector?: string; // sticky toolbar to exclude from visible area
  margin?: number; // clamp margin inside container
};

export function usePopup<TData = unknown>(options: UsePopupOptions) {
  const {
    containerRef,
    toolbarSelector = '[role="toolbar"][aria-label="Lesson controls"]',
    margin = 8,
  } = options;

  const popupRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<PopupCoreState<TData>>({
    open: false,
    x: 0,
    y: 0,
  });
  const [position, setPosition] = useState<PopupPosition>(null);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const node = popupRef.current;
      if (node && !node.contains(e.target as Node)) {
        setState((s) => ({ ...s, open: false }));
      }
    };
    if (state.open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [state.open]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setState((s) => ({ ...s, open: false }));
    };
    if (state.open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.open]);

  // Compute position after render, clamped inside visible region of container
  useEffect(() => {
    if (!state.open) {
      setPosition(null);
      return;
    }
    const modal = popupRef.current;
    const container = containerRef.current;
    if (!modal || !container) return;

    const calculatePosition = () => {
      const modalRect = modal.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      const contW = contRect.width;
      const contH = contRect.height;

      // Visible vertical region accounting for sticky toolbar and viewport
      const toolbar = toolbarSelector
        ? (document.querySelector(toolbarSelector) as HTMLElement | null)
        : null;
      const toolbarRect = toolbar?.getBoundingClientRect();
      const toolbarBottom = toolbarRect ? toolbarRect.bottom : 0;
      const visibleTopInContainer = Math.max(0, toolbarBottom - contRect.top);
      const visibleBottomInContainer = Math.min(
        contH,
        Math.max(0, window.innerHeight - contRect.top)
      );

      // Horizontal: center on anchor, then clamp within container bounds
      let left = state.x - modalRect.width / 2;
      left = Math.max(margin, Math.min(left, contW - modalRect.width - margin));

      // Vertical: decide above/below by available space within visible region
      const anchorH = state.anchorH || 0;
      const availableAbove = state.y - visibleTopInContainer - margin;
      const availableBelow =
        visibleBottomInContainer - (state.y + anchorH) - margin;
      let top: number;
      if (modalRect.height <= availableAbove || availableBelow < 0) {
        top = Math.max(
          visibleTopInContainer + margin,
          state.y - modalRect.height - margin
        );
      } else if (modalRect.height <= availableBelow || availableAbove < 0) {
        top = Math.min(
          visibleBottomInContainer - modalRect.height - margin,
          state.y + anchorH + margin
        );
      } else {
        top = Math.min(
          visibleBottomInContainer - modalRect.height - margin,
          Math.max(visibleTopInContainer + margin, state.y + anchorH + margin)
        );
      }

      setPosition({ left, top });
    };

    // Use requestAnimationFrame to ensure DOM is ready, then calculate and attach listeners
    const setupListeners = () => {
      calculatePosition();
      window.addEventListener("resize", calculatePosition, { passive: true });
      window.addEventListener("scroll", calculatePosition, { passive: true });
      container.addEventListener("scroll", calculatePosition);
    };
    const rafId = requestAnimationFrame(setupListeners);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", calculatePosition);
      window.removeEventListener("scroll", calculatePosition);
      container.removeEventListener("scroll", calculatePosition);
    };
  }, [
    state.open,
    state.x,
    state.y,
    state.anchorH,
    containerRef,
    toolbarSelector,
    margin,
  ]);

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const openWithParams = useCallback((next: PopupCoreState<TData>) => {
    setState({ ...next, open: true });
  }, []);

  const openAtPoint = useCallback(
    (params: {
      clientX: number;
      clientY: number;
      anchorHeight?: number;
      data?: TData;
    }) => {
      const container = containerRef.current?.getBoundingClientRect();
      const x = container ? params.clientX - container.left : params.clientX;
      const y = container ? params.clientY - container.top : params.clientY;
      setState({
        open: true,
        x,
        y,
        anchorH: params.anchorHeight,
        data: params.data,
      });
    },
    [containerRef]
  );

  const openFromElement = useCallback(
    (el: HTMLElement, data?: TData) => {
      const anchor = el.getBoundingClientRect();
      const container = containerRef.current?.getBoundingClientRect();
      const x = container
        ? anchor.left - container.left + anchor.width / 2
        : anchor.left + anchor.width / 2;
      const y = container ? anchor.top - container.top : anchor.top;
      setState({ open: true, x, y, anchorH: anchor.height, data });
    },
    [containerRef]
  );

  return useMemo(
    () => ({
      popupRef,
      state,
      position,
      openWithParams,
      openAtPoint,
      openFromElement,
      close,
    }),
    [position, state, openWithParams, openAtPoint, openFromElement, close]
  );
}
