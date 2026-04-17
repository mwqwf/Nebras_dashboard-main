/**
 * Firebase (Web) — تهيئة للمتصفح فقط مع SvelteKit.
 * المتغيرات من .env (بادئة VITE_).
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
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

/** تهيئة Analytics عندما يدعمها المتصفح */
export async function initFirebase() {
	const application = getFirebaseApp();
	if (!application) return;
	if (await isSupported()) {
		getAnalytics(application);
	}
}
