import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-base font-bold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[#FEDB00] text-[#0C463D] font-bold hover:bg-[#FFE633] hover:brightness-110 yellow-glow",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-white/15 bg-white/[0.04] text-[#F0FDF4] hover:bg-white/[0.08] hover:border-white/25 backdrop-blur-sm",
        secondary:
          "bg-white/[0.06] text-[#F0FDF4] border border-white/10 hover:bg-white/[0.10]",
        ghost:
          "text-[#86EFAC] hover:bg-white/[0.06] hover:text-[#F0FDF4]",
        link: "text-[#FEDB00] underline-offset-4 hover:underline",
        accent:
          "bg-[#FEDB00] text-[#0C463D] hover:bg-[#FFE633] font-extrabold yellow-glow",
      },
      size: {
        default: "h-14 px-6 py-3",
        sm: "h-10 rounded-xl px-4",
        lg: "h-16 rounded-2xl px-10",
        icon: "h-14 w-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
