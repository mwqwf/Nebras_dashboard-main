# تكامل Internet Archive في نِبراس — التوثيق الكامل

> هذا التوثيق يصف **محرّك Internet Archive** الذي أضيف إلى لوحة التحكّم.
> الهدف: إثراء كتالوج نبراس بمحتوى مرخّص من `archive.org` **دون أيّ
> اتصال مباشر بين تطبيق Flutter وأرشيف الإنترنت**، وبدون أيّ مؤشّر ظاهر
> للمستخدم النهائي على مصدر المحتوى.

---

## 1. المبدأ الذهبي

| القاعدة | السبب |
|---------|------|
| لا اتصال مباشر بين Flutter و `archive.org` | حماية تجربة المستخدم + متطلّبات Google Play Data Safety. |
| كلّ شيء يمرّ عبر لوحة التحكّم → Firebase Storage → Firestore | يصبح كتالوج التطبيق "نبراس فقط" — روابط `firebasestorage.googleapis.com`. |
| لا يدخل التطبيق إلا محتوى **مرخّص + قابل للتشغيل + مُتحقَّق من سلامته** | لا تظهر عناصر مكسورة أو محظورة قانونياً. |
| كلّ بذرة (تصنيف) تجلب نتائجها **كاملةً** قبل التحوّل للتاليّة | منع جلب جزئي. |
| لا أزرار "Internet Archive" في التطبيق | "trust by default" — المستخدم يرى محتوى نبراس فحسب. |

---

## 2. هيكلة الملفات

### 2.1 الخادم (SvelteKit)

```
dashboard/src/lib/server/internetArchive/
├── playabilityFilter.js   # حارس الصيغ + magic bytes + حدود الحجم
├── licenseFilter.js       # PD / CC0 / CC-BY / CC-BY-SA + trusted collections
├── search.js              # IA Scraping API + Lucene builder + URL helpers
├── fetcher.js             # metadata + اختيار أفضل ملف + كائن preview
├── downloader.js          # تنزيل آمن إلى Buffer + تحقّق magic bytes
├── adminUploader.js       # رفع Storage + مرآة Firestore بنفس schema الموبايل
├── registry.js            # ia_library_registry / ia_library_failures
└── engine.js              # tick + start/stop + factoryReset
```

### 2.2 نقاط API

```
dashboard/src/routes/api/admin/internet-archive/
├── sections/+server.js              # GET — شجرة الأقسام للتصنيف
├── search/+server.js                # POST — صفحة بحث Scraping API
├── preview/+server.js               # POST — معاينة عنصر (لا كتابة)
├── import/+server.js                # POST — استيراد يدوي
└── engine/
    ├── status/+server.js            # GET — config + cursor + stats + log
    ├── start/+server.js             # POST owner-only
    ├── stop/+server.js              # POST owner-only
    ├── tick/+server.js              # POST — دورة واحدة
    ├── seeds/+server.js             # PUT  — تحديث البذور
    └── reset/+server.js             # POST — cursor | factory
```

ومسار Cron الخارجي:

```
dashboard/src/routes/api/cron/internet-archive-tick/+server.js
```

### 2.3 الواجهة

```
dashboard/src/routes/admin/internet-archive/+page.svelte
dashboard/src/lib/api/internetArchive.js
```

---

## 3. مسار البيانات

```
┌──────────────────────────────────────────────────────────────────────┐
│ Internet Archive                                                     │
│   archive.org/services/search/v1/scrape   ← search.js                │
│   archive.org/metadata/{id}               ← search.js / fetcher.js   │
│   archive.org/download/{id}/{file}        ← downloader.js            │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Internet Archive Engine (server)                                     │
│   1) license filter          (licenseFilter.js)                      │
│   2) playability filter      (playabilityFilter.js)                  │
│   3) download → Buffer       (downloader.js + verifyDownloadedBuffer)│
│   4) Storage upload          (adminUploader.js)                      │
│   5) Firestore mirror write  (adminFsWriteFileMirrorBoth)            │
│   6) registry record         (registry.js)                           │
│   7) FCM notify              (engine.js)                             │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Firebase                                                             │
│   Storage:   dashboard/internet-archive/{fileId}/{ts}_{name}         │
│   Firestore: dashboard_uploads/{fileId}                              │
│             content_unified_files/{fileId}                           │
│   RTDB:      ia_library_engine/{config,cursor,stats,log}             │
│             ia_library_registry/{identifier}                         │
│             ia_library_failures/{identifier}                         │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Flutter App (لا تغيير)                                                │
│   يقرأ Firestore كالعادة عبر HomeDatasource/SearchDatasource         │
│   ContentModel.fromJson لا يعرف بـ __provider/__iaIdentifier         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. الصيغ المسموحة (متوافقة مع التطبيق)

تستند القائمة إلى ما يستطيع التطبيق فعلاً تشغيله، لا إلى ما يقبله IA:

| النوع في نبراس | المشغّل في التطبيق | الصيغ المقبولة | الحجم الأقصى |
|---|---|---|---|
| `document` | Syncfusion `SfPdfViewer` | `.pdf` فقط | 500 ميغابايت |
| `audio` | `just_audio` | `.mp3`, `.m4a`, `.aac`, `.wav`, `.ogg`, `.opus`, `.flac` | 250 ميغابايت |
| `video` | `video_player` الرسمي | `.mp4` فقط (H.264 + AAC) | 800 ميغابايت |

أيّ صيغة خارج هذه القوائم — حتى لو وردتْ في `content_model.dart` كقائمة
موسّعة — يرفضها `playabilityFilter.js` قبل التنزيل. كذلك يُرفض كلّ
derivative معروف لا يصلح للعرض: `_bw.pdf`, `_text.pdf`, `_djvu.*`,
`_jp2.zip`, `_meta.xml`, `.torrent`, …

### تحقّق Magic Bytes

بعد تنزيل البايتات يتأكّد `verifyDownloadedBuffer` من:

- **PDF**: يبدأ بـ `%PDF-`.
- **Audio**: ID3 / `fLaC` / `OggS` / `RIFF` / `ftyp` (m4a) / إطار MPEG.
- **Video**: 4 بايت ثم `ftyp`.

ملف لا يطابق magic bytes يُرفض ولا يُكتب في Firebase.

---

## 5. سياسة التراخيص

`licenseFilter.js` يقبل افتراضياً ما يطابق:

- `publicdomain` / `public-domain` / `pd`
- `cc0`
- `cc-by` و `cc-by-sa` (يرفض `cc-by-nc` و `cc-by-nd`)
- `creativecommons.org/licenses/by/*` و `…/by-sa/*`

عناصر بلا حقل ترخيص ترفض، **إلا** إن:
1. كانت ضمن `trustedCollections` المُحدَّدة في إعدادات المحرّك.
2. وكان `allowMissingLicenseInTrustedCollections === true`.

يحتفظ السجلّ بـ `__iaLicense` و `__iaCollection` لكلّ ملف لمراجعة الامتثال.

---

## 6. مخطّط Firestore (متوافق مع schema الموبايل)

ملفّ مستورَد يُكتب بنفس الحقول التي يكتبها `storageUpload.js` يدوياً:

```jsonc
{
  "id": "ia_…",
  "fileId": "ia_…",
  "title": "…",
  "description": "…",
  "author": "…",
  "thumbnail": "https://firebasestorage…",
  "content_type": "document | audio | video",
  "subsection": "<sub.id>",
  "subsection_name": "…",
  "secondary_subsection": "<sec.id> | null",
  "main_section": "<main.id>",
  "main_section_id": "<main.id>",
  "main_section_name": "…",
  "downloadUrl": "https://firebasestorage…",
  "sourceUrl": "https://firebasestorage…",
  "source_url": "…",
  "file_url": "…",
  "audio_url": "…",              // فقط للصوت
  "video_url": "…",              // فقط للفيديو
  "fileType": "application/pdf | audio/mpeg | video/mp4",
  "fileSize": 123456,
  "storagePath": "dashboard/internet-archive/…",
  "createdAt": "<serverTimestamp>",
  "is_listed": true,

  // — علامات داخليّة — لا يقرأها التطبيق —
  "__provider": "internet_archive",
  "__iaIdentifier": "<archive.org identifier>",
  "__iaSourceUrl": "https://archive.org/details/…",
  "__iaLicense": "…",
  "__iaCollection": "…",
  "__iaImportedAt": "ISO8601",
  "__iaOriginalFilename": "…"
}
```

> `content_model.dart` يقرأ `id, title, description, author, thumbnail,
> content_type, sourceUrl, subsection, secondary_subsection, …` فقط.
> الحقول التي تبدأ بـ `__` غير معروفة له ولا تُؤثّر عليه.

---

## 7. RTDB

| المسار | الاستخدام |
|--------|----------|
| `ia_library_engine/config` | `enabled`, `seeds[]`, `tickIntervalMs`, `batchSize`, `scrapeCount`, `trustedCollections[]`, `allowMissingLicenseInTrustedCollections` |
| `ia_library_engine/cursor` | `seedIndex`, `scrapeCursor` |
| `ia_library_engine/stats` | `totalImported`, `totalSkipped`, `totalFailed`, `lastRunAt`, `lastError`, `runsCount`, `consecutiveEmptyRuns` |
| `ia_library_engine/log/{ts}` | آخر 60 إدخال (info / warn / error / success) |
| `ia_library_registry/{identifier}` | `fileId`, `title`, `iaSourceUrl`, `licenseMatched`, `collection`, `hierarchy`, `pickedFileName`, `pickedFileSize`, `nebrasContentType`, `importedAt` |
| `ia_library_failures/{identifier}` | `count`, `firstFailedAt`, `lastFailedAt`, `lastReason`, `lastMessage` |

عتبة الـ blacklist: **3 إخفاقات** على نفس الـ identifier.

---

## 8. شكل البذرة (Seed)

```json
{
  "id": "fiqh-ar-opensource",
  "label": "كتب الفقه العربيّة المفتوحة",
  "q": "فقه إسلامي",
  "nebrasTypes": ["document"],
  "languages": ["Arabic"],
  "collections": ["opensource_arabic", "community_texts"],
  "creators": [],
  "hierarchy": {
    "mainId": "1003",
    "mainName": "الفقه الإسلامي",
    "subId": "2042",
    "subName": "العبادات",
    "secondaryId": null,
    "secondaryName": null
  }
}
```

- لا تصنيف آليّ في النسخة الأولى — كلّ بذرة تكتب في تصنيف **محدّد سلفاً**.
- يجب أن تحتوي البذرة على على الأقل واحد من: `q`, `nebrasTypes`,
  `collections` — وإلا اعتُبرت غير صالحة وحُذفت.

---

## 9. آلية الـ Cron

`vercel.json` يحوي الآن جدولاً ثانياً:

```jsonc
{
  "path": "/api/cron/internet-archive-tick",
  "schedule": "*/15 * * * *"  // كلّ 15 دقيقة
}
```

السلوك:

1. يتحقّق Vercel من `Authorization: Bearer $CRON_SECRET`.
2. الـ endpoint يقرأ `ia_library_engine/config/enabled` — لو
   `false` يخرج فوراً بدون عمل.
3. لو `true` يستدعي `runEngineTick()` مرّة واحدة فقط (تكفي serverless
   execution مدتها ≤ 60 ثانية تقريباً).
4. كلّ tick يعالج `batchSize` عنصر كحدّ أقصى ويحفظ الـ `scrapeCursor`
   لمواصلة نفس البذرة في الـ tick التالي.

---

## 10. متطلّبات بيئة التشغيل (`.env`)

```dotenv
# لازم لتشغيل Firebase Admin (موجود أصلاً).
NEBRAS_STORAGE_BUCKET=nebras-9118c.appspot.com

# لازم لتفعيل Cron tick.
CRON_SECRET=<سر طويل عشوائي>

# اختياري — Topic FCM. القيمة الافتراضية: nebras_all_users
FCM_BROADCAST_TOPIC=nebras_all_users
```

---

## 11. سيناريو استخدام نموذجي

1. المسؤول يفتح `/admin/internet-archive`.
2. يبحث: `q="تفسير ابن كثير"`, `nebrasTypes=document`, `languages=Arabic`.
3. يضغط "معاينة" → ترى `licenseInfo` + `pickedFile.name` + الحجم.
4. يختار التصنيف الهدف (main + sub + secondary).
5. "استيراد إلى نبراس" → خلال ثوانٍ يظهر الكتاب في التطبيق ضمن نفس
   التصنيف، تماماً كأنّ مديراً رفعه يدوياً.
6. لاحقاً يضبط `seeds[]` لتشغيل الاستيراد الآلي عبر `Start` ثم Cron.

---

## 12. عمليّات الصيانة

- **توقيف فوريّ:** زر "Stop" — يطفئ `enabled` ولن يعمل tick التالي.
- **إعادة المؤشّر:** يبدأ المحرّك من أوّل بذرة دون مسّ المحتوى.
- **Factory reset:** يمسح كلّ ما رفعه IA (`__provider === 'internet_archive'`)
  + registry + failures + cursor + stats. لا يلمس الرفع اليدوي.
- **مراجعة عنصر:** افتح RTDB → `ia_library_registry/{identifier}` لرؤية
  الترخيص، الـ fileId، الـ hierarchy.

---

## 13. ما **لا** يفعله المحرّك (محدّدات النسخة الحاليّة)

- لا ينشئ أقساماً جديدة آليّاً — يكتب فقط في أقسام موجودة. أي بذرة
  hierarchy غير صالحة تُحذف عند الحفظ.
- لا يستورد محتوى مقيّداً (loans-only / restricted / privileged).
- لا يستورد derivatives غير مدعومة (DjVu، JP2 zip، …).
- لا يستورد ملفّات أكبر من الحدّ المعلَن لكلّ نوع.
- لا يكتب أيّ شيء في `content_unified_youtube` — العناصر اليوتيوبية في IA
  نادرة وغير موثوقة الصيغة (نتجاوزها).
- لا يفتح أيّ مسار في تطبيق Flutter — التطبيق غير معدَّل البتّة.

---

## 14. مراجع خارجية مفيدة (للمسؤول فقط — ليست للتطبيق)

- IA Scraping API: <https://archive.org/services/search/v1/scrape>
- IA Metadata API: `https://archive.org/metadata/{identifier}`
- IA Search Help (Lucene): <https://archive.org/help/search.php>
- Creative Commons license matrix: <https://creativecommons.org/licenses/>

---

## 15. تذكير أمني

- لا يُعاد تفعيل أيّ من جسور `Mshcat` / `OldApp` / Internet Archive
  legacy stubs.
- لا تُحقن مفاتيح IA في كود العميل أو في Flutter.
- لا يجوز إضافة أيّ زر "Internet Archive" أو WebView إلى `archive.org`
  في التطبيق — هذا تجاوز للسياسة وعطّل ضمان `self-contained`.
