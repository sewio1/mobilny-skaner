/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

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
        // In a real app we'd fetch the role.
        // For testing, let's hardcode based on email to not rely on DB setup initially
        if (firebaseUser.email?.startsWith('admin') || firebaseUser.email === 'sew.gwardys@gmail.com') {
          role = 'admin';
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

