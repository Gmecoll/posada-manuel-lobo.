
"use client"

import * as icons from "lucide-react"

type DynamicIconProps = {
  name: keyof typeof icons
} & icons.LucideProps

export function DynamicIcon({ name, ...props }: DynamicIconProps) {
  const LucideIcon = icons[name]

  if (!LucideIcon) {
    // Fallback icon
    return <icons.HelpCircle {...props} />
  }

  return <LucideIcon {...props} />
}
