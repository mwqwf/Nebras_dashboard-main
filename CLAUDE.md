# Nebras — Claude Code context

## WHAT

Two codebases for **Nebras**, an Islamic encyclopedic content platform:

| Project | Role | Stack |
|--------|------|--------|
| **Nebras Dashboard** | Admin/moderator web UI: sections, unified content uploads, Noor Library tooling, auth. | SvelteKit 2, Svelte 5, Tailwind 4, Vite 7, Firebase (Cloud Firestore, Storage), Node ≥ 20. |
| **Nebras Mobile** (`nebras_mobile_app`) | End-user Flutter app: browse/search/play content backed by the same Firestore collections the dashboard writes. | Flutter/Dart, Cloud Firestore, Provider, Dio. |

There is **no local SQL database**; persistence is cloud Firebase only.

> ⛔ **Hard rule.** Nebras must remain a self-contained Firebase product.
> Do **not** add, re-introduce, or call any external web service, scraper, or
> secondary Firebase project (Internet Archive, IslamHouse, Mshcat, OldApp,
> archive.org, …). All content ingestion happens through the dashboard
> uploader, which writes Firebase Storage first then mirrors the row into
> Cloud Firestore. Legacy bridge files exist as **disabled stubs**; never
> re-enable them.

## WHY

- **Dashboard** mutates canonical Firestore collections (`sections_unified`, `content_unified_files`, `content_unified_youtube`, `dashboard_uploads`) and Storage; mobile **reads** those collections (plus normalizers) for home, search, and playback.
- **Mobile** must not be treated as the source of schema truth for admin-only nodes (`dashboard_users` in RTDB, `noor_library_*`, etc.).

## HOW (build & run)

**Dashboard** (from this repo’s root `package.json`, which delegates with `--prefix`):

```bash
npm run dev    # → Nebras_dashboard-main/dashboard, default http://localhost:5173
npm run build
```

Copy `Nebras_dashboard-main/dashboard/.env.example` → `.env` and supply `VITE_FIREBASE_*` plus Admin service account where needed for full auth/data.

**Mobile** (Flutter project lives one level inside the archive folder):

```bash
cd archive_mobileapp-master/archive_mobileapp-master
flutter pub get
flutter run
```

---

## Contextual boundaries (dashboard vs mobile)

1. **SvelteKit `src/routes/api/*` and `hooks.server.js`** = server + moderator APIs, Admin SDK, cookies/session. **Do not** assume the same endpoints or middleware exist in Flutter.
2. **Flutter `lib/features/*`, `lib/core/*`** = client-only: Firestore listeners (`snapshots()`), Hive caching, playback, **no** SvelteKit server behavior.
3. **Shared contract** = **Firestore collection names + document shapes**, not duplicated TypeScript/Dart “ORM” layers. When describing fields for Books / Video / Audio, **ground truth is in repo files** (see Progressive disclosure below) — do not invent columns or keys.

### Canonical Firestore collections (both sides)

- **Sections:** `sections_unified` — a single collection with exactly three documents: `main`, `sub`, `secondary`. Each document holds a flat map of `{id → record}`.
- **Unified content (file-like rows: PDF, audio, video files, mirrored uploads):** `content_unified_files` **and** parallel `dashboard_uploads`. Dashboard writes both in one batch (`writeBatch`); mobile merges them on read.
- **YouTube-style rows:** `content_unified_youtube`.
- **YouTube validation** expects `id` + `video_url` on write; **file** nodes accept `id` or `fileId`. Verify in code before relying on optional fields.

Storage upload path stays the same as before: a file is uploaded to **Firebase Storage** first, then its download URL is persisted on the matching Firestore document (no change in upload flow).

### Books, Video, Audio (conceptual, not an exhaustive column list)

- **Books (PDF / documents):** Represented as rows in `content_unified_files` (mirrored from `dashboard_uploads`) with `content_type` / metadata treating them as book-like; URLs may appear as `file_url`, `downloadUrl`, `sourceUrl`, etc. **Noor Library** ingests books into Storage + `content_unified_files` (+ related job/registry paths in RTDB for the engine state).
- **Video:** Primary tree: `content_unified_youtube` (includes `content_type: "youtube"` and `video_url` style fields). Non-YouTube video files live under `content_unified_files` with appropriate `content_type` and URL fields.
- **Audio:** Under `content_unified_files` with `content_type` / URLs such as `audio_url` or generic file URL — see mirror helpers in dashboard code vs `Content.fromJson` / `RtdbUploadNormalizer` on mobile.

---

## Progressive disclosure (@ imports)

Do **not** memorize long API route lists or every Firestore field in this file. When work touches that area, **read the referenced files first** (e.g. Claude `@path`):

| Topic | Open these |
|--------|------------|
| Dashboard Firestore writes (client SDK), sections CRUD, YouTube/files mirror | `@Nebras_dashboard-main/dashboard/src/lib/firebase/nebrasUnifiedFirestoreClient.js`, `@Nebras_dashboard-main/dashboard/src/lib/api/moderator.js` |
| Dashboard Firestore writes (server / Admin SDK) | `@Nebras_dashboard-main/dashboard/src/lib/server/nebrasUnifiedFirestoreAdmin.js` |
| Upload routing, Storage + Firestore mirror | `@Nebras_dashboard-main/dashboard/src/lib/api/smartUpload.js`, `@Nebras_dashboard-main/dashboard/src/lib/firebase/storageUpload.js` |
| Noor Library pipeline / engine | `@Nebras_dashboard-main/dashboard/src/lib/server/noorLibrary/` and `@Nebras_dashboard-main/dashboard/src/routes/api/admin/noor-library/` |
| Firebase security rules | `@Nebras_dashboard-main/dashboard/firestore.rules`, `@Nebras_dashboard-main/storage.rules`, `@Nebras_dashboard-main/database.rules.json` |
| Mobile `Content` model + `content_type` parsing | `@archive_mobileapp-master/archive_mobileapp-master/lib/features/content/model/content_model.dart` |
| Firestore doc → app JSON normalization (`dashboard_uploads` etc.) | `@archive_mobileapp-master/archive_mobileapp-master/lib/core/data/rtdb_upload_normalizer.dart` |
| Which Firestore collections home/search watch | `@archive_mobileapp-master/archive_mobileapp-master/lib/features/home/data/home_datasource.dart`, `@archive_mobileapp-master/archive_mobileapp-master/lib/features/search/data/search_datasource.dart` |
| Server route handlers | `@Nebras_dashboard-main/dashboard/src/routes/api/` |

Arabic comments are common; identifiers remain English — follow existing style.

---

## IMPORTANT: Security isolation (device & secrets)

This environment is an **isolated physical machine used only for development**. You must **never** output, log, track, suggest committing, or echo **hardware fingerprints**, **MAC addresses**, **serial numbers**, **encryption keys**, raw **service account private keys**, **API signing secrets**, or other **cryptographic key material** — whether from tooling, env files, Firebase keys, or user paste. Use placeholders (e.g. `REDACTED`) if illustrating config shape.
