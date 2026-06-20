import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';

interface AppAccount {
  id: string;
  name: string;
  email: string;
}

const FALLBACK_ACCOUNTS: AppAccount[] = [
  { id: 'admin', name: 'Administrator', email: 'admin3@gp4.pl' },
  { id: 'pracownik1', name: 'Pracownik 1', email: 'pracownik1@gp4.pl' },
  { id: 'pracownik2', name: 'Pracownik 2', email: 'pracownik2@gp4.pl' },
  { id: 'pracownik3', name: 'Pracownik 3', email: 'pracownik3@gp4.pl' },
  { id: 'pracownik4', name: 'Pracownik 4', email: 'pracownik4@gp4.pl' },
  { id: 'pracownik5', name: 'Pracownik 5', email: 'pracownik5@gp4.pl' },
];

export default function Login() {
  const [accounts, setAccounts] = useState<AppAccount[]>(FALLBACK_ACCOUNTS);
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const snap = await getDocs(collection(db, 'app_accounts'));
        const loaded: AppAccount[] = [];
        snap.forEach(d => {
          loaded.push({ id: d.id, ...d.data() } as AppAccount);
        });
        
        if (loaded.length > 0) {
          // Check if workers are missing, if less than 2 accounts, seed missing fallbacks
          if (loaded.length < 2) {
             for (const f of FALLBACK_ACCOUNTS) {
                if (!loaded.find(l => l.email === f.email)) {
                   await setDoc(doc(db, 'app_accounts', f.id), f);
                   loaded.push(f);
                }
             }
          }
          // Sort so that admins are typically at the top
          loaded.sort((a, b) => a.name.localeCompare(b.name));
          setAccounts(loaded);
          setSelectedEmail(loaded[0].email);
        } else {
          // If no accounts exist in DB, set the fallback and upload it to DB
          setAccounts(FALLBACK_ACCOUNTS);
          setSelectedEmail(FALLBACK_ACCOUNTS[0].email);
          for (const f of FALLBACK_ACCOUNTS) {
             await setDoc(doc(db, 'app_accounts', f.id), f);
          }
        }
      } catch (err) {
        console.error("Failed to load accounts", err);
        setSelectedEmail(FALLBACK_ACCOUNTS[0].email);
      }
    };
    fetchAccounts();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, selectedEmail, password);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        try {
            // Attempt auto-creation in case the account is totally missing in Firebase Auth (e.g. fallback accounts or newly seeded)
            const { createUserWithEmailAndPassword } = await import('firebase/auth');
            await createUserWithEmailAndPassword(auth, selectedEmail, password);
        } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
               setError('Błędne hasło.');
            } else {
               setError(createErr.message || 'Nieudane logowanie');
            }
        }
      } else {
        setError(err.message || 'Nieudane logowanie');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-slate-800 border border-slate-700 p-8 shadow-2xl">
        <div className="flex justify-center mb-6 text-teal-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A5.99 5.99 0 0 1 8 2.5c2.3 0 4.22 1.33 5.3 3.3a5.99 5.99 0 0 1 10.7 2.55Z"/><path d="M5 16h14"/><path d="M5 12h14"/></svg>
        </div>
        <h2 className="mb-6 text-2xl font-bold text-center text-white">Logowanie</h2>
        {error && <p className="mb-4 text-xs font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl text-center">{error}</p>}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-400 mb-2">Wybierz konto</label>
            <select
              value={selectedEmail}
              onChange={(e) => setSelectedEmail(e.target.value)}
              className="block w-full rounded-xl border border-slate-600 bg-slate-700 text-white p-3.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 font-bold"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.email}>{acc.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-400 mb-2">Hasło dostępu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="block w-full rounded-xl border border-slate-600 bg-slate-700 text-white p-3.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 font-mono tracking-widest font-bold text-center"
              placeholder="Hasło"
            />
          </div>
          <button
            type="submit"
            disabled={loading || accounts.length === 0}
            className="w-full rounded-xl bg-teal-500 p-4 font-bold text-slate-900 transition-colors hover:bg-teal-400 mt-2 disabled:bg-slate-600 disabled:text-slate-400 shadow-md cursor-pointer"
          >
            {loading ? 'Logowanie...' : 'Zaloguj się'}
          </button>
        </form>
      </div>
    </div>
  );
}
