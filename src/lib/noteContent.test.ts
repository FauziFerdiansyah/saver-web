import { describe, expect, it } from "vitest"
import { analyzeContent, contentDescription, contentTitle, gitlabMr, jiraKey, toMarkdown, youtubeId } from "./noteContent"

const html =
  '<h2>Rencana</h2><ul data-type="taskList">' +
  '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Rilis build</p></div></li>' +
  '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Review ' +
  '<span data-jira-ticket="" data-issue-key="MIF-12" data-summary="Perbaiki login" data-status="Done" data-status-category="done">MIF-12</span></p></div></li></ul>' +
  '<p>Tom &amp; Jerry</p><pre><code class="language-kotlin">val a = 1</code></pre>'

describe("noteContent", () => {
  it("counts checklist items and embeds", () => {
    expect(analyzeContent(html)).toMatchObject({ checklistTotal: 2, checklistDone: 1, jiraCount: 1, jiraDone: 1, mrCount: 0 })
  })

  it("reads the title and description", () => {
    expect(contentTitle(html)).toBe("Rencana")
    expect(contentDescription("<p>Judul</p><p>Isi &amp; lain</p>")).toBe("Isi & lain")
    expect(contentTitle("")).toBe("")
  })

  it("exports markdown", () => {
    const markdown = toMarkdown(html)
    expect(markdown).toContain("## Rencana")
    expect(markdown).toContain("- [x] Rilis build")
    expect(markdown).toContain("[MIF-12] Perbaiki login (Done)")
    expect(markdown).toContain("```kotlin\nval a = 1\n```")
    expect(markdown).toContain("Tom & Jerry")
  })

  it("recognises embed sources", () => {
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeId("https://example.com")).toBeNull()
    expect(jiraKey("https://x.atlassian.net/browse/abc-12")).toBe("ABC-12")
    expect(jiraKey("mif-7")).toBe("MIF-7")
    expect(jiraKey("https://example.com/page")).toBeNull()
    expect(gitlabMr("https://gitlab.com/grup/proyek/-/merge_requests/12")).toEqual({ projectPath: "grup/proyek", iid: "12" })
  })
})
