import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import { getFirestore } from "firebase/firestore";
import "firebase/storage";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
let authPersistencePromise = null;
function getFirebaseApp() {
  return void 0;
}
const NEBRAS_FIRESTORE_DATABASE_ID = String("default");
function getNebrasFirestore() {
  const application = getFirebaseApp();
  if (!application) return void 0;
  return getFirestore(application, NEBRAS_FIRESTORE_DATABASE_ID);
}
function getFirebaseAuth() {
  const application = getFirebaseApp();
  if (!application) return void 0;
  const auth = getAuth(application);
  if (!authPersistencePromise) {
    authPersistencePromise = setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn("[Firebase Auth] setPersistence failed:", err);
    });
  }
  return auth;
}
export {
  getNebrasFirestore as a,
  getFirebaseAuth as g
};
