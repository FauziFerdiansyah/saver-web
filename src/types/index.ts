export interface Bookmark {
  id: string
  url: string
  alias: string
  description: string
  type: string
  category: string
  icon: BookmarkIcon
  color: string
  pinned: boolean
  order: number
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface BookmarkIcon {
  type: "favicon" | "lucide" | "custom"
  value: string
}

export interface SavedKey {
  id: string
  title: string
  keyValue: string
  validUntil: number | null
  lifetime: boolean
  category: string
  icon: BookmarkIcon
  color: string
  note: string
  pinned: boolean
  order: number
  createdAt: number
  updatedAt: number
}

export type SaverView = "links" | "keys" | "authenticator" | "notes" | "tasks" | "work" | "breadcrumb" | "temp"

/** Saver Temp: chat-style scratchpad for snippets that expire on their own. */
export type TempItemKind = "text" | "code" | "image" | "link"

export interface TempReply {
  id: string
  kind: TempItemKind
  /** Short text shown inside the quote block. */
  preview: string
}

/** Jira issue / GitLab MR mentioned in a Temp message, with live metadata. */
export interface TempRef {
  kind: "jira" | "gitlab"
  url: string
  /** Issue key (MIF-1) or !iid, shown as the chip's leading label. */
  label: string
  /** Issue summary or MR title. */
  title: string
  /** Jira status name, or the GitLab state id. */
  status: string
  /** Jira status category, used for badge colour. */
  statusCategory: string
  /** Jira assignee display name, or the GitLab MR author. */
  assignee: string
  /** Jira priority name. */
  priority: string
  /** Jira issue type. */
  issueType: string
  /** Jira story points, shown on the chip instead of the issue type. */
  storyPoints: number | null
  draft: boolean
  /** Set when the last fetch failed, so the chip can offer a retry. */
  error: string
  fetchedAt: number
}

export interface TempLinkPreview {
  title: string
  description: string
  image: string
  domain: string
}

export interface TempItem {
  id: string
  kind: TempItemKind
  /** Message text, code source, image data URL, or the link URL. */
  content: string
  /** Code language, image name, or link title. */
  meta: string
  /** Optional message that accompanies an image. */
  caption: string
  /** Quoted message this one replies to; kept denormalised so deletes are safe. */
  replyTo: TempReply | null
  /** Rich preview for link items, fetched through the CORS proxy. */
  preview: TempLinkPreview | null
  /** Collapsed og: card — a per-message choice, so it survives a reload. */
  previewCollapsed: boolean
  /** Metadata for Jira/GitLab links inside this message. */
  refs: TempRef[]
  /** Pinned items never expire (retention exemption). */
  pinned: boolean
  /** Starred = marked as important; keeps the message like pinning does. */
  starred: boolean
  /** Per-message retention in days; null = follow the app setting. */
  retentionDays: number | null
  /** Epoch ms; null means "kept until deleted by hand". */
  expiresAt: number | null
  createdAt: number
  updatedAt: number
}

export interface Breadcrumb {
  id: string
  url: string
  title: string
  category: string
  description: string
  icon: BookmarkIcon
  color: string
  order: number
  createdAt: number
  updatedAt: number
}

/** A Jira ticket tracked by the Saver Work tab. */
export interface WorkTicket {
  /** Firestore doc id = the Jira issue key (stable, avoids duplicates). */
  id: string
  issueKey: string
  summary: string
  status: string
  statusCategory: "todo" | "indeterminate" | "done" | "unknown"
  issueType: string
  /** Jira labels, shown on the card instead of the issue type. */
  labels: string[]
  priority: string
  assignee: string
  /** Jira `created` as epoch ms. */
  createdAtJira: number
  /** duedate or customfield_10220 as epoch ms, null when absent. */
  dueAt: number | null
  /** Story point estimate from Jira's Story Points field, null when absent. */
  storyPoints: number | null
  url: string
  /** True once a "new ticket" message was pushed to Lark. */
  notifiedNew: boolean
  /** Personal "work on this at" reminder, epoch ms; null when none is set. */
  reminderAt: number | null
  /** Optional note shown in the reminder notification. */
  reminderNote: string
  /** Last time this row was refreshed from Jira. */
  syncedAt: number
  createdAt: number
  updatedAt: number
}

export interface WorkSyncSummary {
  fetched: number
  active: number
  added: number
  updated: number
  removed: number
  at: number
}

export interface Note {
  id: string
  title: string
  content: string
  pinned: boolean
  order: number
  /** Monotonic revision counter, bumped on every write. 0 for legacy docs. */
  rev: number
  /** Device that produced the latest write, used to skip self-conflicts. */
  lastDeviceId: string
  createdAt: number
  updatedAt: number
}

export interface Task {
  id: string
  title: string
  status: "todo" | "in_progress" | "review" | "done"
  content: string
  pinned: boolean
  order: number
  category: string
  color: string
  startDate: number | null
  dueDate: number | null
  linkedNotes: string[]
  linkedLinks: string[]
  linkedKeys: string[]
  codeSnippets: { code: string; language: string }[]
  infoPanels: { type: "info" | "warning" | "success"; text: string }[]
  quotes: string[]
  expandables: { title: string; content: string }[]
  actionItems: { text: string; done: boolean }[]
  images: string[]
  createdAt: number
  updatedAt: number
}

export interface WeeklyReminder {
  id: string
  text: string
  dueAt: number
  done: boolean
}

export interface WeeklyEntry {
  id: string
  title: string
  content: string
  weekStart: number
  weekEnd: number
  tags: string[]
  color: string
  bgColor: string
  pinned: boolean
  order: number
  reminders: WeeklyReminder[]
  linkedEntryIds: string[]
  linkedNoteIds: string[]
  /** Monotonic revision counter, bumped on every write. 0 for legacy docs. */
  rev: number
  /** Device that produced the latest write, used to skip self-conflicts. */
  lastDeviceId: string
  createdAt: number
  updatedAt: number
}

export interface JiraIssueMeta {
  key: string
  summary: string
  status: string
  statusCategory: "todo" | "indeterminate" | "done" | "unknown"
  issueType: string
  priority: string
  assignee: string
  /** Story points, resolved from the instance's Story Points field. */
  storyPoints: number | null
  url: string
}

export interface GitlabMrMeta {
  projectPath: string
  iid: string
  title: string
  state: "opened" | "closed" | "merged" | "locked" | "unknown"
  draft: boolean
  author: string
  sourceBranch: string
  targetBranch: string
  url: string
}

export interface JiraConfig {
  baseUrl: string
  email: string
  token: string
}

export interface GitlabConfig {
  baseUrl: string
  token: string
}

export interface IntegrationSettings {
  jira: JiraConfig
  gitlab: GitlabConfig
}

export interface ApiKeyUsageService {
  baseUrl: string
  email: string
  scope: string
  keyId: string | null
}

export interface ApiKeyUsageSettings {
  jira: ApiKeyUsageService
  gitlab: ApiKeyUsageService
}

export interface UserSettings {
  keysPassword: string | null
  defaultView: SaverView
  tabOrder: SaverView[]
  reminderSound: boolean
  reminderSoundRepeat: number
  reminderSoundVolume: number
  requirePasswordOnCopy: boolean
  requirePasswordOnEdit: boolean
  requirePasswordOnDelete: boolean
  /** Default syntax-highlight theme for Notes/Tasks code blocks that have no per-block theme. */
  codeBlockTheme: string
  /** Saver Temp retention in days; 0 keeps items until deleted by hand. */
  tempRetentionDays: number
  /** Saver Temp bubble palette id. */
  tempBubbleTheme: string
  /** true: Enter sends and Shift+Enter adds a line. false: Enter adds a line. */
  tempEnterSends: boolean
  /** Chat font size in px (12–18). */
  tempFontSize: number
  createdAt: number
  updatedAt: number
}

export interface BookmarkType {
  id: string
  label: string
  icon: string
}

export interface Category {
  id: string
  label: string
  icon: string
}

/** Tabs that own a category list. An empty `scopes` means "all of them". */
export type CategoryScope = "links" | "breadcrumb" | "keys"

/**
 * A user-managed category, synced per user. The static list in
 * `constants/categories.ts` is only the seed for a fresh account and the
 * fallback while the first snapshot is in flight.
 */
export interface SavedCategory {
  id: string
  label: string
  icon: string
  /** Optional accent colour; empty means "no colour". */
  color: string
  /** Tabs this category shows up in; empty = every tab. */
  scopes: CategoryScope[]
  order: number
  createdAt: number
  updatedAt: number
}

export interface ColorPalette {
  name: string
  hex: string
  tailwind: string
}

export interface TOTPAccount {
  id: string
  issuer: string
  accountName: string
  secret: string
  algorithm: "SHA1" | "SHA256" | "SHA512"
  digits: number
  period: number
  otpType: "totp" | "hotp"
  counter: number
  icon: BookmarkIcon
  color: string
  pinned: boolean
  order: number
  createdAt: number
  updatedAt: number
}

export interface OtpAuthUri {
  type: "totp" | "hotp"
  secret: string
  issuer: string
  accountName: string
  algorithm: string
  digits: number
  period: number
  counter?: number
}
