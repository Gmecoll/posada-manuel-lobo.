"use client"

import * as icons from "lucide-react"

type DynamicIconProps = {
  name: keyof typeof icons
} & icons.LucideProps

export function DynamicIcon({ name, ...props }: DynamicIconProps) {
  const IconComponent = icons[name]

  if (!IconComponent) {
    // Fallback icon
    return <icons.HelpCircle {...props} />
  }

  // The error is caused by a name collision with the `LucideIcon` type exported
  // from the library. Renaming the variable resolves the TypeScript error.
  return <IconComponent {...props} />
}
