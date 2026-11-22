import type { CSSProperties } from "react"

/*
 * Lucide icons (ISC License, Copyright (c) Lucide Contributors), rendered from
 * lucide.json, the same asset the Android app ships. The whole set is needed
 * because Lucide icon names are stored in Firestore (categories, Work cards and
 * columns), so any name can arrive at runtime.
 */
interface Bundle {
  names: Record<string, string>
  icons: Record<string, string[]>
}

let bundle: Bundle = { names: {}, icons: {} }

export async function loadIcons(): Promise<void> {
  bundle = (await import("./lucide.json")).default as Bundle
}

export function hasIcon(name: string): boolean {
  return name in bundle.names
}

export function iconNames(): string[] {
  return Object.keys(bundle.names).sort()
}

interface IconProps {
  name: string
  size?: number
  /** Only for icons that stand alone; icons next to a text label stay hidden from screen readers. */
  label?: string
  className?: string
  style?: CSSProperties
}

/** Unknown names fall back to Bookmark, the same fallback the extension uses. */
export function Icon({ name, size = 20, label, className, style }: IconProps) {
  const file = bundle.names[name] ?? bundle.names.Bookmark
  const paths = file ? bundle.icons[file] : undefined
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths?.map((d, index) => <path key={index} d={d} />)}
    </svg>
  )
}
