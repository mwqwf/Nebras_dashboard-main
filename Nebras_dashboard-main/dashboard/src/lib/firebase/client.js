/**
 * Firebase (Web) — تهيئة للمتصفح فقط مع SvelteKit.
 * المتغيرات من .env (بادئة VITE_).
 */
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
	getAuth,
	setPersistence,
	browserLocalPersistence,
	GoogleAuthProvider
} from 'firebase/auth';
import { browser } from '$app/environment';

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
	measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

/** @type {import('firebase/app').FirebaseApp | undefined} */
let app;
let authPersistenceReady = false;

/** @returns {import('firebase/app').FirebaseApp | undefined} */
export function getFirebaseApp() {
	if (!browser) return undefined;
	if (!firebaseConfig.apiKey) {
		if (import.meta.env.DEV) {
			console.warn('[Firebase] أضف متغيرات VITE_FIREBASE_* في ملف .env');
		}
		return undefined;
	}
	if (!app) {
		app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
	}
	return app;
}

/** Realtime Database — نفس databaseURL في الإعدادات */
export function getFirebaseDatabase() {
	const application = getFirebaseApp();
	if (!application) return undefined;
	return getDatabase(application);
}

/** Cloud Storage — نفس storageBucket في الإعدادات */
export function getFirebaseStorage() {
	const application = getFirebaseApp();
	if (!application) return undefined;
	return getStorage(application);
}

/**
 * Firebase Auth — نستخدمه لتسجيل الدخول عبر Google.
 * نضبط persistence على localStorage مرّة واحدة حتى تبقى الجلسة بعد التحديث.
 */
export function getFirebaseAuth() {
	const application = getFirebaseApp();
	if (!application) return undefined;
	const auth = getAuth(application);
	if (!authPersistenceReady) {
		authPersistenceReady = true;
		setPersistence(auth, browserLocalPersistence).catch((err) => {
			console.warn('[Firebase Auth] setPersistence failed:', err);
		});
	}
	return auth;
}

/** مزوّد Google جاهز للاستخدام مع signInWithPopup */
export function buildGoogleProvider() {
	const provider = new GoogleAuthProvider();
	provider.addScope('email');
	provider.addScope('profile');
	provider.setCustomParameters({ prompt: 'select_account' });
	return provider;
}

/**
 * ─── OldApp (Secondary Firebase Project) ───────────────────────────────
 * مشروع Firebase الأرشيفي (`mxqp-8d1e8`) يُهيَّأ كتطبيق ثانوي باسم
 * `OldApp` كي لا يتعارض مع اتصال المشروع الأساسي. نستعمله فقط لقراءة
 * Firestore — لا Auth ولا Storage ولا RTDB منه — وذلك من داخل نماذج
 * إدارة الأقسام ليختار المشرف ربطًا صريحًا لقسم Nebras بقسم من OldApp.
 *
 * القيم تُقرأ من `VITE_OLDAPP_*`. إن لم تُضبط نُرجع `undefined` بهدوء
 * وتُخفي الواجهة خيارات OldApp تلقائيًّا.
 */
const OLD_APP_NAME = 'OldApp';
const oldAppConfig = {
	apiKey: import.meta.env.VITE_OLDAPP_API_KEY,
	authDomain: import.meta.env.VITE_OLDAPP_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_OLDAPP_PROJECT_ID,
	storageBucket: import.meta.env.VITE_OLDAPP_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_OLDAPP_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_OLDAPP_APP_ID
};

/** @type {import('firebase/app').FirebaseApp | undefined} */
let oldApp;

/** @returns {import('firebase/app').FirebaseApp | undefined} */
export function getOldAppFirebaseApp() {
	if (!browser) return undefined;
	if (!oldAppConfig.apiKey || !oldAppConfig.projectId) {
		if (import.meta.env.DEV) {
			console.warn(
				'[OldApp] أضف متغيرات VITE_OLDAPP_* في .env لتفعيل ربط المحتوى الأرشيفي'
			);
		}
		return undefined;
	}
	if (!oldApp) {
		const existing = getApps().find((a) => a.name === OLD_APP_NAME);
		oldApp = existing ?? initializeApp(oldAppConfig, OLD_APP_NAME);
		// تجنّب كسر Hot Reload: إن كان مسجّلًا مسبقًا نستعيده عبر getApp.
		if (!oldApp) oldApp = getApp(OLD_APP_NAME);
	}
	return oldApp;
}

/** Firestore من مشروع OldApp (للقراءة فقط من لوحة التحكّم). */
export function getOldAppFirestore() {
	const application = getOldAppFirebaseApp();
	if (!application) return undefined;
	return getFirestore(application);
}

/**
 * ─── MshcatApp (Secondary Firebase Project) ────────────────────────────
 * مشروع `mshcat-fkdl` يُهيَّأ كتطبيق ثانوي ثالث باسم `MshcatApp` بجانب
 * OldApp. نستعمله للقراءة والكتابة في مجموعتَي `categories` و `books`
 * حين يختار المشرف مصدر البيانات = Mshcat عند إنشاء قسم رئيسيّ أو يختار
 * قسمًا أبًا من شجرة Mshcat.
 *
 * القيم تُقرأ من `VITE_MSHCAT_*`. إن لم تُضبط نُرجع `undefined` بهدوء
 * وتُخفى خيارات Mshcat من الواجهة تلقائيًّا.
 */
const MSHCAT_APP_NAME = 'MshcatApp';
const mshcatConfig = {
	apiKey: import.meta.env.VITE_MSHCAT_API_KEY,
	authDomain: import.meta.env.VITE_MSHCAT_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_MSHCAT_PROJECT_ID,
	storageBucket: import.meta.env.VITE_MSHCAT_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_MSHCAT_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_MSHCAT_APP_ID
};

/** @type {import('firebase/app').FirebaseApp | undefined} */
let mshcatApp;

/** @returns {import('firebase/app').FirebaseApp | undefined} */
export function getMshcatFirebaseApp() {
	if (!browser) return undefined;
	if (!mshcatConfig.apiKey || !mshcatConfig.projectId) {
		if (import.meta.env.DEV) {
			console.warn(
				'[Mshcat] أضف متغيرات VITE_MSHCAT_* في .env لتفعيل الكتابة في قاعدة بيانات Mshcat'
			);
		}
		return undefined;
	}
	if (!mshcatApp) {
		const existing = getApps().find((a) => a.name === MSHCAT_APP_NAME);
		mshcatApp = existing ?? initializeApp(mshcatConfig, MSHCAT_APP_NAME);
		if (!mshcatApp) mshcatApp = getApp(MSHCAT_APP_NAME);
	}
	return mshcatApp;
}

/** Firestore من مشروع Mshcat — قراءة/كتابة عبر SDK العميل. */
export function getMshcatFirestore() {
	const application = getMshcatFirebaseApp();
	if (!application) return undefined;
	return getFirestore(application);
}

/** تهيئة Analytics عندما يدعمها المتصفح */
export async function initFirebase() {
	const application = getFirebaseApp();
	if (!application) return;
	if (await isSupported()) {
		getAnalytics(application);
	}
}
