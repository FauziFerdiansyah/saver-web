"""Seeds the local Firebase emulator with sample documents for the test account.

Usage: python3 emulator/seed.py   (emulators must be running,
and "Masuk akun uji" must have been used once in the web app so the account exists)
"""
import datetime
import json
import time
import urllib.request

PROJECT = "demo-saver"
HEADERS = {"Authorization": "Bearer owner", "Content-Type": "application/json"}
BASE = f"http://127.0.0.1:8180/v1/projects/{PROJECT}/databases/(default)/documents"


def call(url, body, method="POST"):
    request = urllib.request.Request(url, data=json.dumps(body).encode(), method=method, headers=HEADERS)
    return json.loads(urllib.request.urlopen(request).read() or b"{}")


def val(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"timestampValue": v[3:]} if v.startswith("ts:") else {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [val(x) for x in v]}}
    return {"mapValue": {"fields": {k: val(x) for k, x in v.items()}}}


def put(path, doc):
    call(f"{BASE}/{path}", {"fields": {k: val(v) for k, v in doc.items()}}, "PATCH")


users = call(f"http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:query", {})
uid = users["userInfo"][0]["localId"]
now = int(time.time() * 1000)
ts = "ts:" + time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
day = 86400000
lucide = lambda name: {"type": "lucide", "value": name}

put(f"bookmarks/{uid}/items/l1", dict(url="https://github.com/CognitionAI", alias="GitHub Cognition", description="Repositori kerja utama", type="tool", category="dev", icon=lucide("Link"), color="#3b82f6", pinned=True, order=0, tags=[], createdAt=ts, updatedAt=ts))
put(f"bookmarks/{uid}/items/l2", dict(url="https://developer.android.com/compose", alias="Dokumentasi Compose", description="", type="document", category="learning", icon=lucide("Link"), color="#22c55e", pinned=False, order=1, tags=[], createdAt=ts, updatedAt=ts))
put(f"keys/{uid}/items/k1", dict(title="Jira API token", keyValue="ATATT3xFfGF0-contoh-token-uji", validUntil=now + 5 * day, lifetime=False, category="dev", icon=lucide("Key"), color="#f97316", note="Dipakai papan Work", pinned=False, order=0, createdAt=ts, updatedAt=ts))
put(f"authenticator/{uid}/items/a1", dict(issuer="GitHub", accountName="fauzi@contoh.dev", secret="JBSWY3DPEHPK3PXP", algorithm="SHA1", digits=6, period=30, otpType="totp", counter=0, color="#8b5cf6", pinned=True, order=0, createdAt=ts, updatedAt=ts))
put(f"breadcrumbs/{uid}/items/b1", dict(url="https://kotlinlang.org/docs/coroutines-guide.html", title="Coroutines guide", category="", description="Baca bagian flow", icon={"type": "favicon", "value": ""}, color="#14b8a6", order=0, createdAt=ts, updatedAt=ts))
put(f"temp/{uid}/items/t1", dict(kind="text", content="Catatan rapat: rilis mundur ke Kamis, cek https://example.com/rilis", meta="", caption="", replyTo=None, preview=None, previewCollapsed=False, refs=[], pinned=False, starred=False, retentionDays=None, expiresAt=now + 7 * day, createdAt="ts:" + time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 86400)), updatedAt=ts))
put(f"temp/{uid}/items/t2", dict(kind="code", content="./gradlew :app:assembleDebug\nadb install -r app-debug.apk", meta="bash", caption="", replyTo={"id": "t1", "kind": "text", "preview": "Catatan rapat: rilis mundur ke Kamis"}, preview=None, previewCollapsed=False, refs=[], pinned=True, starred=False, retentionDays=None, expiresAt=None, createdAt=ts, updatedAt=ts))

html = (
    '<h2>Rencana</h2><ul data-type="taskList">'
    '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Rilis build internal</p></div></li>'
    '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Review '
    '<span data-jira-ticket="" data-issue-key="MIF-12" data-summary="Perbaiki login" data-status="In Progress" data-status-category="indeterminate" data-priority="High" data-url="https://contoh.atlassian.net/browse/MIF-12" class="saver-embed-static">MIF-12 · In Progress</span></p></div></li></ul>'
    '<div data-callout="warning" class="saver-callout"><p>Server staging dimatikan Jumat.</p></div>'
    '<table><tbody><tr><th><p>Hari</p></th><th><p>Fokus</p></th></tr><tr><td><p>Senin</p></td><td><p>Bugfix</p></td></tr></tbody></table>'
    '<pre><code class="language-kotlin">val minggu = Week.startOfWeek(now)</code></pre>'
)
today = datetime.datetime.now()
monday = (today - datetime.timedelta(days=today.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
week_start = int(monday.timestamp() * 1000)
put(f"tasks/{uid}/items/w1", dict(title="Sprint rilis mobile", content=html, weekStart=week_start, weekEnd=week_start + 7 * day - 1, tags=["sprint-12"], color="#f43f5e", bgColor="", pinned=False, order=0, reminders=[{"id": "r1", "text": "Kirim laporan", "dueAt": now + day, "done": False}], linkedEntryIds=[], linkedNoteIds=[], rev=1, lastDeviceId="seed", createdAt=ts, updatedAt=ts))

tickets = [
    ("MIF-12", "Perbaiki login Google di Android", "In Progress", now + day, "High", 3, ["mobile"]),
    ("MIF-9", "Migrasi rules Firestore", "To Do", now - 2 * day, "Medium", 3, []),
    ("MIF-15", "Review desain papan Work", "Code Review", None, "Low", None, []),
]
for key, summary, status, due, priority, points, labels in tickets:
    put(f"work/{uid}/tickets/{key}", dict(issueKey=key, summary=summary, status=status, statusCategory="indeterminate", issueType="Task", labels=labels, priority=priority, assignee="Fauzi", createdAtJira=now - 5 * day, dueAt=due, storyPoints=points, url=f"https://contoh.atlassian.net/browse/{key}", notifiedNew=True, reminderAt=None, reminderNote="", syncedAt=now, createdAt=ts, updatedAt=ts))
print(f"seeded sample data for {uid}")
