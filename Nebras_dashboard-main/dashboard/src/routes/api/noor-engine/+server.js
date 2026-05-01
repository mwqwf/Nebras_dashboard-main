/**
 * POST /api/admin/noor-library/engine — تشغيل محرك الجلب.
 * Body: { category, limit?, fetchDetails? }
 *
 * GET /api/admin/noor-library/engine — حالة المحرك + آخر النتائج.
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

let lastRun = null;
let isRunning = false;
let progressLog = [];

export async function GET() {
	return json({
		isRunning,
		lastRun,
		progressLog: progressLog.slice(-50)
	});
}

export async function POST({ request, locals }) {
	if (isRunning) {
		return json({ error: 'المحرك يعمل بالفعل. انتظر حتى ينتهي.' }, { status: 409 });
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { category, limit = 5, fetchDetails = true } = body;
	if (!category) {
		return json({ error: 'category is required' }, { status: 400 });
	}

	const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

	let db;
	try {
		const { getAdminDatabase, isAdminConfigured } = await import('$lib/server/firebaseAdmin.js');
		if (!isAdminConfigured()) {
			return json({ error: 'Firebase Admin غير مُهيّأ — أضف FIREBASE_SERVICE_ACCOUNT_JSON في .env' }, { status: 503 });
		}
		db = getAdminDatabase();
	} catch (err) {
		return json({ error: `Firebase init failed: ${err.message}` }, { status: 503 });
	}

	isRunning = true;
	progressLog = [];

	try {
		const { runPipeline } = await import('$lib/noor-engine/pipeline.js');

		const results = await runPipeline({
			db,
			geminiKey,
			categorySlug: category,
			limit: Math.min(Number(limit) || 5, 50),
			fetchDetails: Boolean(fetchDetails),
			onProgress(event) {
				progressLog.push({ ...event, time: new Date().toISOString() });
			}
		});

		lastRun = {
			category,
			timestamp: new Date().toISOString(),
			stored: results.stored.length,
			errors: results.errors.length,
			sectionsCreated: results.sectionsCreated.length,
			results
		};

		return json({ success: true, ...lastRun });
	} catch (err) {
		lastRun = { category, timestamp: new Date().toISOString(), error: err.message };
		return json({ error: err.message }, { status: 500 });
	} finally {
		isRunning = false;
	}
}
