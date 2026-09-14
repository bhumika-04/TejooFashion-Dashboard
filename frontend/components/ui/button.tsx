import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold shadow-sm ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:saturate-50 active:scale-95",
  {
    variants: {
      variant: {
        default: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:shadow-lg focus-visible:ring-emerald-500",
        destructive: "bg-red-100 text-red-700 hover:bg-red-200 hover:shadow-lg focus-visible:ring-red-500",
        outline: "border-2 border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400 hover:shadow focus-visible:ring-gray-400",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 hover:shadow focus-visible:ring-gray-400",
        ghost: "hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-gray-400",
        link: "text-blue-600 underline-offset-4 hover:underline hover:text-blue-700",
        success: "bg-green-100 text-green-700 hover:bg-green-200 hover:shadow-lg focus-visible:ring-green-500",
      },
      size: {
        default: "h-10 px-5 py-2.5",
        sm: "h-9 rounded-lg px-3.5 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
