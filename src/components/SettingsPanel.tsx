/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Settings, Save, X, ToggleLeft, ToggleRight, Keyboard, Database, Clipboard, Sun, Moon, Users, Trash2, Plus, Loader2 } from 'lucide-react';
import { InventoryConfig } from '../types';
import { sounds } from '../utils/sound';
import { collection, getDocs, setDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

interface SettingsPanelProps {
  config: InventoryConfig;
  isAdmin: boolean;
  onSave: (updatedConfig: InventoryConfig, isGlobal: boolean) => void;
  onClose: () => void;
}

export default function SettingsPanel({ config, isAdmin, onSave, onClose }: SettingsPanelProps) {
  const [pin, setPin] = useState<string>(config.pin);
  const [skanZbiorczy, setSkanZbiorczy] = useState<boolean>(config.skanZbiorczy);
  const [weryfikacjaPartii, setWeryfikacjaPartii] = useState<boolean>(config.weryfikacjaPartii);
  const [limitIlosci, setLimitIlosci] = useState<number>(config.limitIlosci);
  const [ignorowanePartie, setIgnorowanePartie] = useState<string>(config.ignorowanePartie);
  const [pokazujInnaLok, setPokazujInnaLok] = useState<boolean>(config.pokazujInnaLok);
  const [pozwalajDodawac, setPozwalajDodawac] = useState<boolean>(config.pozwalajDodawac);
  const [motyw, setMotyw] = useState<'light' | 'dark'>(config.motyw || 'dark');
  const [saveGlobally, setSaveGlobally] = useState<boolean>(false);

  const [validationError, setValidationError] = useState<string>('');
  
  // User Management State
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccEmail, setNewAccEmail] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [creatingAcc, setCreatingAcc] = useState(false);

  useEffect(() => {
    if (isAdmin) {
       loadAccounts();
    }
  }, [isAdmin]);

  const loadAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const snap = await getDocs(collection(db, 'app_accounts'));
        const loaded: any[] = [];
        snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
        loaded.sort((a,b) => a.name.localeCompare(b.name));
        setAccounts(loaded);
      } catch(e) {
        console.error(e);
      }
      setLoadingAccounts(false);
  }

  const handleAddAccount = async () => {
     if (!newAccName || !newAccPassword) return;
     const email = newAccEmail || `${newAccName.toLowerCase().replace(/\s+/g,'')}@gp4.pl`;
     setCreatingAcc(true);
     try {
       const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email, password: newAccPassword, returnSecureToken: false })
       });
       const data = await res.json();
       
       let uidToUse = email; // Fallback to email as ID of doc
       if (data.error) {
           if (data.error.message !== 'EMAIL_EXISTS') {
               throw new Error(data.error.message);
           }
       } else {
           uidToUse = data.localId || email;
       }
       
       await setDoc(doc(db, 'app_accounts', uidToUse), {
           name: newAccName,
           email: email,
           role: email.includes('admin') ? 'admin' : 'worker'
       });
       
       setNewAccName('');
       setNewAccEmail('');
       setNewAccPassword('');
       loadAccounts();
     } catch(e: any) {
        setValidationError("Błąd podczas tworzenia konta: " + e.message);
     } finally {
       setCreatingAcc(false);
     }
  }

  const handleDeleteAccount = async (id: string, email: string) => {
     if(confirm(`Czy na pewno usunąć konto ${email}? Użytkownik zostanie trwale usunięty z listy dostępu.`)) {
        try {
           await deleteDoc(doc(db, 'app_accounts', id));
           loadAccounts();
        } catch(e: any) {
           setValidationError("Błąd usuwania konta: " + e.message);
        }
     }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!pin || pin.trim().length === 0) {
      setValidationError("Kod PIN nie może być pusty!");
      return;
    }
    if (isNaN(limitIlosci) || limitIlosci < 1) {
      setValidationError("Limit ilości musi być dodatnią liczbą!");
      return;
    }

    onSave({
      pin: pin.trim(),
      skanZbiorczy,
      weryfikacjaPartii,
      limitIlosci: Number(limitIlosci),
      ignorowanePartie,
      pokazujInnaLok,
      pozwalajDodawac,
      motyw,
    }, saveGlobally);

    sounds.playSuccess();
  };

  return (
    <div id="settings_panel_wrapper" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div id="settings_panel_form" className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-teal-400" />
            <h3 className="font-bold text-slate-100 text-base">Konfiguracja Systemu (Makra Excel)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-slate-200">
          
          {validationError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-semibold">
              {validationError}
            </div>
          )}

          {/* Section 1: Security PIN */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <Keyboard className="h-3.5 w-3.5" /> Autoryzacja i PIN
            </h4>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-400 font-medium">B1: Zapisany Kod PIN administratora</label>
              <input
                id="config_pin_input"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                maxLength={8}
                className="w-full rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-teal-500 transition-all"
              />
            </div>
          </div>

          {/* Section 2: Scans Configuration */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clipboard className="h-3.5 w-3.5" /> Metody Skanowania i Limity
            </h4>

            {/* Toggle Skan Zbiorczy */}
            <div className="flex items-center justify-between py-1">
              <div>
                <label className="text-sm font-semibold text-slate-100 flex items-center gap-1.5 h-auto">
                  B2: Skan zbiorczy (ilościowy)
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">Wiąże się ze skanowaniem dużych partii. Pyta o całą ilość zamiast pykać po jednym.</p>
              </div>
              <button
                type="button"
                onClick={() => setSkanZbiorczy(!skanZbiorczy)}
                className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {skanZbiorczy ? (
                  <ToggleRight className="h-10 w-10 text-teal-400" />
                ) : (
                  <ToggleLeft className="h-10 w-10 text-slate-600" />
                )}
              </button>
            </div>

            {/* Limit Ilosci */}
            <div className="flex flex-col gap-1.5 pb-2">
              <label className="text-xs text-slate-400 font-medium">B4: Limit ilości aktywujący skan zbiorczy</label>
              <input
                id="config_limit_quantity"
                type="number"
                min={1}
                value={limitIlosci}
                onChange={(e) => setLimitIlosci(parseInt(e.target.value) || 0)}
                disabled={!skanZbiorczy}
                className="w-full rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-sm font-medium text-slate-100 focus:outline-none focus:border-teal-500 disabled:opacity-40 transition-all"
              />
              <p className="text-[10px] text-slate-500 leading-normal">
                Skanowanie zbiorcze pytań o ilość włączy się wyłącznie dla towarów, dla których oczekiwana ilość w systemie przekracza ten limit (VBA: <code>g_LimitIlosci</code>).
              </p>
            </div>
          </div>

          {/* Section 3: Batches & Verification */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" /> Weryfikacja Partii i Ignorowanie
            </h4>

            {/* Toggle Weryfikacja Partii */}
            <div className="flex items-center justify-between py-1">
              <div>
                <label className="text-sm font-semibold text-slate-100">
                  B3: Weryfikacja partii i daty ważności
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">Wymusza na skanerze upewnienie się co do partii oraz daty podczas odczytywania.</p>
              </div>
              <button
                type="button"
                onClick={() => setWeryfikacjaPartii(!weryfikacjaPartii)}
                className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {weryfikacjaPartii ? (
                  <ToggleRight className="h-10 w-10 text-teal-400" />
                ) : (
                  <ToggleLeft className="h-10 w-10 text-slate-600" />
                )}
              </button>
            </div>

            {/* Ignorowane partie */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-400 font-medium">B5: Ignorowane oznaczenia partii (rozdzielane średnikiem)</label>
              <input
                id="config_ignored_lots"
                type="text"
                value={ignorowanePartie}
                onChange={(e) => setIgnorowanePartie(e.target.value)}
                disabled={!weryfikacjaPartii}
                className="w-full rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-teal-500 disabled:opacity-40 transition-all"
              />
              <p className="text-[10px] text-slate-500 leading-normal">
                Standardowe ciągi oznaczające brak fizycznej partii, o które algorytm nie będzie pytał (np: <code>0;000;brak;-</code>).
              </p>
            </div>
          </div>

          {/* Section 4: Localizations and Wrong Scans */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
              ⚠️ Obsługa Błędów i Odstępstw
            </h4>

            {/* Pokazuj Inna Lokalizacje */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-semibold text-slate-100">
                  B6: Informuj o poprawnej lokalizacji
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">Wskazuje w jakiej innej strefie znajduje się ten produkt (VBA: <code>g_PokazujInnaLok</code>).</p>
              </div>
              <button
                type="button"
                onClick={() => setPokazujInnaLok(!pokazujInnaLok)}
                className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {pokazujInnaLok ? (
                  <ToggleRight className="h-10 w-10 text-teal-400" />
                ) : (
                  <ToggleLeft className="h-10 w-10 text-slate-600" />
                )}
              </button>
            </div>

            {/* Pozwalaj Dodawac */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-semibold text-slate-100">
                  B7: Zgoda na dodawanie spoza lokalizacji
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">Zezwala na dodanie produktu i ręczną korektę (inaczej następuje blokada: BRAK DOSTĘPU).</p>
              </div>
              <button
                type="button"
                onClick={() => setPozwalajDodawac(!pozwalajDodawac)}
                className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {pozwalajDodawac ? (
                  <ToggleRight className="h-10 w-10 text-teal-400" />
                ) : (
                  <ToggleLeft className="h-10 w-10 text-slate-600" />
                )}
              </button>
            </div>
          </div>

          {/* Section 5: Theme Preference */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sun className="h-3.5 w-3.5" /> Motyw Wizualny Skanera
            </h4>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-semibold text-slate-100">
                  Wygląd interfejsu (Jasny / Ciemny)
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">Dostosuj kontrast podświetlenia ekranu do warunków oświetleniowych na magazynie.</p>
              </div>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setMotyw('light')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    motyw === 'light'
                      ? 'bg-teal-500 text-slate-950 shadow font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" />
                  Jasny
                </button>
                <button
                  type="button"
                  onClick={() => setMotyw('dark')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    motyw === 'dark'
                      ? 'bg-slate-800 text-teal-400 shadow border border-slate-700/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" />
                  Ciemny
                </button>
              </div>
            </div>
          </div>

          {/* Section 6: User Management */}
          {isAdmin && (
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-4">
              <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Users className="h-3.5 w-3.5" /> Zarządzanie Kontami
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                Dodawaj nowe konta dla pracowników. Nowe konta automatycznie pojawią się w menu logowania.
              </p>
              
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nazwa (np. Wyliczko 1)"
                    value={newAccName}
                    onChange={e => setNewAccName(e.target.value)}
                    className="flex-1 rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs font-medium text-slate-100 focus:border-teal-500 outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Hasło"
                    value={newAccPassword}
                    onChange={e => setNewAccPassword(e.target.value)}
                    className="flex-1 rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs font-medium text-slate-100 focus:border-teal-500 outline-none"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Email (opcjonalny, wygeneruje się sam)"
                  value={newAccEmail}
                  onChange={e => setNewAccEmail(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-xs font-medium text-slate-100 focus:border-teal-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddAccount}
                  disabled={creatingAcc || !newAccName || !newAccPassword}
                  className="mt-1 flex items-center justify-center gap-1.5 w-full bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-teal-400 p-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {creatingAcc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Stwórz Konto
                </button>
              </div>

              {/* Accounts List */}
              <div className="flex flex-col gap-2 mt-4 max-h-48 overflow-y-auto pr-1">
                {loadingAccounts ? (
                   <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 text-teal-500 animate-spin" /></div>
                ) : accounts.length === 0 ? (
                   <div className="text-xs text-slate-500 text-center py-2">Brak kont w bazie.</div>
                ) : (
                   accounts.map(acc => (
                     <div key={acc.id} className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                        <div className="flex flex-col">
                           <span className="text-xs font-bold text-slate-200">{acc.name}</span>
                           <span className="text-[10px] text-slate-500">{acc.email}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAccount(acc.id, acc.email)}
                          className="p-1.5 rounded-md hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Usuń konto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                     </div>
                   ))
                )}
              </div>
            </div>
          )}

        </form>

        {/* Footer actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col gap-3 shrink-0">
          
          {isAdmin && (
            <label className="flex items-center gap-2 cursor-pointer pb-2 border-b border-slate-800">
              <input 
                type="checkbox" 
                checked={saveGlobally} 
                onChange={(e) => setSaveGlobally(e.target.checked)} 
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-teal-500 focus:ring-offset-slate-900" 
              />
              <span className="text-sm font-bold text-slate-200">Zapisz te ustawienia globalnie (dla wszystkich skanerów)</span>
            </label>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-700 text-xs font-bold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-xs font-bold text-slate-950 transition-colors cursor-pointer"
            >
              <Save className="h-4 w-4" />
              Zapisz Ustawienia
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
