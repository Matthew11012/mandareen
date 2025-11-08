"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface DeleteConfirmationModalProps {
  open: boolean;
  conversationId: number | null;
  deleting: boolean;
  onConfirm: (id: number) => void;
  onCancel: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

export function DeleteConfirmationModal({
  open,
  conversationId,
  deleting,
  onConfirm,
  onCancel,
  triggerRef,
}: DeleteConfirmationModalProps) {
  const deleteModalRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);

  // Keyboard handling for delete confirmation modal
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) {
        onCancel();
        // Return focus to trigger button
        triggerRef.current?.focus();
      }
      if (e.key === "Enter" && e.target === cancelButtonRef.current) {
        e.preventDefault();
        if (!deleting) {
          onCancel();
          triggerRef.current?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Focus first button when modal opens
    setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 100);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, deleting, onCancel, triggerRef]);

  if (!open || conversationId === null) {
    return null;
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => !deleting && onCancel()}
            aria-hidden="true"
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
          >
            <div
              ref={deleteModalRef}
              className="bg-[#1b1f26] border border-[#2e323a] rounded-xl p-6 max-w-sm w-full shadow-xl pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="delete-dialog-title"
                className="text-lg font-semibold text-white mb-2"
              >
                Delete conversation?
              </h2>
              <p
                id="delete-dialog-description"
                className="text-sm text-[#a6a6a6] mb-6"
              >
                This will permanently delete this conversation.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  ref={cancelButtonRef}
                  onClick={() => !deleting && onCancel()}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg border border-[#2e323a] text-[#a6a6a6] hover:bg-[#252932] hover:border-[#404040] transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b1f26]"
                  aria-label="Cancel deletion"
                >
                  Cancel
                </button>
                <button
                  ref={deleteButtonRef}
                  onClick={() => {
                    if (conversationId !== null && !deleting) {
                      onConfirm(conversationId);
                    }
                  }}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b1f26] flex items-center gap-2 min-h-[44px]"
                  aria-label="Confirm deletion"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    "Delete"
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
