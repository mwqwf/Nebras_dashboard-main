# Nebras — Claude Code context

## WHAT

Two codebases for **Nebras**, an Islamic encyclopedic content platform:

| Project | Role | Stack |
|--------|------|--------|
| **Nebras Dashboard** | Admin/moderator web UI: sections, unified content uploads, Noor Library tooling, auth, bridges to legacy Firebase projects (Mshcat / OldApp). | SvelteKit 2, Svelte 5, Tailwind 4, Vite 7, Firebase (Realtime Database, Firestore, Storage), Node ≥ 20. |
| **Nebras Mobile** (`nebras_mobile_app`) | End-user Flutter app: browse/search/play content backed by the same Firebase RTDB paths the dashboard writes. | Flutter/Dart, Firebase RTDB, Provider, Dio. |

There is **no local SQL database**; persistence is cloud Firebase only.

## WHY

- **Dashboard** mutates canonical RTDB trees (`sections_unified`, `content_unified`, `dashboard_uploads`, Noor engine paths) and Storage; mobile **reads** those trees (plus normalizers) for home, search, and playback.
- **Mobile** must not be treated as the source of schema truth for admin-only nodes (`dashboard_users`, `noor_library_*`, etc.).

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
2. **Flutter `lib/features/*`, `lib/core/*`** = client-only: RTDB listeners, caching, playback, **no** SvelteKit server behavior.
3. **Shared contract** = **Firebase shapes and paths**, not duplicated TypeScript/Dart “ORM” layers. When describing fields for Books / Video / Audio, **ground truth is in repo files** (see Progressive disclosure below)—do not invent columns or Firestore/RTDB keys.

### Canonical RTDB paths (both sides)

- **Sections:** `sections_unified` → `main`, `sub`, `secondary` (hierarchy; mobile and dashboard align on this tree).
- **Unified content:**
  - File-like rows (PDF, audio, video files, mirrored uploads): `content_unified/files` **and** parallel `dashboard_uploads` (dashboard writer + mobile home/watch merge these roots).
  - YouTube-style rows: `content_unified/youtube`.
- **YouTube validation** (rules) expects at least `id` + `video_url` on write; **file** nodes accept `id` or `fileId` per rules—verify in code before relying on optional fields.

### Books, Video, Audio (conceptual, not an exhaustive column list)

- **Books (PDF / documents):** Represented as **file** unified rows with `content_type` / metadata treating them as book-like; URLs may appear as `file_url`, `downloadUrl`, `sourceUrl`, etc. **Noor Library** ingests external books into Storage + `content_unified/files` (+ related job/registry paths). Exact merge keys differ from Mshcat/OldApp “book” Firestore documents—do not confuse them.
- **Video:** Primary canonical tree: `content_unified/youtube` (includes `content_type: "youtube"` and `video_url` style fields). Non-YouTube video files live under **files** with appropriate `content_type` and URL fields.
- **Audio:** **Files** branch with `content_type` / URLs such as `audio_url` or generic file URL—see mirror helpers in dashboard code vs `Content.fromJson` / `RtdbUploadNormalizer` on mobile.

If a task touches **Mshcat** or **OldApp**, those are **separate Firebase backends** reached via dashboard **Admin SDK bridges** (`/api/mshcat/*`, `/api/oldapp/*`, `uploadBridge.js`); they are **not** the same documents as `content_unified` on the primary Nebras RTDB.

---

## Progressive disclosure (@ imports)

Do **not** memorize long API route lists or every RTDB field in this file. When work touches that area, **read the referenced files first** (e.g. Claude `@path`):

| Topic | Open these |
|--------|------------|
| Dashboard RTDB writes, sections CRUD, YouTube/files metadata, `CONTENT_ROOT` paths | `@Nebras_dashboard-main/dashboard/src/lib/api/moderator.js` |
| Upload routing, Storage + RTDB fallbacks | `@Nebras_dashboard-main/dashboard/src/lib/api/smartUpload.js`, `@Nebras_dashboard-main/dashboard/src/lib/firebase/storageUpload.js` |
| Noor Library pipeline / engine | `@Nebras_dashboard-main/dashboard/src/lib/server/noorLibrary/` and `@Nebras_dashboard-main/dashboard/src/routes/api/admin/noor-library/` |
| Firebase security / validated keys (reference) | `@Nebras_dashboard-main/firebase-rules-update.txt` |
| Mobile `Content` model + `content_type` parsing | `@archive_mobileapp-master/archive_mobileapp-master/lib/features/content/model/content_model.dart` |
| RTDB → app JSON normalization (`dashboard_uploads` etc.) | `@archive_mobileapp-master/archive_mobileapp-master/lib/core/data/rtdb_upload_normalizer.dart` |
| Which RTDB paths home/search watch | `@archive_mobileapp-master/archive_mobileapp-master/lib/features/home/data/home_datasource.dart`, `@archive_mobileapp-master/archive_mobileapp-master/lib/features/search/data/search_datasource.dart` |
| Server route handlers | `@Nebras_dashboard-main/dashboard/src/routes/api/` |

Arabic comments are common; identifiers remain English—follow existing style.

---

## IMPORTANT: Security isolation (device & secrets)

This environment is an **isolated physical machine used only for development**. You must **never** output, log, track, suggest committing, or echo **hardware fingerprints**, **MAC addresses**, **serial numbers**, **encryption keys**, raw **service account private keys**, **API signing secrets**, or other **cryptographic key material**—whether from tooling, env files, Firebase keys, or user paste. Use placeholders (e.g. `REDACTED`) if illustrating config shape.
