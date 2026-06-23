/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { sounds } from './utils/sound';

export type AppUser = {
  uid: string;
  email: string;
  role: 'admin' | 'worker';
};

export const UserContext = React.createContext<AppUser | null>(null);

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch role from Firestore
        let role: 'admin' | 'worker' = 'worker';
        try {
          if (firebaseUser.email) {
            // Bezpieczne zapytanie o profil usera po emailu
            const q = query(collection(db, 'app_accounts'), where('email', '==', firebaseUser.email));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              const data = querySnapshot.docs[0].data();
              if (data.role === 'admin' || data.role === 'worker') {
                role = data.role;
              }
            } else if (firebaseUser.email === 'sew.gwardys@gmail.com' || firebaseUser.email.toLowerCase().includes('admin')) {
              // Zabezpieczenie ratunkowe - twardy admin dla głównego właściciela,
              // i kont testowych, abyś nie stracił dostępu w fazie testów
              role = 'admin';
            }
          }
        } catch (error) {
          console.error("Błąd podczas pobierania roli z Firestore:", error);
        }
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          role
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Blokada przycisku "Wstecz" (Back Button) na urządzeniach mobilnych/skanerach
  useEffect(() => {
    // Push an initial dummy state to history
    window.history.pushState(null, "", window.location.href);

    const handlePopState = (event: PopStateEvent) => {
      // When back is pressed, popstate is triggered. We immediately push a new state to trap the user.
      window.history.pushState(null, "", window.location.href);
      console.log("Zablokowano wyjście ze skanera przyciskiem 'Wstecz'");
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Odblokowanie dźwięków w iOS/Android przy pierwszej interakcji
  useEffect(() => {
    const handleInteraction = () => {
      sounds.unlockAudio();
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchstart', handleInteraction);
    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Wczytywanie...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen selection:bg-teal-500 selection:text-slate-950">
      {user ? (
        <UserContext.Provider value={user}>
          <Dashboard />
        </UserContext.Provider>
      ) : (
        <Login />
      )}
    </div>
  );
}

