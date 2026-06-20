import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: "AIzaSyBADbUN5RWj_T0yUiTp91ciC70V2udfBho",
  authDomain: "inwentaryzacja-d0df0.firebaseapp.com",
  projectId: "inwentaryzacja-d0df0",
  storageBucket: "inwentaryzacja-d0df0.firebasestorage.app",
  messagingSenderId: "392158517362",
  appId: "1:392158517362:web:e13ca10b47bc7902384aeb",
  measurementId: "G-C04N14Q9MB"
};

export const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const auth = getAuth(app);
