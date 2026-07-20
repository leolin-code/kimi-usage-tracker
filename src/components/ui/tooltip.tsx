import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/utils.ts";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ children, ...props }: ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Root delayDuration={300} {...props}>
      {children}
    </TooltipPrimitive.Root>
  );
}

export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn(
          "surface-pop z-50 max-w-72 px-2.5 py-1.5 text-xs text-card-foreground",
          className,
        )}
        sideOffset={sideOffset}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

/** 便捷封装：给一个触发元素加文字 tooltip。 */
export function SimpleTooltip({
  content,
  children,
  side,
}: Readonly<{
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  );
}
