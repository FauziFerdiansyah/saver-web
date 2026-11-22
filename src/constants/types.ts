import type { BookmarkType } from "@/types"

export const bookmarkTypes: BookmarkType[] = [
  { id: "link", label: "Link", icon: "Link" },
  { id: "document", label: "Document", icon: "FileText" },
  { id: "video", label: "Video", icon: "SquarePlay" },
  { id: "social", label: "Social", icon: "UsersRound" },
  { id: "tool", label: "Tool", icon: "ToolCase" },
  { id: "other", label: "Other", icon: "Shapes" },
]
