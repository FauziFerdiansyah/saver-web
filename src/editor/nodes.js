// Custom nodes. Names, tags and data-* attributes are identical to the Saver
// extension (src/components/tasks/nodes), so the stored HTML round-trips.
import { Node, mergeAttributes } from "@tiptap/core"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { createLowlight, common } from "lowlight"
import dart from "highlight.js/lib/languages/dart"
import dockerfile from "highlight.js/lib/languages/dockerfile"
import nginx from "highlight.js/lib/languages/nginx"
import powershell from "highlight.js/lib/languages/powershell"

/** Receives clicks on embeds: (kind, attributes including `pos`). Set by the editor host. */
let tapHandler = () => {}
export function setTapHandler(handler) {
  tapHandler = handler
}
function tap(kind, json) {
  tapHandler(kind, JSON.parse(json))
}

const lowlight = createLowlight(common)
lowlight.register({ dart, dockerfile, nginx, powershell })

function stringAttribute(dataName, attrKey, defaultValue = "") {
  return {
    default: defaultValue,
    parseHTML: (element) => element.getAttribute(dataName) ?? defaultValue,
    renderHTML: (attributes) => {
      const value = attributes[attrKey]
      if (value === undefined || value === null || value === "") return {}
      return { [dataName]: String(value) }
    },
  }
}

function boolAttribute(dataName, attrKey) {
  return {
    default: false,
    parseHTML: (element) => element.getAttribute(dataName) === "true",
    renderHTML: (attributes) => (attributes[attrKey] ? { [dataName]: "true" } : {}),
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Inline chip node view; a tap is forwarded to the native side with the node's attributes. */
function chipView(kind, render) {
  return ({ node, getPos }) => {
    const dom = el("span", `echip echip-${kind}`)
    dom.contentEditable = "false"
    let attrs = node.attrs
    const paint = () => {
      dom.replaceChildren(...render(attrs))
    }
    paint()
    dom.addEventListener("click", (event) => {
      event.preventDefault()
      tap(kind, JSON.stringify({ ...attrs, pos: typeof getPos === "function" ? getPos() : -1 }))
    })
    return {
      dom,
      update(next) {
        if (next.type.name !== node.type.name) return false
        attrs = next.attrs
        paint()
        return true
      },
    }
  }
}

export const DATE_FORMATS = ["full", "date-time", "date", "short-date-time", "short-date", "numeric", "time", "time-seconds"]

export function formatDateStamp(timestamp, format) {
  const date = new Date(Number(timestamp) || Date.now())
  const fmt = (options) => new Intl.DateTimeFormat("id-ID", options).format(date)
  const dateLong = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const dateShort = fmt({ day: "numeric", month: "short", year: "numeric" })
  const time = fmt({ hour: "2-digit", minute: "2-digit", hour12: false })
  const timeSeconds = fmt({ hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  switch (format) {
    case "date-time": return `${dateLong} · ${time}`
    case "date": return dateLong
    case "short-date-time": return `${dateShort}, ${time}`
    case "short-date": return dateShort
    case "numeric": return fmt({ day: "2-digit", month: "2-digit", year: "numeric" })
    case "time": return time
    case "time-seconds": return timeSeconds
    default: return `${dateLong} · ${timeSeconds}`
  }
}

export const JiraTicket = Node.create({
  name: "jiraTicket",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      issueKey: stringAttribute("data-issue-key", "issueKey"),
      summary: stringAttribute("data-summary", "summary"),
      status: stringAttribute("data-status", "status"),
      statusCategory: stringAttribute("data-status-category", "statusCategory", "unknown"),
      issueType: stringAttribute("data-issue-type", "issueType"),
      priority: stringAttribute("data-priority", "priority"),
      assignee: stringAttribute("data-assignee", "assignee"),
      url: stringAttribute("data-url", "url"),
    }
  },
  parseHTML() {
    return [{ tag: "span[data-jira-ticket]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const key = node.attrs.issueKey || "JIRA"
    const status = node.attrs.status
    return ["span", mergeAttributes(HTMLAttributes, { "data-jira-ticket": "", class: "saver-embed-static" }), status ? `${key} · ${status}` : key]
  },
  addNodeView() {
    return chipView("jira", (a) => {
      const parts = [el("span", "echip-key", a.issueKey || "JIRA")]
      if (a.summary) parts.push(el("span", "echip-title", a.summary))
      parts.push(el("span", `echip-badge cat-${a.statusCategory || "unknown"}`, a.status || "memuat"))
      return parts
    })
  },
})

export const GitlabMr = Node.create({
  name: "gitlabMr",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      projectPath: stringAttribute("data-project-path", "projectPath"),
      iid: stringAttribute("data-iid", "iid"),
      title: stringAttribute("data-title", "title"),
      state: stringAttribute("data-state", "state", "unknown"),
      draft: boolAttribute("data-draft", "draft"),
      author: stringAttribute("data-author", "author"),
      sourceBranch: stringAttribute("data-source-branch", "sourceBranch"),
      targetBranch: stringAttribute("data-target-branch", "targetBranch"),
      url: stringAttribute("data-url", "url"),
    }
  },
  parseHTML() {
    return [{ tag: "span[data-gitlab-mr]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const iid = node.attrs.iid || "?"
    const state = node.attrs.state
    return ["span", mergeAttributes(HTMLAttributes, { "data-gitlab-mr": "", class: "saver-embed-static" }), state && state !== "unknown" ? `!${iid} · ${state}` : `!${iid}`]
  },
  addNodeView() {
    const labels = { opened: "Open", merged: "Merged", closed: "Closed", locked: "Locked", unknown: "memuat" }
    return chipView("gitlab", (a) => {
      const parts = [el("span", "echip-key", `!${a.iid || "?"}`)]
      if (a.title) parts.push(el("span", "echip-title", a.title))
      parts.push(el("span", `echip-badge mr-${a.state || "unknown"}`, a.draft ? "Draft" : labels[a.state] || a.state))
      return parts
    })
  },
})

export const NoteLink = Node.create({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      refId: stringAttribute("data-ref-id", "refId"),
      refType: stringAttribute("data-ref-type", "refType", "week"),
      label: stringAttribute("data-label", "label"),
    }
  },
  parseHTML() {
    return [{ tag: "span[data-note-link]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-note-link": "", class: "saver-ref-static" }), `↗ ${node.attrs.label || "Tautan"}`]
  },
  addNodeView() {
    return chipView("ref", (a) => [el("span", "echip-key", "↗"), el("span", "echip-title", a.label || "Tautan")])
  },
})

export const YoutubeEmbed = Node.create({
  name: "youtubeEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      videoId: stringAttribute("data-video-id", "videoId"),
      start: stringAttribute("data-start", "start", "0"),
      title: stringAttribute("data-title", "title"),
    }
  },
  parseHTML() {
    return [{ tag: "div[data-youtube-embed]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const videoId = node.attrs.videoId || ""
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-youtube-embed": "", class: "saver-youtube" }),
      ["a", { href: `https://www.youtube.com/watch?v=${videoId}`, target: "_blank", rel: "noreferrer" }, `▶ YouTube: ${node.attrs.title || videoId}`],
    ]
  },
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = el("div", "youtube")
      dom.contentEditable = "false"
      const img = el("img")
      img.alt = ""
      img.width = 480
      img.height = 270
      img.src = `https://i.ytimg.com/vi/${node.attrs.videoId}/hqdefault.jpg`
      dom.append(img, el("span", "youtube-label", `Video YouTube${node.attrs.title ? `: ${node.attrs.title}` : ""}`))
      dom.addEventListener("click", () => {
        tap("youtube", JSON.stringify({ ...node.attrs, pos: typeof getPos === "function" ? getPos() : -1 }))
      })
      return { dom }
    }
  },
})

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "paragraph+",
  defining: true,
  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (element) => element.getAttribute("data-callout") || "info",
        renderHTML: (attributes) => ({ "data-callout": String(attributes.variant || "info") }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "saver-callout" }), 0]
  },
})

export const StatusBadge = Node.create({
  name: "statusBadge",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      label: stringAttribute("data-status-label", "label", "To Do"),
      color: stringAttribute("data-status-color", "color", "#64748b"),
    }
  },
  parseHTML() {
    return [{ tag: "span[data-status-badge]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const color = String(node.attrs.color || "#64748b")
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-status-badge": "", class: "saver-status-badge", style: `--saver-status-color:${color}` }),
      String(node.attrs.label || "Status"),
    ]
  },
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = el("span", "status-badge", node.attrs.label || "Status")
      dom.contentEditable = "false"
      dom.style.setProperty("--badge", node.attrs.color || "#64748b")
      let attrs = node.attrs
      dom.addEventListener("click", () => {
        tap("status", JSON.stringify({ ...attrs, pos: typeof getPos === "function" ? getPos() : -1 }))
      })
      return {
        dom,
        update(next) {
          if (next.type.name !== "statusBadge") return false
          attrs = next.attrs
          dom.textContent = attrs.label || "Status"
          dom.style.setProperty("--badge", attrs.color || "#64748b")
          return true
        },
      }
    }
  },
})

export const DateStamp = Node.create({
  name: "dateStamp",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      timestamp: stringAttribute("data-date-stamp", "timestamp", String(Date.now())),
      format: stringAttribute("data-date-format", "format", "full"),
      showIcon: boolAttribute("data-date-icon", "showIcon"),
      color: stringAttribute("data-date-color", "color", "#64748b"),
    }
  },
  parseHTML() {
    return [{ tag: "span[data-date-stamp]" }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-date-stamp": a.timestamp, class: "saver-date-stamp", style: `--saver-date-color:${a.color}` }),
      `${a.showIcon ? "📅 " : ""}${formatDateStamp(a.timestamp, a.format)}`,
    ]
  },
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = el("span", "date-stamp")
      dom.contentEditable = "false"
      let attrs = node.attrs
      const paint = () => {
        dom.textContent = formatDateStamp(attrs.timestamp, attrs.format)
        dom.style.setProperty("--stamp", attrs.color || "#64748b")
      }
      paint()
      dom.addEventListener("click", () => {
        tap("date", JSON.stringify({ ...attrs, pos: typeof getPos === "function" ? getPos() : -1 }))
      })
      return {
        dom,
        update(next) {
          if (next.type.name !== "dateStamp") return false
          attrs = next.attrs
          paint()
          return true
        },
      }
    }
  },
})

export const CollapsibleCodeBlock = CodeBlockLowlight.configure({ lowlight }).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-collapsed") === "true",
        renderHTML: (attributes) => (attributes.collapsed ? { "data-collapsed": "true" } : {}),
      },
      theme: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-hl-theme") || null,
        renderHTML: (attributes) => (attributes.theme ? { "data-hl-theme": String(attributes.theme) } : {}),
      },
    }
  },

  // Header with a minimise toggle and the language label. `collapsed` is the
  // same attribute the extension stores, so a block minimised here is also
  // minimised there.
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node
      const dom = el("div", "codeblock")
      const header = el("div", "codeblock-head")
      header.contentEditable = "false"
      const toggle = el("button", "codeblock-toggle")
      toggle.type = "button"
      const language = el("button", "codeblock-lang")
      language.type = "button"
      const count = el("span", "codeblock-count")
      header.append(toggle, language, count)
      const pre = el("pre")
      const code = el("code")
      pre.append(code)
      dom.append(header, pre)

      const paint = () => {
        const collapsed = Boolean(current.attrs.collapsed)
        dom.dataset.collapsed = collapsed ? "true" : "false"
        toggle.textContent = collapsed ? "▸" : "▾"
        toggle.setAttribute("aria-label", collapsed ? "Buka blok kode" : "Ciutkan blok kode")
        toggle.setAttribute("aria-expanded", collapsed ? "false" : "true")
        language.textContent = current.attrs.language || "teks"
        language.setAttribute("aria-label", `Bahasa: ${current.attrs.language || "teks"}. Ketuk untuk mengganti`)
        const lines = current.textContent.split("\n").length
        count.textContent = collapsed ? `${lines} baris disembunyikan` : ""
        code.className = current.attrs.language ? `language-${current.attrs.language}` : ""
      }
      paint()

      toggle.addEventListener("click", (event) => {
        event.preventDefault()
        if (typeof getPos !== "function") return
        const pos = getPos()
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, collapsed: !current.attrs.collapsed }))
      })
      language.addEventListener("click", (event) => {
        event.preventDefault()
        tap("code", JSON.stringify({ language: current.attrs.language || "", pos: typeof getPos === "function" ? getPos() : -1 }))
      })

      return {
        dom,
        contentDOM: code,
        update(next) {
          if (next.type.name !== current.type.name) return false
          current = next
          paint()
          return true
        },
        ignoreMutation(mutation) {
          return header.contains(mutation.target)
        },
      }
    }
  },
})
