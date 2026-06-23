import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { Sun, Moon } from 'lucide-react';
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
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('mobile_scanner_theme_v1') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    localStorage.setItem('mobile_scanner_theme_v1', theme);
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
      document.body.style.backgroundColor = '#f8fafc'; // slate-50
      document.body.style.color = '#0f172a'; // slate-900
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.style.backgroundColor = '#020617'; // slate-950
      document.body.style.color = '#f1f5f9'; // slate-100
    }
  }, [theme]);

  const isLight = theme === 'light';

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const snap = await getDocs(collection(db, 'app_accounts'));
        const loaded: AppAccount[] = [];
        snap.forEach(d => {
          loaded.push({ id: d.id, ...d.data() } as AppAccount);
        });
        
        if (loaded.length > 0) {
          loaded.sort((a, b) => a.name.localeCompare(b.name));
          setAccounts(loaded);
          setSelectedEmail(loaded[0].email);
        } else {
          setAccounts(FALLBACK_ACCOUNTS);
          setSelectedEmail(FALLBACK_ACCOUNTS[0].email);
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
    <div className={`flex min-h-screen items-center justify-center p-4 transition-colors duration-300 ${isLight ? 'bg-slate-50' : 'bg-slate-900'}`}>
      
      {/* Theme Toggle Button */}
      <button
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        className={`absolute top-4 right-4 p-3 rounded-full transition-colors shadow-sm ${
          isLight ? 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100' : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
        }`}
        title="Zmień motyw"
      >
        {isLight ? <Moon size={20} /> : <Sun size={20} />}
      </button>

      <div className={`w-full max-w-sm rounded-3xl border p-8 shadow-2xl transition-colors duration-300 ${isLight ? 'bg-white border-slate-200 shadow-slate-200/50' : 'bg-slate-800 border-slate-700 shadow-black/40'}`}>
        <div className={`flex justify-center mb-6 ${isLight ? 'text-teal-600' : 'text-teal-400'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A5.99 5.99 0 0 1 8 2.5c2.3 0 4.22 1.33 5.3 3.3a5.99 5.99 0 0 1 10.7 2.55Z"/><path d="M5 16h14"/><path d="M5 12h14"/></svg>
        </div>
        <h2 className={`mb-6 text-2xl font-bold text-center ${isLight ? 'text-slate-800' : 'text-white'}`}>Logowanie</h2>
        {error && <p className="mb-4 text-xs font-bold bg-rose-500/10 border border-rose-500/20 text-rose-500 p-3 rounded-xl text-center">{error}</p>}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className={`block text-sm font-bold mb-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Wybierz konto</label>
            <select
              value={selectedEmail}
              onChange={(e) => setSelectedEmail(e.target.value)}
              className={`block w-full rounded-xl border p-3.5 outline-none focus:ring-1 font-bold transition-colors ${
                isLight 
                  ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500 focus:ring-teal-500' 
                  : 'bg-slate-700 border-slate-600 text-white focus:border-teal-500 focus:ring-teal-500'
              }`}
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.email}>{acc.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={`block text-sm font-bold mb-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Hasło dostępu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`block w-full rounded-xl border p-3.5 outline-none focus:ring-1 font-mono tracking-widest font-bold text-center transition-colors ${
                isLight 
                  ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500 focus:ring-teal-500' 
                  : 'bg-slate-700 border-slate-600 text-white focus:border-teal-500 focus:ring-teal-500'
              }`}
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
