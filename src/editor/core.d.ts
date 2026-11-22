export interface EditorState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  code: boolean
  heading: number
  bullet: boolean
  ordered: boolean
  task: boolean
  quote: boolean
  codeBlock: boolean
  callout: boolean
  table: boolean
  link: string
  canUndo: boolean
  canRedo: boolean
}

export type TapData = Record<string, unknown> & { pos?: number }

export interface SaverEditor {
  setContent(html: string): void
  getHTML(): string
  setEditable(value: boolean): void
  run(name: string, arg?: Record<string, unknown>): void
  updateAt(pos: number, attrs: Record<string, unknown>): void
  deleteAt(pos: number): void
  updateRefLabels(labels: Record<string, string>): void
  hasPending(): boolean
  flush(): void
  focus(): void
  destroy(): void
}

export function createSaverEditor(options: {
  element: HTMLElement
  placeholder?: string
  onChange: (html: string, title: string) => void
  onState: (state: EditorState) => void
  onTap: (kind: string, data: TapData) => void
}): SaverEditor

export function parseYoutubeId(text: string): string | null
export const DATE_FORMATS: string[]
export function formatDateStamp(timestamp: number | string, format: string): string
