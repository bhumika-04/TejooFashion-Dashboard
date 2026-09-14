import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-2 px-3 py-1 text-xs font-bold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-blue-200 bg-blue-100 text-blue-700 hover:bg-blue-200 shadow-sm",
        secondary: "border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200 shadow-sm",
        destructive: "border-red-200 bg-red-100 text-red-700 hover:bg-red-200 shadow-sm",
        outline: "border-gray-300 text-gray-700 hover:bg-gray-50",
        success: "border-green-200 bg-green-100 text-green-700 hover:bg-green-200 shadow-sm",
        warning: "border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 shadow-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
