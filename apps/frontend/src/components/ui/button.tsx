import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  // Base styles matching Figma design
  "inline-flex items-center justify-center gap-2.5 rounded-[14px] font-roboto font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        // Primary button (Submit button style from Figma)
        primary:
          "bg-[#656565] text-white text-xs px-2 py-2 shadow-[0px_2px_4px_0px_rgba(0,0,0,0.25)] hover:bg-[#545454] focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2e323a]",

        // Google OAuth button style
        google:
          "bg-transparent border border-[#a6a6a6] text-white text-xs px-2 py-2 rounded-[14px] hover:bg-[#2e323a] focus-visible:ring-[#4040f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2e323a]",

        // Link style for "Sign up here" / "Login here"
        link: "text-[#1f73f2] text-xs font-inter underline-offset-4 hover:underline p-0 h-auto bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0",

        // Start test button style (larger, blue)
        accent:
          "bg-[rgba(64,64,242,0.8)] text-white text-2xl px-4 py-2 hover:bg-[rgba(64,64,242,1)] focus-visible:ring-[#4040f2] focus-visible:ring-offset-2",
      },
      size: {
        default: "h-11 min-w-[131px]",
        sm: "h-10 px-4",
        lg: "h-12 px-6",
        full: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      asChild = false,
      loading,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={loading || disabled}
        {...props}
      >
        {loading ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Loading...
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
