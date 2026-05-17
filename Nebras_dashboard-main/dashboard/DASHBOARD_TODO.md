# تكامل الرفوف والشعبيّة — لوحة التحكّم

النسخة الكاملة مع سياق التطبيق: مستودع `archive_mobileapp-master` → `DASHBOARD_TODO.md`.

## منفّذ في هذا المستودع

- `firestore.rules` — `isEngagementCounterUpdate()` + `aggregates_popular` قراءة عامّة
- `POST /api/admin/aggregates/popularity` — `src/lib/server/aggregatePopularity.js`

## مطلوب منك

1. **نشر القواعد:** `firebase deploy --only firestore:rules`
2. **جدولة التجميع الأسبوعي** (Cron) لاستدعاء POST أعلاه يومياً
3. (اختياري) شارات عدّادات في واجهة إدارة المحتوى
