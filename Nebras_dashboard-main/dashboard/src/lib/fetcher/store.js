/**
 * Fetcher Store — مخزن العمليات في الذاكرة (server-side).
 *
 * يحفظ سجلّات النجاح والأخطاء وحالة العمليات الجارية.
 * في بيئة الإنتاج يُمكن استبداله بقاعدة بيانات دائمة.
 */

/** @type {FetchJob[]} */
let jobs = [];

/** @type {FetchLogEntry[]} */
let successLogs = [];

/** @type {FetchLogEntry[]} */
let errorLogs = [];

let jobCounter = 0;

/**
 * @typedef {object} FetchJob
 * @property {number} id
 * @property {string} providerId
 * @property {string} category
 * @property {'pending'|'running'|'completed'|'failed'} status
 * @property {number} totalFetched
 * @property {number} totalClassified
 * @property {number} totalStored
 * @property {number} totalErrors
 * @property {string} startedAt
 * @property {string|null} completedAt
 * @property {string|null} error
 */

/**
 * @typedef {object} FetchLogEntry
 * @property {number} jobId
 * @property {string} providerId
 * @property {string} timestamp
 * @property {string} externalId
 * @property {string} title
 * @property {string} [category]
 * @property {string} [mainSection]
 * @property {string} [subSection]
 * @property {string} [secondarySection]
 * @property {number} [confidence]
 * @property {string} [error]
 * @property {string} [reasoning]
 */

export function createJob(providerId, category) {
	const job = {
		id: ++jobCounter,
		providerId,
		category,
		status: 'pending',
		totalFetched: 0,
		totalClassified: 0,
		totalStored: 0,
		totalErrors: 0,
		startedAt: new Date().toISOString(),
		completedAt: null,
		error: null
	};
	jobs.unshift(job);
	if (jobs.length > 100) jobs = jobs.slice(0, 100);
	return job;
}

export function updateJob(jobId, patch) {
	const job = jobs.find((j) => j.id === jobId);
	if (job) Object.assign(job, patch);
	return job;
}

export function getJob(jobId) {
	return jobs.find((j) => j.id === jobId) || null;
}

export function listJobs({ providerId, limit = 20 } = {}) {
	let result = jobs;
	if (providerId) result = result.filter((j) => j.providerId === providerId);
	return result.slice(0, limit);
}

export function addSuccessLog(entry) {
	successLogs.unshift({ ...entry, timestamp: new Date().toISOString() });
	if (successLogs.length > 500) successLogs = successLogs.slice(0, 500);
}

export function addErrorLog(entry) {
	errorLogs.unshift({ ...entry, timestamp: new Date().toISOString() });
	if (errorLogs.length > 500) errorLogs = errorLogs.slice(0, 500);
}

export function getSuccessLogs({ providerId, jobId, limit = 50, offset = 0 } = {}) {
	let result = successLogs;
	if (providerId) result = result.filter((l) => l.providerId === providerId);
	if (jobId) result = result.filter((l) => l.jobId === jobId);
	return {
		total: result.length,
		logs: result.slice(offset, offset + limit)
	};
}

export function getErrorLogs({ providerId, jobId, limit = 50, offset = 0 } = {}) {
	let result = errorLogs;
	if (providerId) result = result.filter((l) => l.providerId === providerId);
	if (jobId) result = result.filter((l) => l.jobId === jobId);
	return {
		total: result.length,
		logs: result.slice(offset, offset + limit)
	};
}

export function getStats({ providerId } = {}) {
	const filteredSuccess = providerId
		? successLogs.filter((l) => l.providerId === providerId)
		: successLogs;
	const filteredErrors = providerId
		? errorLogs.filter((l) => l.providerId === providerId)
		: errorLogs;
	const activeJobs = jobs.filter(
		(j) =>
			j.status === 'running' &&
			(!providerId || j.providerId === providerId)
	);

	return {
		totalAdded: filteredSuccess.length,
		totalErrors: filteredErrors.length,
		activeJobs: activeJobs.length,
		lastJobTime:
			jobs.length > 0 ? jobs[0].startedAt : null
	};
}
