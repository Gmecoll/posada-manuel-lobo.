"use client"

import * as icons from "lucide-react"

// Create a new type that excludes non-component exports from lucide-react.
// This is a common pattern for this exact problem.
// We exclude types and utility functions that are not components.
type IconName = Exclude<
  keyof typeof icons,
  | "createLucideIcon"
  | "LucideIcon"
  | "LucideProps"
  | "IconNode"
  | "IconProps"
  | "default"
>

type DynamicIconProps = {
  name: IconName // Use the new, more specific type
} & icons.LucideProps

export function DynamicIcon({ name, ...props }: DynamicIconProps) {
  const IconComponent = icons[name]

  if (!IconComponent) {
    // Fallback icon
    return <icons.HelpCircle {...props} />
  }

  // To satisfy TypeScript when it can't guarantee that IconComponent is a renderable component type,
  // we can cast it to `any` and assign it to a variable starting with a capital letter.
  const Comp = IconComponent as any;
  return <Comp {...props} />;
}
