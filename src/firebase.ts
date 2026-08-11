/**
 * Firebase Application Services
 *
 * Initialises the Firebase application instance and exposes the core service
 * references used throughout The Arbitration Briefings: Firestore (`db`),
 * Authentication (`auth`), and Google Sign-In (`signInWithGoogle`). Also
 * provides a centralised Firestore error-handling utility and re-exports
 * commonly used Firestore SDK symbols for convenience.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, collection, query, where, onSnapshot, getDocFromServer, Timestamp, addDoc, updateDoc, deleteDoc, orderBy, limit, serverTimestamp, getDocs, setDoc, getDoc, arrayUnion, increment } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firestoreDatabaseId = import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'us-west2');
if (import.meta.env.VITE_FUNCTIONS_EMULATOR === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
export { signOut };
const googleProvider = new GoogleAuthProvider();

// Operation types for error handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

/**
 * Enriches a Firestore error with contextual metadata (operation type,
 * document path, and current authentication state) before re-throwing.
 * The enriched payload is logged to the console and thrown as a serialised
 * JSON string, enabling upstream handlers to surface diagnostic detail
 * without requiring access to the original Firebase error object.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
    // Skip logging for other errors, as this is simply a connection test.
  }
}
testConnection();

export { 
  onSnapshot, 
  doc, 
  collection, 
  query, 
  where, 
  Timestamp, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  orderBy, 
  limit,
  serverTimestamp,
  getDocs,
  setDoc,
  getDoc,
  arrayUnion,
  increment
};

/**
 * Triggers Google Sign-In via a browser popup using the Firebase
 * Authentication SDK. Returns a `UserCredential` on successful
 * authentication; throws if the sign-in fails or the popup is
 * dismissed by the user. This function is used exclusively by the
 * site owner to authenticate on the live deployment.
 */
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
