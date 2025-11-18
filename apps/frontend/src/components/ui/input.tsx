import React, { useId } from "react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ id, className, type, label, error, icon, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    return (
      <div className="flex flex-col gap-4 mb-8 w-full relative z-10">
        {label && (
          <label
            htmlFor={inputId}
            className="font-inter font-semibold text-xs text-white uppercase tracking-wider"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <input
            id={inputId}
            type={type}
            className={cn(
              // Base styling matching Figma design
              "w-full h-11 px-3 rounded-[14px] border border-[#a6a6a6]/70 bg-transparent",
              "text-white placeholder:text-[#999999] text-sm font-roboto",
              "focus:outline-none focus:ring-2 focus:ring-[#4040f2] focus:border-transparent",
              "transition-colors duration-200",
              // Error state
              error && "border-red-500 focus:ring-red-500",
              // Make room for right-side icon
              icon && "pr-10",
              className
            )}
            ref={ref}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? errorId : undefined}
            {...props}
          />
          {icon && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#a6a6a6]">
              {icon}
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.p
              id={errorId}
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="text-red-500 text-xs font-inter mt-1 overflow-hidden"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
