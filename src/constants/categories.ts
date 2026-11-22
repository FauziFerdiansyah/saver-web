import type { Category } from "@/types"

export const categories: Category[] = [
  { id: "general", label: "General", icon: "Globe" },
  { id: "work", label: "Work", icon: "Briefcase" },
  { id: "learning", label: "Learning", icon: "Book" },
  { id: "dev", label: "Development", icon: "Code" },
  { id: "ai", label: "AI", icon: "Sparkles" },
  { id: "ui-ux", label: "UI/UX", icon: "PanelsTopLeft" },
  { id: "design", label: "Design", icon: "Palette" },
  { id: "news", label: "News", icon: "News" },
  { id: "social", label: "Social", icon: "Users" },
  { id: "entertainment", label: "Entertainment", icon: "Movie" },
  { id: "shopping", label: "Shopping", icon: "ShoppingCart" },
  { id: "finance", label: "Finance", icon: "Wallet" },
  { id: "health", label: "Health", icon: "Heart" },
  { id: "other", label: "Other", icon: "Dots" },
]

export const defaultCategory = categories[0].id
