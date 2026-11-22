import type { ColorPalette } from "@/types"

export const colorPalettes: ColorPalette[] = [
  { name: "Slate", hex: "#64748b", tailwind: "bg-slate-500" },
  { name: "Red", hex: "#ef4444", tailwind: "bg-red-500" },
  { name: "Orange", hex: "#f97316", tailwind: "bg-orange-500" },
  { name: "Amber", hex: "#f59e0b", tailwind: "bg-amber-500" },
  { name: "Yellow", hex: "#eab308", tailwind: "bg-yellow-500" },
  { name: "Lime", hex: "#84cc16", tailwind: "bg-lime-500" },
  { name: "Green", hex: "#22c55e", tailwind: "bg-green-500" },
  { name: "Emerald", hex: "#10b981", tailwind: "bg-emerald-500" },
  { name: "Teal", hex: "#14b8a6", tailwind: "bg-teal-500" },
  { name: "Cyan", hex: "#06b6d4", tailwind: "bg-cyan-500" },
  { name: "Sky", hex: "#0ea5e9", tailwind: "bg-sky-500" },
  { name: "Blue", hex: "#3b82f6", tailwind: "bg-blue-500" },
  { name: "Indigo", hex: "#6366f1", tailwind: "bg-indigo-500" },
  { name: "Violet", hex: "#8b5cf6", tailwind: "bg-violet-500" },
  { name: "Purple", hex: "#a855f7", tailwind: "bg-purple-500" },
  { name: "Fuchsia", hex: "#d946ef", tailwind: "bg-fuchsia-500" },
  { name: "Pink", hex: "#ec4899", tailwind: "bg-pink-500" },
  { name: "Rose", hex: "#f43f5e", tailwind: "bg-rose-500" },
]

export const defaultColor = colorPalettes[0].hex

export const getRandomColor = () =>
  colorPalettes[Math.floor(Math.random() * colorPalettes.length)].hex
