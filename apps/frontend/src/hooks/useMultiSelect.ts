"use client";

import { useCallback, useMemo, useRef } from "react";

export type MultiSelectMode = "single" | "multi";

export type UseMultiSelectArgs<Key extends string, Meta> = {
  selected: Record<Key, Meta>;
  setSelected: (
    next: Record<Key, Meta> | ((prev: Record<Key, Meta>) => Record<Key, Meta>)
  ) => void;
  mode: MultiSelectMode;
  max?: number; // only applies to multi mode
  onChange?: (next: Record<Key, Meta>) => void;
};

export type UseMultiSelectResult<Key extends string, Meta> = {
  selected: Record<Key, Meta>;
  isSelected: (key: Key) => boolean;
  toggle: (key: Key, meta: Meta) => void;
  add: (key: Key, meta: Meta) => void;
  remove: (key: Key) => void;
  clear: () => void;
  replace: (key: Key, meta: Meta) => void;
};

// Minimal, contained helpers operating on caller-provided state.
export function useMultiSelect<Key extends string, Meta>(
  args: UseMultiSelectArgs<Key, Meta>
): UseMultiSelectResult<Key, Meta> {
  const { selected, setSelected, mode, max, onChange } = args;

  // Track insertion order for clamping in multi mode without expensive scans
  const orderRef = useRef<Key[]>([]);

  const isSelected = useCallback(
    (key: Key) => Object.prototype.hasOwnProperty.call(selected, key),
    [selected]
  );

  const emit = useCallback(
    (next: Record<Key, Meta>) => {
      onChange?.(next);
    },
    [onChange]
  );

  const add = useCallback(
    (key: Key, meta: Meta) => {
      if (mode === "single") {
        setSelected({ [key]: meta } as Record<Key, Meta>);
        orderRef.current = [key];
        emit({ [key]: meta } as Record<Key, Meta>);
        return;
      }
      setSelected((prev) => {
        if (prev[key]) return prev; // no-op
        const next: Record<Key, Meta> = { ...prev, [key]: meta };
        orderRef.current.push(key);
        if (typeof max === "number" && max > 0) {
          while (orderRef.current.length > max) {
            const oldest = orderRef.current.shift();
            if (oldest && oldest in next) delete next[oldest];
          }
        }
        emit(next);
        return next;
      });
    },
    [mode, setSelected, max, emit]
  );

  const remove = useCallback(
    (key: Key) => {
      setSelected((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev } as Record<Key, Meta>;
        delete next[key];
        // maintain orderRef
        orderRef.current = orderRef.current.filter((k) => k !== key);
        emit(next);
        return next;
      });
    },
    [setSelected, emit]
  );

  const clear = useCallback(() => {
    orderRef.current = [];
    setSelected({} as Record<Key, Meta>);
    emit({} as Record<Key, Meta>);
  }, [setSelected, emit]);

  const replace = useCallback(
    (key: Key, meta: Meta) => {
      orderRef.current = [key];
      const next = { [key]: meta } as Record<Key, Meta>;
      setSelected(next);
      emit(next);
    },
    [setSelected, emit]
  );

  const toggle = useCallback(
    (key: Key, meta: Meta) => {
      if (isSelected(key)) {
        remove(key);
      } else if (mode === "single") {
        replace(key, meta);
      } else {
        add(key, meta);
      }
    },
    [isSelected, remove, replace, add, mode]
  );

  return useMemo(
    () => ({ selected, isSelected, toggle, add, remove, clear, replace }),
    [selected, isSelected, toggle, add, remove, clear, replace]
  );
}
