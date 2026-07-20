import * as LabelPrimitive from "@radix-ui/react-label";
import { forwardRef, type ComponentProps, type InputHTMLAttributes } from "react";

import { cn } from "../../lib/utils.ts";

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      className={cn(
        "h-8 w-full rounded-[var(--radius-control)] border border-transparent bg-muted/70 px-2.5 text-[13px] transition-colors placeholder:text-muted-foreground/70 hover:bg-muted focus:bg-muted focus:outline-2 focus:outline-ring/50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";
