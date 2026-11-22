/** Reads the TipTap HTML stored in Notes and Tasks without a DOM: stats, plain text, markdown export. */

export interface ContentStats {
  checklistTotal: number
  checklistDone: number
  jiraCount: number
  jiraDone: number
  mrCount: number
  mrMerged: number
  words: number
}

const taskItem = /<li[^>]*data-type="taskItem"[^>]*>/gi
const jiraTag = /<span[^>]*data-jira-ticket[^>]*>/gi
const mrTag = /<span[^>]*data-gitlab-mr[^>]*>/gi
const anyTag = /<[^>]+>/g
const blockEnd = /<\/(p|h[1-6]|li|div|blockquote|pre|tr|table)>|<br\s*\/?>/gi

function attr(tag: string, name: string): string {
  const match = new RegExp(`${name}="([^"]*)"`, "i").exec(tag)
  return match ? decodeEntities(match[1]) : ""
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
}

/** Text lines of the document, one per block. */
export function contentLines(html: string): string[] {
  return decodeEntities(html.replace(blockEnd, "\n").replace(anyTag, ""))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export function plainText(html: string): string {
  return contentLines(html).join(" ")
}

/** First non-empty line: Saver Notes use it as the note title. */
export function contentTitle(html: string): string {
  return (contentLines(html)[0] ?? "").slice(0, 200)
}

/** Body text without the title line, for list previews and search. */
export function contentDescription(html: string): string {
  return contentLines(html).slice(1).join(" ")
}

export function analyzeContent(html: string): ContentStats {
  const tasks = html.match(taskItem) ?? []
  const jira = html.match(jiraTag) ?? []
  const mrs = html.match(mrTag) ?? []
  return {
    checklistTotal: tasks.length,
    checklistDone: tasks.filter((tag) => attr(tag, "data-checked") === "true").length,
    jiraCount: jira.length,
    jiraDone: jira.filter((tag) => attr(tag, "data-status-category") === "done").length,
    mrCount: mrs.length,
    mrMerged: mrs.filter((tag) => attr(tag, "data-state") === "merged").length,
    words: plainText(html).split(/\s+/).filter(Boolean).length,
  }
}

export function youtubeId(text: string): string | null {
  return /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(text)?.[1] ?? null
}

export function jiraKey(text: string): string | null {
  const trimmed = text.trim()
  const fromUrl = /\/browse\/([A-Za-z][A-Za-z0-9]+-\d+)/.exec(trimmed) ?? /[?&]selectedIssue=([A-Za-z][A-Za-z0-9]+-\d+)/.exec(trimmed)
  if (fromUrl) return fromUrl[1].toUpperCase()
  if (/^https?:\/\//i.test(trimmed)) return null
  return /\b([A-Za-z][A-Za-z0-9]+-\d+)\b/.exec(trimmed)?.[1].toUpperCase() ?? null
}

export function gitlabMr(text: string): { projectPath: string; iid: string } | null {
  const match = /^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/.exec(text.trim())
  return match ? { projectPath: match[1], iid: match[2] } : null
}

/** Block-level markdown, enough for sharing a note or feeding the summary prompt. */
export function toMarkdown(html: string): string {
  let text = html
  text = text.replace(/<pre[^>]*><code(?:[^>]*?class="language-([\w+#-]+)")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, language: string | undefined, code: string) =>
    `\n\`\`\`${language ?? ""}\n${code.replace(anyTag, "")}\n\`\`\`\n`,
  )
  text = text
    .replace(jiraTag, (tag) => `[${attr(tag, "data-issue-key")}] ${attr(tag, "data-summary")} (${attr(tag, "data-status") || "?"}) <x>`)
    .replace(/<x>[^<]*<\/span>/g, "")
  text = text
    .replace(mrTag, (tag) => `[MR !${attr(tag, "data-iid")}] ${attr(tag, "data-title")} (${attr(tag, "data-state") || "?"}) <x>`)
    .replace(/<x>[^<]*<\/span>/g, "")
  text = text.replace(/<h([1-3])[^>]*>/gi, (_, level: string) => `\n${"#".repeat(Number(level))} `)
  text = text.replace(/<li[^>]*data-checked="true"[^>]*>/gi, "\n- [x] ")
  text = text.replace(/<li[^>]*data-type="taskItem"[^>]*>/gi, "\n- [ ] ")
  text = text.replace(/<li[^>]*>/gi, "\n- ")
  text = text.replace(/<blockquote[^>]*>/gi, "\n> ")
  text = text.replace(/<hr[^>]*>/gi, "\n---\n")
  text = text.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
  text = text.replace(/<\/(td|th)>/gi, " | ")
  text = text.replace(/<\/(p|h[1-6]|div|blockquote|tr|table|ul|ol)>|<br\s*\/?>/gi, "\n")
  return decodeEntities(text.replace(anyTag, ""))
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export interface SummarySource {
  title: string
  range: string
  markdown: string
}

export const DEFAULT_SUMMARY_INSTRUCTION =
  "Rangkum task mingguan di bawah menjadi satu ringkasan yang rapi: capaian utama, progres tiket/MR, hal yang belum selesai, " +
  "dan rencana berikutnya. Gunakan bahasa Indonesia dan format markdown dengan heading + bullet."

/** Same prompt text the extension builds for "Gabung / rangkum". */
export function summaryPrompt(sources: SummarySource[], instruction: string): string {
  const header = ["Kamu adalah asisten yang merangkum task/catatan kerja mingguan.", "", instruction.trim() || DEFAULT_SUMMARY_INSTRUCTION, "", "Task:"].join("\n")
  const body = sources
    .map((source, index) => [`### Task ${index + 1}: ${source.title}`, `Periode: ${source.range}`, "", source.markdown || "(kosong)"].join("\n"))
    .join("\n\n---\n\n")
  return `${header}\n\n${body}\n`
}
