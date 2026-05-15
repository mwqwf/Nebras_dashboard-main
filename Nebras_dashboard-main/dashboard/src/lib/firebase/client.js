/**
 * Firebase (Web) — تهيئة للمتصفح فقط مع SvelteKit.
 * المتغيرات من .env (بادئة VITE_).
 */
import { initializeApp, getApps } from 'firebase/app';
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

/** Cloud Firestore — مشروع نبراس الأساسي (المحتوى الموحّد والأقسام).
 *  ملاحظة مهمّة: قاعدة البيانات في مشروع nebras-9118c معرَّفة باسم `default`
 *  (بدون أقواس)، وهي قاعدة مسمّاة (Named Database). الـ Web SDK افتراضياً
 *  يتّصل بـ `(default)` (مع أقواس) — لذا يجب تمرير اسم القاعدة صراحةً. */
const NEBRAS_FIRESTORE_DATABASE_ID =
	String(import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'default');

export function getNebrasFirestore() {
	const application = getFirebaseApp();
	if (!application) return undefined;
	return getFirestore(application, NEBRAS_FIRESTORE_DATABASE_ID);
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

/** تهيئة Analytics عندما يدعمها المتصفح */
export async function initFirebase() {
	const application = getFirebaseApp();
	if (!application) return;
	if (await isSupported()) {
		getAnalytics(application);
	}
}
