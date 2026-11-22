import { initializeApp } from "firebase/app"
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
} from "firebase/auth"
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore"
import { createStore } from "@/lib/store"

const env = import.meta.env

/** Emulator mode never touches the real project: it uses the `demo-saver` project id on localhost. */
export const useEmulator = env.VITE_USE_EMULATOR === "1"

const config = useEmulator
  ? { apiKey: "demo-key", authDomain: "demo-saver.firebaseapp.com", projectId: "demo-saver", appId: "demo-app" }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
      projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
      appId: env.VITE_FIREBASE_APP_ID as string | undefined,
      measurementId: (env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined) || undefined,
    }

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)
export const firebaseProjectId = config.projectId ?? ""

export interface SaverUser {
  uid: string
  email: string
  name: string
  photoUrl: string
}

export type AuthState = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: SaverUser }

export const authStore = createStore<AuthState>(firebaseConfigured ? { status: "loading" } : { status: "signedOut" })

let auth: Auth | null = null
let firestore: Firestore | null = null

if (firebaseConfigured) {
  const app = initializeApp(config)
  auth = getAuth(app)
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
  if (useEmulator) {
    // Own ports, so this never collides with the Android project's emulators on 9099/8080.
    connectAuthEmulator(auth, `http://127.0.0.1:${Number(env.VITE_EMULATOR_AUTH_PORT) || 9199}`, { disableWarnings: true })
    connectFirestoreEmulator(firestore, "127.0.0.1", Number(env.VITE_EMULATOR_FIRESTORE_PORT) || 8180)
  }
  onAuthStateChanged(auth, (user) => {
    authStore.set(
      user
        ? {
            status: "signedIn",
            user: { uid: user.uid, email: user.email ?? "", name: user.displayName ?? "", photoUrl: user.photoURL ?? "" },
          }
        : { status: "signedOut" },
    )
  })
}

export const db = firestore

export function currentUid(): string | null {
  const state = authStore.get()
  return state.status === "signedIn" ? state.user.uid : null
}

function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? ""
  switch (code) {
    case "auth/popup-blocked":
      return "Browser memblokir jendela masuk Google. Izinkan pop-up untuk situs ini, lalu coba lagi."
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Jendela masuk ditutup sebelum selesai. Coba lagi."
    case "auth/unauthorized-domain":
      return `Domain ${location.hostname} belum diizinkan. Tambahkan di Firebase Console, Authentication, Settings, Authorized domains.`
    case "auth/operation-not-allowed":
      return "Masuk dengan Google belum diaktifkan di Firebase Console, Authentication, Sign-in method."
    case "auth/network-request-failed":
      return "Tidak ada koneksi. Periksa internet lalu coba lagi."
    default:
      return (error as Error | null)?.message || "Gagal masuk dengan Google."
  }
}

/** Returns an error message to show, or null on success. */
export async function signInWithGoogle(): Promise<string | null> {
  if (!auth) return "Firebase belum dikonfigurasi."
  try {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: "select_account" })
    await signInWithPopup(auth, provider)
    return null
  } catch (error) {
    console.error("Google sign-in failed", error)
    return authErrorMessage(error)
  }
}

/** Local Firebase emulator only: the same fixed test account the Android sandbox build uses. */
export async function signInEmulator(): Promise<string | null> {
  if (!auth || !useEmulator) return "Mode emulator tidak aktif."
  const email = "tester@saver.local"
  const password = "saver-emulator"
  try {
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      const code = (error as { code?: string }).code ?? ""
      if (!["auth/user-not-found", "auth/invalid-credential", "auth/wrong-password"].includes(code)) throw error
      await createUserWithEmailAndPassword(auth, email, password)
    }
    return null
  } catch (error) {
    console.error("Emulator sign-in failed", error)
    return "Emulator Firebase tidak bisa dihubungi. Jalankan emulator auth dan firestore lebih dulu."
  }
}

export async function signOut(): Promise<void> {
  if (auth) await firebaseSignOut(auth)
}
