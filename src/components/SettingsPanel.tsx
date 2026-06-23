/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Settings, Save, X, ToggleLeft, ToggleRight,
  Keyboard, Database, Clipboard, Sun, Moon,
  Users, Trash2, Plus, Loader2, Shield,
  Scan, Bell, Palette, ChevronDown, ChevronUp, Package
} from 'lucide-react';
import { InventoryConfig } from '../types';
import { sounds } from '../utils/sound';
import { collection, getDocs, setDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';

interface SettingsPanelProps {
  config: InventoryConfig;
  isAdmin: boolean;
  onSave: (updatedConfig: InventoryConfig, isGlobal: boolean) => void;
  onClose: () => void;
  isLight?: boolean;
  inline?: boolean;
}

// ── Helper: collapsible section wrapper ─────────────────────────────────────
function Section({
  icon, title, subtitle, defaultOpen = true, children, isLight
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  isLight?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`border rounded-2xl overflow-hidden transition-colors ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors cursor-pointer ${isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800/30'}`}
      >
        <div className="flex items-center gap-2">
          <span className={isLight ? 'text-teal-600' : 'text-teal-400'}>{icon}</span>
          <div className="text-left">
            <p className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>{title}</p>
            {subtitle && <p className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>{subtitle}</p>}
          </div>
        </div>
        {open ? <ChevronUp className={`h-4 w-4 shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} /> : <ChevronDown className={`h-4 w-4 shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />}
      </button>
      {open && <div className={`px-4 pb-4 pt-1 space-y-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800/50'}`}>{children}</div>}
    </div>
  );
}

// ── Helper: toggle row ───────────────────────────────────────────────────────
function ToggleRow({
  label, desc, value, onChange, isLight
}: {
  label: string; desc?: string; value: boolean; onChange: () => void; isLight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-tight ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>{label}</p>
        {desc && <p className={`text-[11px] mt-0.5 leading-snug ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{desc}</p>}
      </div>
      <button type="button" onClick={onChange} className="shrink-0 cursor-pointer">
        {value
          ? <ToggleRight className={`h-9 w-9 ${isLight ? 'text-teal-500' : 'text-teal-400'}`} />
          : <ToggleLeft className={`h-9 w-9 ${isLight ? 'text-slate-300' : 'text-slate-600'}`} />}
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SettingsPanel({ config, isAdmin, onSave, onClose, isLight = false, inline = false }: SettingsPanelProps) {
  // Scan
  const [skanZbiorczy, setSkanZbiorczy] = useState(config.skanZbiorczy);
  const [limitIlosci, setLimitIlosci] = useState(config.limitIlosci);
  const [trybSkanowania, setTrybSkanowania] = useState<'ean' | 'kodGlowny' | 'oba'>(config.trybSkanowania || 'oba');

  // Batch verification
  const [weryfikacjaPartii, setWeryfikacjaPartii] = useState(config.weryfikacjaPartii);
  const [ignorowanePartie, setIgnorowanePartie] = useState(config.ignorowanePartie);
  const [blokadaDodawaniaPartii, setBlokadaDodawaniaPartii] = useState(config.blokadaDodawaniaPartii || false);

  // Counting logic
  const [logikaLiczenia2, setLogikaLiczenia2] = useState<'tylko_niezgodne' | 'wszystko'>(config.logikaLiczenia2 || 'tylko_niezgodne');
  const [logikaLiczenia3, setLogikaLiczenia3] = useState<'tylko_niezgodne' | 'wszystko'>(config.logikaLiczenia3 || 'tylko_niezgodne');

  // Behaviour
  const [pokazujInnaLok, setPokazujInnaLok] = useState(config.pokazujInnaLok);
  const [pozwalajDodawac, setPozwalajDodawac] = useState(config.pozwalajDodawac);
  const [podpowiedziWpisywania, setPodpowiedziWpisywania] = useState(config.podpowiedziWpisywania || false);
  const [autoSyncAfterSave, setAutoSyncAfterSave] = useState(config.autoSyncAfterSave || false);
  const [pokazujNosnikHint, setPokazujNosnikHint] = useState(config.pokazujNosnikHint || false);
  const [wymuszajNosnik, setWymuszajNosnik] = useState(config.wymuszajNosnik || false);

  // Notifications
  const [powiadomieniaTylkoArkusz, setPowiadomieniaTylkoArkusz] = useState(config.powiadomieniaTylkoArkusz || false);

  // Appearance
  const [motyw, setMotyw] = useState<'light' | 'dark'>(config.motyw || 'dark');
  const [wibracje, setWibracje] = useState(config.wibracje ?? true);
  const [dzwieki, setDzwieki] = useState(config.dzwieki ?? true);
  const [ukryjKlawiature, setUkryjKlawiature] = useState(config.ukryjKlawiature ?? true);

  // Security
  const [pin, setPin] = useState(config.pin);

  // Save scope
  const [saveGlobally, setSaveGlobally] = useState(false);
  const [validationError, setValidationError] = useState('');

  // User management
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccEmail, setNewAccEmail] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [newAccRole, setNewAccRole] = useState<'admin' | 'worker'>('worker');
  const [creatingAcc, setCreatingAcc] = useState(false);

  useEffect(() => { if (isAdmin) loadAccounts(); }, [isAdmin]);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const snap = await getDocs(collection(db, 'app_accounts'));
      const loaded: any[] = [];
      snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => a.name.localeCompare(b.name));
      setAccounts(loaded);
    } catch (e) { console.error(e); }
    setLoadingAccounts(false);
  };

  const handleAddAccount = async () => {
    if (!newAccName || !newAccPassword) return;
    const email = newAccEmail || `${newAccName.toLowerCase().replace(/\s+/g, '')}@gp4.pl`;
    setCreatingAcc(true);
    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: newAccPassword, returnSecureToken: false })
      });
      const data = await res.json();
      if (data.error && data.error.message !== 'EMAIL_EXISTS') throw new Error(data.error.message);
      await setDoc(doc(db, 'app_accounts', email), { name: newAccName, email, role: newAccRole });
      setNewAccName(''); setNewAccEmail(''); setNewAccPassword(''); setNewAccRole('worker');
      loadAccounts();
    } catch (e: any) {
      setValidationError('Błąd podczas tworzenia konta: ' + e.message);
    } finally { setCreatingAcc(false); }
  };

  const handleDeleteAccount = async (id: string, email: string) => {
    if (confirm(`Czy na pewno usunąć konto ${email}?`)) {
      try { await deleteDoc(doc(db, 'app_accounts', id)); loadAccounts(); }
      catch (e: any) { setValidationError('Błąd usuwania konta: ' + e.message); }
    }
  };

  const handleChangeRole = async (id: string, currentRole: string) => {
    try {
      await setDoc(doc(db, 'app_accounts', id), { role: currentRole === 'admin' ? 'worker' : 'admin' }, { merge: true });
      loadAccounts();
    } catch (e: any) { setValidationError('Błąd zmiany roli: ' + e.message); }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.trim().length === 0) { setValidationError('Kod PIN nie może być pusty!'); return; }
    if (isNaN(limitIlosci) || limitIlosci < 1) { setValidationError('Limit ilości musi być dodatnią liczbą!'); return; }
    onSave({
      pin: pin.trim(), skanZbiorczy, weryfikacjaPartii, limitIlosci: Number(limitIlosci),
      ignorowanePartie, pokazujInnaLok, pozwalajDodawac, podpowiedziWpisywania,
      powiadomieniaTylkoArkusz, motyw, wibracje, dzwieki, trybSkanowania,
      autoSyncAfterSave, pokazujNosnikHint, ukryjKlawiature, wymuszajNosnik, blokadaDodawaniaPartii,
      logikaLiczenia2, logikaLiczenia3
    }, saveGlobally);
    sounds.playSuccess();
  };

  const scanModeOptions: { value: 'ean' | 'kodGlowny' | 'oba'; label: string; desc: string }[] = [
    { value: 'oba',       label: 'EAN i Nr artykułu',  desc: 'Skanuj po dowolnym z kodów (domyślne, zalecane)' },
    { value: 'ean',       label: 'Tylko EAN',           desc: 'Rozpoznaj wyłącznie po kodzie kreskowym EAN' },
    { value: 'kodGlowny', label: 'Tylko Nr artykułu',  desc: 'Rozpoznaj wyłącznie po numerze artykułu (bez EAN)' },
  ];

  return (
    <div id="settings_panel_wrapper" className={inline ? 'w-full h-full' : `fixed inset-0 z-50 flex items-center justify-center p-4 transition-colors ${isLight ? 'bg-slate-900/30 backdrop-blur-sm' : 'bg-slate-950/80'}`}>
      <div id="settings_panel_form" className={`w-full ${inline ? 'max-w-4xl h-full mx-auto' : 'max-w-lg max-h-[92vh]'} rounded-3xl border shadow-2xl overflow-hidden flex flex-col transition-colors ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>

        {/* Header */}
        <div className={`flex items-center justify-between border-b px-6 py-4 shrink-0 transition-colors ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
          <div className="flex items-center gap-2">
            <Settings className={`h-5 w-5 ${isLight ? 'text-teal-600' : 'text-teal-400'}`} />
            <div>
              <h3 className={`font-bold text-base leading-tight ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>Konfiguracja Skanera</h3>
              <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Wszystkie parametry inwentaryzacji</p>
            </div>
          </div>
          {!inline && (
            <button type="button" onClick={onClose} className={`rounded-full p-1.5 transition-colors cursor-pointer ${isLight ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {validationError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-500 text-xs font-semibold">
              {validationError}
            </div>
          )}

          {/* ── 1. SKANOWANIE ─────────────────────────────── */}
          <Section
            isLight={isLight}
            icon={<Scan className="h-3.5 w-3.5" />}
            title="Skanowanie"
            subtitle="Metody rozpoznawania kodów i limity ilościowe"
          >
            {/* Tryb skanowania */}
            <div>
              <p className={`text-xs font-semibold mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Tryb dopasowania kodu skanera</p>
              <div className="flex flex-col gap-1.5">
                {scanModeOptions.map(opt => {
                  const isSelected = trybSkanowania === opt.value;
                  const selectedClass = isLight 
                    ? 'bg-teal-50 border-teal-300 text-teal-800' 
                    : 'bg-teal-500/10 border-teal-500/50 text-teal-300';
                  const unselectedClass = isLight
                    ? 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600';
                  
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTrybSkanowania(opt.value)}
                      className={`text-left px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${isSelected ? selectedClass : unselectedClass}`}
                    >
                      <p className="text-xs font-bold">{opt.label}</p>
                      <p className="text-[10px] opacity-70 mt-0.5">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`border-t pt-3 ${isLight ? 'border-slate-200' : 'border-slate-800/50'}`}>
              <ToggleRow
                isLight={isLight}
                label="Skan zbiorczy (ilościowy)"
                desc="Zamiast pykać +1, pyta o całą ilość. Przydatny przy dużych partiach."
                value={skanZbiorczy}
                onChange={() => setSkanZbiorczy(v => !v)}
              />
              {skanZbiorczy && (
                <div className="mt-2 flex flex-col gap-1">
                  <label className={`text-[10px] font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Limit ilości aktywujący skan zbiorczy</label>
                  <input
                    id="config_limit_quantity"
                    type="number" min={1}
                    value={limitIlosci}
                    onChange={e => setLimitIlosci(parseInt(e.target.value) || 0)}
                    className={`w-full rounded-xl border p-2.5 text-sm font-medium focus:outline-none focus:border-teal-500 transition-all ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                    }`}
                  />
                  <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Skan zbiorczy włącza się tylko gdy oczekiwana ilość w systemie przekracza ten próg.</p>
                </div>
              )}
            </div>
          </Section>

          {/* ── 2. PARTIE I WERYFIKACJA ──────────────────── */}
          <Section
            isLight={isLight}
            icon={<Package className="h-3.5 w-3.5" />}
            title="Partie i Daty Ważności"
            subtitle="Weryfikacja i ignorowanie oznaczeń partii"
          >
            <ToggleRow
              isLight={isLight}
              label="Weryfikacja partii i daty ważności"
              desc="Wymusza potwierdzenie partii i daty przy każdym skanowaniu."
              value={weryfikacjaPartii}
              onChange={() => setWeryfikacjaPartii(v => !v)}
            />
            {weryfikacjaPartii && (
              <div className={`mt-3 pt-3 border-t ${isLight ? 'border-slate-200' : 'border-slate-800/50'}`}>
                <ToggleRow
                  isLight={isLight}
                  label="Blokada dodawania nowych Partii/Dat"
                  desc="Jeśli włączone, pracownik nie będzie mógł wprowadzić różnicy dla zeskanowanego artykułu. Będzie musiał zatwierdzić stan systemowy."
                  value={blokadaDodawaniaPartii}
                  onChange={() => setBlokadaDodawaniaPartii(v => !v)}
                />
              </div>
            )}
            <div className="mt-3 flex flex-col gap-1">
              <label className={`text-[10px] font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Ignorowane oznaczenia partii (oddziel średnikiem)</label>
              <input
                id="config_ignored_lots"
                type="text"
                value={ignorowanePartie}
                onChange={e => setIgnorowanePartie(e.target.value)}
                disabled={!weryfikacjaPartii}
                placeholder="np. 0;000;brak;-"
                className={`w-full rounded-xl border p-2.5 text-sm font-mono focus:outline-none focus:border-teal-500 disabled:opacity-40 transition-all ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                }`}
              />
              <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>O partie z tej listy algorytm nie zapyta podczas skanowania.</p>
            </div>
          </Section>

          {/* ── 3. ZACHOWANIE ────────────────────────────── */}
          <Section
            isLight={isLight}
            icon={<Clipboard className="h-3.5 w-3.5" />}
            title="Zachowanie Skanera"
            subtitle="Obsługa błędów, dodawanie spoza listy, podpowiedzi"
          >
            <ToggleRow
              isLight={isLight}
              label="Informuj o poprawnej lokalizacji"
              desc="Gdy skanujesz towar z innej strefy, wyświetla gdzie powinien się znajdować."
              value={pokazujInnaLok}
              onChange={() => setPokazujInnaLok(v => !v)}
            />
            <ToggleRow
              isLight={isLight}
              label="Zezwól na dodawanie spoza listy"
              desc="Umożliwia ręczne dodanie towaru nierozpoznanego lub z innej lokalizacji."
              value={pozwalajDodawac}
              onChange={() => setPozwalajDodawac(v => !v)}
            />
            <ToggleRow
              isLight={isLight}
              label="Podpowiedzi przy wpisywaniu ręcznym"
              desc="Pokazuje listę brakujących produktów w oknie ręcznego wpisywania kodu."
              value={podpowiedziWpisywania}
              onChange={() => setPodpowiedziWpisywania(v => !v)}
            />
            <ToggleRow
              isLight={isLight}
              label="Auto-Sync po zamknięciu strefy"
              desc="Automatycznie wysyła wyniki do chmury po każdym zatwierdzeniu lokalizacji."
              value={autoSyncAfterSave}
              onChange={() => setAutoSyncAfterSave(v => !v)}
            />
            <ToggleRow
              isLight={isLight}
              label="Pokaż numer nośnika przy błędnym skanowaniu"
              desc="Gdy artykuł jest w innym nośniku tej samej strefy, pokaże na jakim nośniku się znajduje."
              value={pokazujNosnikHint}
              onChange={() => setPokazujNosnikHint(v => !v)}
            />
            <ToggleRow
              isLight={isLight}
              label="Wymuś pracę na nośniku"
              desc="Wymusza wybór nośnika zaraz po wejściu w lokalizację i blokuje skanowanie do momentu jego wyboru."
              value={wymuszajNosnik}
              onChange={() => setWymuszajNosnik(v => !v)}
            />
          </Section>
          {/* ── 4. LOGIKA LICZENIA ─────────────────────────── */}
          <Section
            isLight={isLight}
            icon={<Clipboard className="h-3.5 w-3.5" />}
            title="Logika Kolejnych Tur Liczenia"
            subtitle="Zasady wyświetlania asortymentu w drugim i trzecim liczeniu"
            defaultOpen={true}
          >
            <div>
              <p className={`text-xs font-semibold mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Co liczymy w II turze (2 Liczenie)?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLogikaLiczenia2('tylko_niezgodne')}
                  className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer leading-tight ${
                    logikaLiczenia2 === 'tylko_niezgodne' 
                      ? (isLight ? 'bg-teal-500 text-white border-teal-500' : 'bg-teal-500 text-slate-950 border-teal-400')
                      : (isLight ? 'bg-white text-slate-600 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800')
                  }`}
                >
                  Tylko pozycje niezgodne z I turą
                </button>
                <button
                  type="button"
                  onClick={() => setLogikaLiczenia2('wszystko')}
                  className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer leading-tight ${
                    logikaLiczenia2 === 'wszystko' 
                      ? (isLight ? 'bg-teal-500 text-white border-teal-500' : 'bg-teal-500 text-slate-950 border-teal-400')
                      : (isLight ? 'bg-white text-slate-600 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800')
                  }`}
                >
                  Wszystkie pozycje ze strefy (od nowa)
                </button>
              </div>
            </div>

            <div className="pt-2">
              <p className={`text-xs font-semibold mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Co liczymy w III turze (3 Liczenie)?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLogikaLiczenia3('tylko_niezgodne')}
                  className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer leading-tight ${
                    logikaLiczenia3 === 'tylko_niezgodne' 
                      ? (isLight ? 'bg-teal-500 text-white border-teal-500' : 'bg-teal-500 text-slate-950 border-teal-400')
                      : (isLight ? 'bg-white text-slate-600 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800')
                  }`}
                >
                  Tylko pozycje nadal niezgodne
                </button>
                <button
                  type="button"
                  onClick={() => setLogikaLiczenia3('wszystko')}
                  className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-bold border transition-all cursor-pointer leading-tight ${
                    logikaLiczenia3 === 'wszystko' 
                      ? (isLight ? 'bg-teal-500 text-white border-teal-500' : 'bg-teal-500 text-slate-950 border-teal-400')
                      : (isLight ? 'bg-white text-slate-600 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800')
                  }`}
                >
                  Wszystkie pozycje ze strefy (od nowa)
                </button>
              </div>
            </div>
          </Section>

          {/* ── 5. POWIADOMIENIA ─────────────────────────── */}
          <Section
            isLight={isLight}
            icon={<Bell className="h-3.5 w-3.5" />}
            title="Powiadomienia"
            subtitle="Kiedy i jak dzwoneczek informuje o postępach"
            defaultOpen={false}
          >
            <ToggleRow
              isLight={isLight}
              label="Powiadamiaj tylko po zamknięciu całego arkusza"
              desc="Wyłącz, jeśli chcesz powiadomień po każdej strefie. Włącz, gdy interesuje Cię tylko finalne zamknięcie pliku."
              value={powiadomieniaTylkoArkusz}
              onChange={() => setPowiadomieniaTylkoArkusz(v => !v)}
            />
          </Section>

          {/* ── 5. WYGLĄD I DŹWIĘKI ──────────────────────── */}
          <Section
            isLight={isLight}
            icon={<Palette className="h-3.5 w-3.5" />}
            title="Wygląd i Dźwięki"
            subtitle="Motyw, wibracje i dźwięki skanera"
            defaultOpen={false}
          >
            {/* Motyw */}
            <div>
              <p className={`text-xs font-semibold mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Motyw interfejsu</p>
              <div className="flex gap-2">
                {(['light', 'dark'] as const).map(m => {
                  const isSelected = motyw === m;
                  const selectedClass = isLight 
                    ? 'bg-teal-500 text-white border-teal-500' 
                    : 'bg-teal-500 text-slate-950 border-teal-400';
                  const unselectedClass = isLight
                    ? 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-600';
                    
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMotyw(m)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isSelected ? selectedClass : unselectedClass}`}
                    >
                      {m === 'light' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                      {m === 'light' ? 'Jasny' : 'Ciemny'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              {/* Dźwięki */}
              <button
                type="button"
                onClick={() => setDzwieki(v => !v)}
                className={`flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                  dzwieki 
                    ? (isLight ? 'bg-teal-50 border-teal-300' : 'bg-teal-500/10 border-teal-500/30') 
                    : (isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800')
                }`}
              >
                <span className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>🔊 Dźwięki</span>
                {dzwieki 
                  ? <ToggleRight className={`h-7 w-7 ${isLight ? 'text-teal-500' : 'text-teal-400'}`} /> 
                  : <ToggleLeft className={`h-7 w-7 ${isLight ? 'text-slate-300' : 'text-slate-600'}`} />}
              </button>
              {/* Wibracje */}
              <button
                type="button"
                onClick={() => setWibracje(v => !v)}
                className={`flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                  wibracje 
                    ? (isLight ? 'bg-teal-50 border-teal-300' : 'bg-teal-500/10 border-teal-500/30') 
                    : (isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800')
                }`}
              >
                <span className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>📳 Wibracje</span>
                {wibracje 
                  ? <ToggleRight className={`h-7 w-7 ${isLight ? 'text-teal-500' : 'text-teal-400'}`} /> 
                  : <ToggleLeft className={`h-7 w-7 ${isLight ? 'text-slate-300' : 'text-slate-600'}`} />}
              </button>
            </div>
            <ToggleRow
              isLight={isLight}
              label="Ukryj klawiaturę ekranową"
              desc="Zapobiega wysuwaniu się klawiatury dotykowej przy skanowaniu. Wyłącz, jeśli chcesz wpisywać dane ręcznie palcem na ekranie."
              value={ukryjKlawiature}
              onChange={() => setUkryjKlawiature(!ukryjKlawiature)}
            />
          </Section>

          {/* ── 6. BEZPIECZEŃSTWO ────────────────────────── */}
          <Section
            isLight={isLight}
            icon={<Keyboard className="h-3.5 w-3.5" />}
            title="Bezpieczeństwo"
            subtitle="Kod PIN administratora"
            defaultOpen={false}
          >
            <div className="flex flex-col gap-1.5">
              <label className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Kod PIN (do 8 znaków)</label>
              <input
                id="config_pin_input"
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                maxLength={8}
                className={`w-full rounded-xl border p-2.5 text-sm font-mono focus:outline-none focus:border-teal-500 transition-all ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
                }`}
              />
            </div>
          </Section>

          {/* ── 7. ZARZĄDZANIE ZESPOŁEM (Admin only) ─────── */}
          {isAdmin && (
            <Section
              isLight={isLight}
              icon={<Users className="h-3.5 w-3.5" />}
              title="Zarządzanie Zespołem"
              subtitle="Konta pracowników i administratorów"
              defaultOpen={false}
            >
              <p className={`text-[11px] leading-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Dodawaj nowe konta. Pojawią się automatycznie w menu logowania.
              </p>

              <div className={`border rounded-xl p-3 flex flex-col gap-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                <input
                  type="text" placeholder="Imię / Nazwa (np. Jan K.)"
                  value={newAccName} onChange={e => setNewAccName(e.target.value)}
                  className={`w-full rounded-lg border p-2 text-xs font-medium focus:border-teal-500 outline-none ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
                  }`}
                />
                <div className="flex gap-2">
                  <input
                    type="password" placeholder="Hasło"
                    value={newAccPassword} onChange={e => setNewAccPassword(e.target.value)}
                    className={`flex-1 rounded-lg border p-2 text-xs font-medium focus:border-teal-500 outline-none ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
                    }`}
                  />
                  <select
                    value={newAccRole} onChange={e => setNewAccRole(e.target.value as 'admin' | 'worker')}
                    className={`flex-1 rounded-lg border p-2 text-xs font-medium focus:border-teal-500 outline-none cursor-pointer ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
                    }`}
                  >
                    <option value="worker">Pracownik</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <input
                  type="text" placeholder="Email (opcjonalny, wygeneruje się sam)"
                  value={newAccEmail} onChange={e => setNewAccEmail(e.target.value)}
                  className={`w-full rounded-lg border p-2 text-xs font-medium focus:border-teal-500 outline-none ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
                  }`}
                />
                <button
                  type="button" onClick={handleAddAccount}
                  disabled={creatingAcc || !newAccName || !newAccPassword}
                  className={`flex items-center justify-center gap-1.5 w-full border p-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer ${
                    isLight 
                      ? 'bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700' 
                      : 'bg-teal-500/10 hover:bg-teal-500/20 border-teal-500/20 text-teal-400'
                  }`}
                >
                  {creatingAcc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Stwórz Konto
                </button>
              </div>

              <div className="space-y-2">
                {loadingAccounts ? (
                  <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 text-teal-500 animate-spin" /></div>
                ) : accounts.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Brak kont w bazie.</p>
                ) : (
                  accounts.map(acc => (
                    <div key={acc.id} className={`flex items-center justify-between p-2.5 rounded-xl border ${
                      isLight ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                    }`}>
                      <div>
                        <p className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                          {acc.name} <span className="text-[10px] text-teal-500 uppercase ml-1">({acc.role})</span>
                        </p>
                        <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>{acc.email}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => handleChangeRole(acc.id, acc.role)} title="Zmień uprawnienia"
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isLight ? 'text-slate-400 hover:text-teal-600 hover:bg-teal-50' : 'text-slate-500 hover:text-teal-400 hover:bg-teal-500/10'
                          }`}>
                          <Shield className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleDeleteAccount(acc.id, acc.email)} title="Usuń konto"
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isLight ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10'
                          }`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Section>
          )}

        </form>

        {/* Footer */}
        <div className={`p-4 border-t flex flex-col gap-3 shrink-0 transition-colors ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
          {isAdmin && (
            <label className={`flex items-center gap-2 cursor-pointer pb-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <input
                type="checkbox" checked={saveGlobally} onChange={e => setSaveGlobally(e.target.checked)}
                className={`w-4 h-4 rounded text-teal-500 focus:ring-teal-500 ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900 focus:ring-offset-slate-900'}`}
              />
              <span className={`text-sm font-bold ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Zapisz globalnie (dla wszystkich skanerów)</span>
            </label>
          )}
          <div className="flex justify-end gap-3">
            {!inline && (
              <button type="button" onClick={onClose}
                className={`px-5 py-2.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                  isLight ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}>
                Anuluj
              </button>
            )}
            <button type="button" onClick={handleSave}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-xs font-bold transition-colors cursor-pointer">
              <Save className="h-4 w-4" />
              Zapisz Ustawienia
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
