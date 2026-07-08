import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const databaseId = (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-youtubestudio-d91a6a8a-7084-4d93-9524-14d7bf189c35';
export const db = getFirestore(app, databaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth();

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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection on startup as requested - moved to app initialization
// Commented out to prevent premature Firebase connection attempts
// We'll call this from the App component after auth initialization
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
    throw error; // Re-throw so calling code can handle it
  }
}

/**
 * Fetch wrapper that automatically attaches the current user's Firebase ID token
 * as a Bearer Authorization header. Used by every /api/* call site so the server
 * can verify the caller with firebase-admin (see server.ts -> authMiddleware).
 *
 * - If `auth.currentUser` is null (signed out), no header is attached. The server
 *   will respond 401 in AUTH_MODE=required; in AUTH_MODE=optional or off it will
 *   proceed without a user identity.
 * - `getIdToken(false)` returns the cached token if still valid (~1h); otherwise
 *   it transparently refreshes. Pass `true` to force a refresh (rarely needed).
 * - Sets Content-Type to application/json if a body is present and the caller
 *   didn't already set one.
 */
export async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken(/*forceRefresh*/ false) : null;
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(input, { ...init, headers });
}
