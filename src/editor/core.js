// TipTap writing surface for Notes and Tasks. Ported from the Android editor
// bundle (apps/saver/editor/src/main.js): same extensions, same commands, same
// HTML, so documents round-trip between web, Android, and the extension.
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import { Table } from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import Image from "@tiptap/extension-image"
import Highlight from "@tiptap/extension-highlight"
import TextAlign from "@tiptap/extension-text-align"
import { Color, TextStyle } from "@tiptap/extension-text-style"
import {
  Callout,
  CollapsibleCodeBlock,
  DateStamp,
  GitlabMr,
  JiraTicket,
  NoteLink,
  StatusBadge,
  YoutubeEmbed,
  setTapHandler,
} from "./nodes.js"

export { DATE_FORMATS, formatDateStamp } from "./nodes.js"

export function parseYoutubeId(text) {
  const match = text.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)
  return match ? match[1] : null
}

/** A lone pasted URL becomes the matching embed, the same rule as the extension. */
function embedForUrl(text) {
  if (!/^https?:\/\/\S+$/i.test(text)) return null
  const jira = text.match(/\/browse\/([A-Za-z][A-Za-z0-9]+-\d+)/) || text.match(/[?&]selectedIssue=([A-Za-z][A-Za-z0-9]+-\d+)/)
  if (jira) return { type: "jiraTicket", attrs: { issueKey: jira[1].toUpperCase(), url: text } }
  const mr = text.match(/^https?:\/\/[^/]+\/(.+?)\/-\/merge_requests\/(\d+)/)
  if (mr) return { type: "gitlabMr", attrs: { projectPath: mr[1], iid: mr[2], url: text } }
  const videoId = parseYoutubeId(text)
  if (videoId) return { type: "youtubeEmbed", attrs: { videoId } }
  return null
}

const tableOps = {
  colBefore: (c) => c.addColumnBefore(),
  colAfter: (c) => c.addColumnAfter(),
  rowBefore: (c) => c.addRowBefore(),
  rowAfter: (c) => c.addRowAfter(),
  header: (c) => c.toggleHeaderRow(),
  merge: (c) => c.mergeOrSplit(),
  deleteCol: (c) => c.deleteColumn(),
  deleteRow: (c) => c.deleteRow(),
  deleteTable: (c) => c.deleteTable(),
}

const commands = {
  bold: (c) => c.toggleBold(),
  italic: (c) => c.toggleItalic(),
  underline: (c) => c.toggleUnderline(),
  strike: (c) => c.toggleStrike(),
  code: (c) => c.toggleCode(),
  paragraph: (c) => c.setParagraph(),
  heading: (c, arg) => c.toggleHeading({ level: Number(arg.level) }),
  bullet: (c) => c.toggleBulletList(),
  ordered: (c) => c.toggleOrderedList(),
  task: (c) => c.toggleTaskList(),
  quote: (c) => c.toggleBlockquote(),
  codeBlock: (c) => c.toggleCodeBlock(),
  codeLanguage: (c, arg) => c.updateAttributes("codeBlock", { language: arg.language || null }),
  divider: (c) => c.setHorizontalRule(),
  undo: (c) => c.undo(),
  redo: (c) => c.redo(),
  clear: (c) => c.unsetAllMarks().clearNodes(),
  align: (c, arg) => c.setTextAlign(arg.value),
  callout: (c, arg, editor) => (editor.isActive("callout") ? c.updateAttributes("callout", { variant: arg.variant }) : c.wrapIn("callout", { variant: arg.variant })),
  calloutExit: (c) => c.lift("callout"),
  table: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  tableOp: (c, arg) => tableOps[arg.op](c),
  link: (c, arg) => (arg.href ? c.extendMarkRange("link").setLink({ href: arg.href }) : c.extendMarkRange("link").unsetLink()),
  linkText: (c, arg) => c.insertContent({ type: "text", text: arg.text || arg.href, marks: [{ type: "link", attrs: { href: arg.href } }] }),
  image: (c, arg) => c.setImage({ src: arg.src }),
  color: (c, arg) => (arg.value ? c.setColor(arg.value) : c.unsetColor()),
  highlight: (c, arg) => (arg.value ? c.setHighlight({ color: arg.value }) : c.unsetHighlight()),
  insert: (c, arg) => c.insertContent({ type: arg.type, attrs: arg.attrs }).insertContent(arg.inline ? " " : ""),
}


export function createSaverEditor({ element, placeholder = "Tulis di sini", onChange, onState, onTap }) {
  let silent = false
  let changeTimer = null
  let lastState = ""
  let editor = null
  setTapHandler(onTap)

  const title = () => {
    let found = ""
    editor.state.doc.forEach((node) => {
      if (!found && node.textContent.trim()) found = node.textContent.trim()
    })
    return found.slice(0, 200)
  }
  const emitChange = () => {
    clearTimeout(changeTimer)
    changeTimer = null
    onChange(editor.isEmpty ? "" : editor.getHTML(), title())
  }
  const emitState = () => {
    if (!editor) return
    const state = {
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      heading: [1, 2, 3].find((level) => editor.isActive("heading", { level })) || 0,
      bullet: editor.isActive("bulletList"),
      ordered: editor.isActive("orderedList"),
      task: editor.isActive("taskList"),
      quote: editor.isActive("blockquote"),
      codeBlock: editor.isActive("codeBlock"),
      callout: editor.isActive("callout"),
      table: editor.isActive("table"),
      link: editor.isActive("link") ? editor.getAttributes("link").href || "" : "",
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }
    const json = JSON.stringify(state)
    if (json === lastState) return
    lastState = json
    onState(state)
  }

  editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        link: { openOnClick: false, HTMLAttributes: { class: "text-primary underline cursor-pointer", target: "_blank", rel: "noreferrer" } },
      }),
      Placeholder.configure({ includeChildren: true, placeholder: () => placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ allowBase64: true, HTMLAttributes: { class: "rounded-lg max-w-full h-auto" } }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      CollapsibleCodeBlock,
      Callout,
      JiraTicket,
      GitlabMr,
      NoteLink,
      YoutubeEmbed,
      StatusBadge,
      DateStamp,
    ],
    content: "",
    editorProps: {
      attributes: { class: "prose", spellcheck: "false", "aria-label": placeholder, role: "textbox", "aria-multiline": "true" },
      handlePaste(view, event) {
        const text = (event.clipboardData?.getData("text/plain") || "").trim()
        const embed = text && !/\s/.test(text) ? embedForUrl(text) : null
        if (!embed) return false
        editor.chain().focus().insertContent(embed).insertContent(embed.type === "youtubeEmbed" ? "" : " ").run()
        return true
      },
      handleClick(view, pos, event) {
        const link = event.target instanceof Element ? event.target.closest("a[href]") : null
        if (!link) return false
        onTap("link", { href: link.getAttribute("href") })
        return true
      },
    },
    onUpdate() {
      if (silent) return
      clearTimeout(changeTimer)
      changeTimer = setTimeout(emitChange, 400)
    },
    onSelectionUpdate: emitState,
    onTransaction: emitState,
  })

  return {
    setContent(html) {
      silent = true
      editor.commands.setContent(html || "", { emitUpdate: false })
      silent = false
      lastState = ""
      emitState()
    },
    getHTML: () => (editor.isEmpty ? "" : editor.getHTML()),
    setEditable(value) {
      editor.setEditable(Boolean(value))
    },
    run(name, arg = {}) {
      const command = commands[name]
      if (command) command(editor.chain().focus(), arg, editor).run()
    },
    /** Replaces the attributes of the atom node at a known position (edit a badge or stamp). */
    updateAt(pos, attrs) {
      const node = editor.state.doc.nodeAt(pos)
      if (node) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }))
    },
    deleteAt(pos) {
      const node = editor.state.doc.nodeAt(pos)
      if (node) editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize))
    },
    /** Keeps noteLink chips showing the current title of the note or task they point to. */
    updateRefLabels(labels) {
      const tr = editor.state.tr
      let changed = false
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== "noteLink") return
        const label = labels[`${node.attrs.refType}:${node.attrs.refId}`]
        if (label && label !== node.attrs.label) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, label })
          changed = true
        }
      })
      if (!changed) return
      silent = true
      editor.view.dispatch(tr.setMeta("addToHistory", false))
      silent = false
    },
    /** True while an edit is waiting for the debounce, i.e. the surface is ahead of the last onChange. */
    hasPending: () => changeTimer !== null,
    flush() {
      if (changeTimer) emitChange()
    },
    focus() {
      editor.commands.focus()
    },
    destroy() {
      clearTimeout(changeTimer)
      setTapHandler(() => {})
      editor.destroy()
    },
  }
}
