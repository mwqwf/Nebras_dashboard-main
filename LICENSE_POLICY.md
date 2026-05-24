# Nebras — Content License Policy

> **Audience**: Google Play store review · DMCA agents · Internal compliance team
> **Last updated**: 2026-05
> **App package**: `com.nebras.mobile`

---

## 1. Content Sources

Nebras Mobile displays **read-only** content sourced exclusively through the
Nebras Dashboard (an admin-controlled web tool). The Dashboard writes to
Firebase Storage + Cloud Firestore; the mobile app **only reads** from these
collections. No client-side fetching of third-party content occurs.

Content enters the Dashboard through two channels:

| Channel | License verification |
|---|---|
| **Manual upload** by authenticated moderators/owners | Manual review; uploader confirms rights |
| **Automated ingestion from Internet Archive** (`archive.org`) | Multi-layer filter — see §2 |

No other ingestion paths exist. Legacy "bridge" files for IslamHouse,
Mshcat, OldApp are intentionally **disabled stubs** and are blocked from
re-enabling by code review.

---

## 2. Internet Archive Ingestion Pipeline

### 2.1 Pre-fetch filter (Lucene query level)

The Scrape API query targets only content explicitly tagged as
publicly-uploaded:

- `mediatype:(texts | audio | movies)`
- `collection:(<curated list>)` — see `engine.js` `DEFAULT_SEEDS`
- `language:(Arabic | English)`

### 2.2 Per-item license filter (server, before download)

File: `dashboard/src/lib/server/internetArchive/licenseFilter.js`

A `HARD GATE` rejects any item with the following signals (regardless of
collection):

```
COPYRIGHT_DENY_PATTERNS = [
  /all\s*rights?\s*reserved/i,
  /copyright(ed)?/i,
  /\bcr\b/i,
  /proprietary/i,
  /non\s*commercial/i,   // CC-BY-NC also rejected
  /no\s*derivatives/i,   // CC-BY-ND also rejected
  /-nc-/i, /-nd-/i, /-nc$/, /-nd$/
]
```

An item is **accepted** only if:

1. `licenseurl` or `license` matches an allowed Public Domain / Creative
   Commons pattern (`publicdomain`, `cc0`, `cc-by`, `cc-by-sa`), **and** the
   pattern is NOT in `COPYRIGHT_DENY_PATTERNS`; **or**
2. The item is in one of the trusted Internet Archive collections
   (`booksbylanguage_arabic`, `folkscanomy_religion`, `audio_islamic`,
   `audio_religion`, `opensource_*`) — these are community/public-domain
   buckets curated by Internet Archive staff. Items in this tier are tagged
   `__license_status: "community_collection"` in Firestore for traceability.

### 2.3 Playability filter (server, before download)

File: `dashboard/src/lib/server/internetArchive/playabilityFilter.js`

Rejects items not playable on the mobile app's licensed players. Only
specific extensions/MIMEs accepted: `.pdf`, `.mp3/.m4a/.aac/.wav/.ogg/.opus/.flac`,
`.mp4`. Derivatives like `_bw.pdf`, `_text.pdf`, `_djvu.xml`, `_jp2.zip`
are explicitly blocked.

### 2.4 Bytestream verification (server, after download)

Verifies magic bytes match the declared file type (e.g., `%PDF-` for
documents, `ID3`/`fLaC`/`OggS` for audio, `ftyp` for video). Size limits
enforced before write to Storage:

- Documents: 50 MB max
- Audio: 30 MB max
- Video: 40 MB max

### 2.5 Compliance metadata stored per document

Every Firestore document created by the IA pipeline carries:

```jsonc
{
  "__provider": "internet_archive",
  "__iaIdentifier": "<archive.org id>",
  "__iaSourceUrl": "https://archive.org/details/<id>",
  "__license_status": "verified_open_license" | "community_collection",
  "__license_url": "<licenseurl from IA>",
  "__license_collection": "<collection name>",
  "__attribution_url": "https://archive.org/details/<id>",
  "__source_provider": "archive.org",
  "__compliance_version": "2026.05",
  "__verified_at": "<ISO timestamp>"
}
```

These fields are **internal only** (the mobile app does not display them),
but they are inspectable by the operator panel
(`/admin/internet-archive`) and exported as audit data on request.

---

## 3. DMCA / Takedown Procedure

### 3.1 Endpoint

`POST /api/admin/internet-archive/dmca` (authenticated, admin role).

Body:

```json
{
  "fileId": "fb_<...>",
  "reason": "<DMCA case # / rights holder>",
  "reporter": "<email or org>"
}
```

Action:

1. Deletes the document from `content_unified_files` and `dashboard_uploads`.
2. Deletes the binary from Firebase Storage (PDF/MP3/MP4 + thumbnail).
3. Adds the IA identifier to `ia_library_dmca_blacklist` — preventing
   re-import by the automated engine indefinitely.
4. Writes an audit log entry to `ia_library_engine/log` with reason,
   reporter, and timestamp.

### 3.2 Public DMCA Contact

Rights holders may submit takedown requests to: **dmca@nebras.app**

Response SLA: 24 hours (acknowledgement), 72 hours (action).

### 3.3 Re-import Protection

The IA engine's `partitionKnownItems` (in `registry.js`) reads the
`ia_library_dmca_blacklist` on every tick and excludes any identifier
present. This guarantees that takedowns are permanent — even if the same
item appears in a future search.

---

## 4. Mobile App Guards

### 4.1 Read-time filter

Both `search_datasource.dart` and `home_datasource.dart` apply
`_isPlayableAndCompliant` before returning content to the UI. An item is
filtered out if:

- `sourceUrl` is null, empty, or not `http(s)://`
- `license_status` / `__license_status` equals `rejected` (**live** — soft
  takedown without deleting the document)
- the current user reported it (`HiddenContentService`, local Hive box
  `hidden_content`; works for guests too)

This guarantees the user never sees a non-compliant or self-reported card.

### 4.1.b Attribution display (live)

The mobile app now surfaces a **curated** subset of compliance metadata in
the content detail screens (`ContentAttribution` widget): source name and
license name, plus a tappable license URL when present. It reads:

- `source_name` / `__source_provider` / `__provider` → friendly source
  (`archive.org` → "Internet Archive", `hindawi` → "مؤسسة هنداوي",
  `noor-library` → "مكتبة نور").
- `license_name` / `license` / `__license` → friendly license name.
- `license_url` / `__license_url` → tappable (opened in external browser).

⚠️ The app never links to `archive.org` (`__attribution_url` is **not**
surfaced as a tappable link — only the CC/public-domain `license_url` is).

### 4.1.c Report → review SLA (live)

When a user reports content, the app shows a notice that the item will be
permanently removed within **24 hours** if the claim is verified, and hides
it from that user immediately regardless of outcome.

### 4.2 Source-of-truth boundary

The mobile app never talks to `archive.org`, `archive.us.archive.org`, or
any other third-party content host. It only reads from
`firebasestorage.googleapis.com/v0/b/nebras-9118c.firebasestorage.app/...`
(our own Storage bucket, populated by the verified pipeline above).

### 4.3 No user-uploaded content

The mobile app has **no upload capability**. Users can only consume
content moderated and ingested through the Dashboard.

---

## 5. Audit Trail (for Google Play / DMCA reviewers)

| What | Where | Retention |
|---|---|---|
| Successful imports | `ia_library_registry` (RTDB) | Indefinite |
| Failed imports + reason | `ia_library_failures` (RTDB) | Indefinite |
| DMCA takedowns | `ia_library_dmca_blacklist` (RTDB) | Indefinite |
| Per-tick log (60 most recent) | `ia_library_engine/log` (RTDB) | Rolling |
| Document license metadata | `content_unified_files/{id}.__*` | Lifetime of document |
| Firebase Storage audit | Google Cloud Audit Logs | 400 days |

---

## 6. Code References

- **License filter**: `Nebras_dashboard-main/dashboard/src/lib/server/internetArchive/licenseFilter.js`
- **Playability filter**: `Nebras_dashboard-main/dashboard/src/lib/server/internetArchive/playabilityFilter.js`
- **Document metadata writer**: `Nebras_dashboard-main/dashboard/src/lib/server/internetArchive/adminUploader.js`
- **DMCA endpoint**: `Nebras_dashboard-main/dashboard/src/routes/api/admin/internet-archive/dmca/+server.js`
- **Orphan cleanup**: `Nebras_dashboard-main/dashboard/src/routes/api/admin/internet-archive/cleanup-orphans/+server.js`
- **Mobile guard**: `archive_mobileapp-master/lib/features/{search,home}/data/*_datasource.dart`

---

## 7. Version History

| Date | Change |
|---|---|
| 2026-05 | Initial policy. Multi-layer copyright guard activated. DMCA endpoint live. Mobile read-time filter live. |
