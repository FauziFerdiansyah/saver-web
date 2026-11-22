const MS_DAY = 86400000

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
const MONTHS_LONG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts))
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.getTime()
}

export function endOfWeek(ts: number): number {
  return endOfDay(startOfWeek(ts) + 6 * MS_DAY)
}

export function addWeeks(ts: number, count: number): number {
  return startOfWeek(ts) + count * 7 * MS_DAY
}

export function getIsoWeekNumber(ts: number): number {
  const d = new Date(startOfDay(ts))
  const day = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() + 4 - day)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - yearStart.getTime()) / MS_DAY + 1) / 7)
}

export function getIsoWeekYear(ts: number): number {
  const d = new Date(startOfDay(ts))
  const day = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() + 4 - day)
  return d.getFullYear()
}

export function formatWeekRange(weekStart: number, weekEnd: number): string {
  const a = new Date(weekStart)
  const b = new Date(weekEnd)
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const sameYear = a.getFullYear() === b.getFullYear()

  if (sameMonth) {
    return `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`
  }
  if (sameYear) {
    return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`
  }
  return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`
}

const DAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]

export function formatWeekRangeLong(weekStart: number, weekEnd: number): string {
  const a = new Date(weekStart)
  const b = new Date(weekEnd)
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const sameYear = a.getFullYear() === b.getFullYear()

  if (sameMonth) {
    return `${a.getDate()}–${b.getDate()} ${MONTHS_LONG[b.getMonth()]} ${b.getFullYear()}`
  }
  if (sameYear) {
    return `${a.getDate()} ${MONTHS_LONG[a.getMonth()]} – ${b.getDate()} ${MONTHS_LONG[b.getMonth()]} ${b.getFullYear()}`
  }
  return `${a.getDate()} ${MONTHS_LONG[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS_LONG[b.getMonth()]} ${b.getFullYear()}`
}

export function formatDayRange(weekStart: number, weekEnd: number): string {
  const a = new Date(weekStart)
  const b = new Date(weekEnd)
  return `${DAYS_SHORT[a.getDay()]} ${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${DAYS_SHORT[b.getDay()]} ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`
}

/** Which week of its own month the Monday falls into (1-based). */
export function weekOfMonth(weekStart: number): number {
  const date = new Date(weekStart)
  return Math.floor((date.getDate() - 1) / 7) + 1
}

export function formatWeekRelative(weekStart: number): string {
  const diffWeeks = Math.round((startOfWeek(weekStart) - startOfWeek(Date.now())) / (7 * MS_DAY))
  if (diffWeeks === 0) return "Minggu ini"
  if (diffWeeks === -1) return "Minggu lalu"
  if (diffWeeks === 1) return "Minggu depan"
  if (diffWeeks < 0) return `${Math.abs(diffWeeks)} minggu lalu`
  return `${diffWeeks} minggu lagi`
}

export function formatWeekLabel(weekStart: number): string {
  return `Minggu ${getIsoWeekNumber(weekStart)} · ${getIsoWeekYear(weekStart)}`
}

export function defaultWeekTitle(weekStart: number, weekEnd: number): string {
  const month = MONTHS_LONG[new Date(weekStart).getMonth()]
  return `Task Minggu ${getIsoWeekNumber(weekStart)} · ${formatWeekRangeLong(weekStart, weekEnd)} (${month} pekan ke-${weekOfMonth(weekStart)})`
}

export function formatMonthGroup(ts: number): string {
  const d = new Date(ts)
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}

export function monthShortName(month: number): string {
  return MONTHS_SHORT[month]
}

export function monthLongName(month: number): string {
  return MONTHS_LONG[month]
}

export function weeksOfYear(year: number): { weekStart: number; weekEnd: number; weekNumber: number }[] {
  const weeks: { weekStart: number; weekEnd: number; weekNumber: number }[] = []
  let cursor = startOfWeek(new Date(year, 0, 4).getTime())
  while (getIsoWeekYear(cursor) <= year) {
    if (getIsoWeekYear(cursor) === year) {
      weeks.push({ weekStart: cursor, weekEnd: endOfWeek(cursor), weekNumber: getIsoWeekNumber(cursor) })
    }
    cursor = cursor + 7 * MS_DAY
    if (weeks.length > 54) break
  }
  return weeks
}

export function monthMatrix(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const offset = (first.getDay() + 6) % 7
  const cells: (number | null)[] = Array.from({ length: offset }, () => null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

export const WEEKDAY_INITIALS = ["S", "S", "R", "K", "J", "S", "M"]

export function isCurrentWeek(weekStart: number): boolean {
  return startOfWeek(Date.now()) === startOfWeek(weekStart)
}

export function toDateInputValue(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

export function toDateTimeInputValue(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${toDateInputValue(ts)}T${h}:${min}`
}

export function isoWeekToStart(year: number, week: number): number {
  const jan4 = new Date(year, 0, 4)
  const week1Monday = startOfWeek(jan4.getTime())
  return week1Monday + (week - 1) * 7 * MS_DAY
}

export function toWeekInputValue(ts: number): string {
  return `${getIsoWeekYear(ts)}-W${String(getIsoWeekNumber(ts)).padStart(2, "0")}`
}

export function parseWeekInputValue(value: string): number | null {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const week = Number(match[2])
  if (!year || !week || week > 53) return null
  return isoWeekToStart(year, week)
}

export function formatReminderDate(ts: number): string {
  const d = new Date(ts)
  const today = startOfDay(Date.now())
  const target = startOfDay(ts)
  const time = `${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`

  if (target === today) return `Hari ini ${time}`
  if (target === today + MS_DAY) return `Besok ${time}`
  if (target === today - MS_DAY) return `Kemarin ${time}`
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} ${time}`
}

export function formatSavedTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`
}
