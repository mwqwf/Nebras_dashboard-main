/**
 * DELETE /api/admin/noor-library/engine/reset — الزرّ النووي.
 *
 * يمسح كلّ ما أنشأه محرك مكتبة نور:
 * 1. أقسام تحمل __createdBy: 'noor_library_engine' (رئيسية/فرعية/ثانوية).
 * 2. ملفات تحمل __provider: 'noor-library' من content_unified/files و dashboard_uploads.
 * 3. أيّ بيانات في noor_library_registry و noor_library_engine/cursor.
 */

import { json } from '@sveltejs/kit';

export async function DELETE({ locals }) {
	let db;
	try {
		const { getAdminDatabase, isAdminConfigured } = await import('$lib/server/firebaseAdmin.js');
		if (!isAdminConfigured()) {
			return json({ error: 'Firebase Admin غير مُهيّأ' }, { status: 503 });
		}
		db = getAdminDatabase();
	} catch (err) {
		return json({ error: `Firebase init: ${err.message}` }, { status: 503 });
	}

	const report = {
		deletedSections: { main: 0, sub: 0, secondary: 0 },
		deletedFiles: 0,
		deletedRegistry: false,
		deletedCursor: false
	};

	try {
		const ENGINE_TAG = 'noor_library_engine';
		const PROVIDER_TAG = 'noor-library';

		// 1. مسح الأقسام التي أنشأها المحرك
		for (const level of ['main', 'sub', 'secondary']) {
			const snap = await db.ref(`sections_unified/${level}`).get();
			if (!snap.exists()) continue;
			const entries = snap.val() || {};
			for (const [id, val] of Object.entries(entries)) {
				if (val?.__createdBy === ENGINE_TAG) {
					await db.ref(`sections_unified/${level}/${id}`).remove();
					report.deletedSections[level]++;
				}
			}
		}

		// 2. مسح الملفات المجلوبة
		for (const root of ['content_unified/files', 'dashboard_uploads']) {
			const snap = await db.ref(root).get();
			if (!snap.exists()) continue;
			const entries = snap.val() || {};
			for (const [id, val] of Object.entries(entries)) {
				if (val?.__provider === PROVIDER_TAG || val?.metadata?.source_provider === PROVIDER_TAG) {
					await db.ref(`${root}/${id}`).remove();
					report.deletedFiles++;
				}
			}
		}

		// 3. مسح noor_library_registry
		const regSnap = await db.ref('noor_library_registry').get();
		if (regSnap.exists()) {
			await db.ref('noor_library_registry').remove();
			report.deletedRegistry = true;
		}

		// 4. مسح noor_library_engine/cursor
		const cursorSnap = await db.ref('noor_library_engine/cursor').get();
		if (cursorSnap.exists()) {
			await db.ref('noor_library_engine/cursor').remove();
			report.deletedCursor = true;
		}

		return json({
			success: true,
			message: 'تمّت إعادة الضبط بنجاح — مُسح كلّ ما أنشأه الروبوت.',
			report
		});
	} catch (err) {
		return json({ error: `Reset failed: ${err.message}`, partialReport: report }, { status: 500 });
	}
}
