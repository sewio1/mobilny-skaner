import React, { useState, useRef, useEffect } from 'react';
import { Scan, Sparkles, Keyboard, CheckCircle, Check, X, Zap } from 'lucide-react';
import { InventoryItem } from '../types';
import { useHardwareScanner } from '../hooks/useHardwareScanner';

interface ManualBarcodeEntryProps {
  onScan: (barcode: string) => void;
  activeLocationItems: InventoryItem[];
  scannedLocationItems: InventoryItem[];
  currentColor: 'white' | 'green' | 'yellow' | 'red';
  isLocationSelected: boolean;
  onLaunchCamera: () => void;
  isLight?: boolean;
  showHints?: boolean;
  ukryjKlawiature?: boolean;
  sessionScannedItems?: Map<string, { qty: number }>;
}

export default function ManualBarcodeEntry({
  onScan,
  activeLocationItems,
  scannedLocationItems,
  currentColor,
  isLocationSelected,
  onLaunchCamera,
  isLight = false,
  showHints = false,
  ukryjKlawiature = true,
  sessionScannedItems = new Map(),
}: ManualBarcodeEntryProps) {
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualInputValue, setManualInputValue] = useState('');
  const manualInputRef = useRef<HTMLInputElement>(null);

  // Podłączenie naszego hooka WMS dla sprzętowych skanerów.
  // Nowe API: hook zwraca ref i propsy dla phantom inputa (rozwiązuje problem
  // mobilnego Chrome, który blokuje keydown na window bez aktywnego focusa).
  const { phantomInputRef, phantomInputProps, refocus } = useHardwareScanner({
    onScan: (barcode) => {
      if (isLocationSelected) {
        onScan(barcode);
      }
    },
    // Wyłączamy nasłuchiwanie w tle, jeśli modal ręcznego wpisywania jest otwarty
    isEnabled: isLocationSelected && !isManualModalOpen,
    timeout: 40,
    inputMode: ukryjKlawiature ? 'none' : 'text',
  });

  // Focus w modalu
  useEffect(() => {
    if (isManualModalOpen) {
      setManualInputValue('');
      // Usunięto autofocus: setTimeout(() => manualInputRef.current?.focus(), 50);
      // dzięki temu klawiatura dotykowa nie wyskoczy automatycznie.
    } else {
      setTimeout(refocus, 100);
    }
  }, [isManualModalOpen, refocus]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanValue = manualInputValue.trim();
    if (cleanValue) {
      onScan(cleanValue);
      setManualInputValue('');
      setIsManualModalOpen(false);
      // Po zamknięciu modalu przywracamy focus do phantom inputa,
      // żeby pracownik mógł od razu skanować bez klikania w ekran.
      setTimeout(refocus, 100);
    }
  };

  // Get color classes matching the VBA BackColor state definitions
  const getColorClasses = () => {
    switch (currentColor) {
      case 'green':
        return isLight 
          ? 'bg-emerald-50 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] text-emerald-800'
          : 'bg-emerald-500/20 border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.2)] text-emerald-100';
      case 'yellow':
        return isLight 
          ? 'bg-amber-50 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] text-amber-800'
          : 'bg-amber-500/20 border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.2)] text-amber-100';
      case 'red':
        return isLight 
          ? 'bg-rose-50 border-rose-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] text-rose-800'
          : 'bg-rose-500/20 border-rose-500/80 shadow-[0_0_15px_rgba(239,68,68,0.2)] text-rose-100';
      case 'white':
      default:
        return isLight 
          ? 'bg-slate-50 border-slate-200 text-slate-900'
          : 'bg-slate-900 border-slate-800 text-slate-100';
    }
  };

  return (
    <div 
      id="manual_barcode_region" 
      className={`flex flex-col gap-4 border rounded-3xl p-5 shadow-xs transition-colors duration-200 ${
        isLight 
          ? 'bg-white border-slate-200/85 text-slate-950' 
          : 'bg-slate-900 border-slate-800/80 text-slate-100'
      }`}
    >

      
      {/* Title & Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scan className={`h-5 w-5 ${isLight ? 'text-teal-600' : 'text-teal-400'}`} />
          <h4 className={`font-extrabold text-sm ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Laser Hardware (WMS)</h4>
        </div>
        <div className="flex gap-2">
          {/* Przycisk Ręcznego Wpisywania */}
          <button
            onClick={() => setIsManualModalOpen(true)}
            disabled={!isLocationSelected}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              isLight
                ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700 disabled:opacity-40'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200 disabled:opacity-40'
            }`}
          >
            <Keyboard className="h-3.5 w-3.5" />
            Wpisz
          </button>

          <button
            onClick={onLaunchCamera}
            disabled={!isLocationSelected}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isLight
                ? 'bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-40'
                : 'bg-teal-500 hover:bg-teal-400 text-slate-950 disabled:opacity-40'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Kamera
          </button>
        </div>
      </div>

      {/* Główny pasek skanowania — REALNY, WIDOCZNY INPUT.
          Android Chrome wymaga widocznego, standardowego pola input by routować
          zdarzenia ze sprzętowej klawiatury/skanera. "Phantom inputs" (opacity: 0)
          są blokowane/ignorowane na niektórych urządzeniach.
      */}
      <div 
        className={`w-full rounded-2xl p-4 border-2 flex flex-col items-center justify-center transition-all duration-300 ${getColorClasses()} ${!isLocationSelected ? 'opacity-50 grayscale' : ''}`}
        onClick={() => {
          if (isLocationSelected && phantomInputRef.current) {
            phantomInputRef.current.focus();
          }
        }}
      >
        {isLocationSelected ? (
          <>
            <div className="flex items-center gap-3 w-full mb-1 relative">
              <Zap className={`h-6 w-6 shrink-0 opacity-0`} /> {/* Invisible spacer or keep it as background */}
              <input
                ref={phantomInputRef}
                {...phantomInputProps}
                placeholder="SKANUJ KOD TUTAJ..."
                className={`w-full absolute left-0 right-0 bg-transparent text-center font-black text-xl outline-none placeholder:font-bold px-12 ${
                  isLight ? 'placeholder:text-slate-300 text-slate-800' : 'placeholder:text-slate-700 text-slate-100'
                }`}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (phantomInputRef.current) {
                    phantomInputRef.current.value = '';
                    phantomInputRef.current.focus();
                  }
                }}
                className={`absolute left-0 p-1.5 rounded-full transition-colors hover:bg-rose-500/20 text-rose-500 z-10`}
              >
                <X className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (phantomInputRef.current && phantomInputRef.current.value.trim().length > 0) {
                    onScan(phantomInputRef.current.value.trim());
                    phantomInputRef.current.value = '';
                    phantomInputRef.current.focus();
                  }
                }}
                className={`absolute right-0 p-1.5 rounded-full bg-teal-500 hover:bg-teal-400 text-white shadow-sm transition-colors z-10`}
              >
                <Check className="h-5 w-5" />
              </button>
            </div>
            <span className="text-[10px] font-medium opacity-60 text-center mb-1">
              Skieruj laser na etykietę. (Tapnij tu, jeśli nie reaguje)
            </span>
          </>
        ) : (
          <>
            <Scan className="h-10 w-10 mb-2 opacity-30" />
            <span className="font-bold text-lg text-center tracking-wide opacity-50">
              CZEKAM NA LOKALIZACJĘ
            </span>
          </>
        )}
      </div>

      {/* VBA Indicator state label */}
      {isLocationSelected && (
        <div className="flex items-center justify-between text-xs">
          <span className={isLight ? 'text-slate-500 font-medium' : 'text-slate-400'}>Ostatni Odczyt:</span>
          {currentColor === 'white' && <span className={`${isLight ? 'text-slate-600' : 'text-slate-450'} font-semibold`}>Oczekiwanie...</span>}
          {currentColor === 'green' && <span className={`${isLight ? 'text-emerald-700 font-bold' : 'text-emerald-400'} font-bold`}>Poprawny odczyt (+1)</span>}
          {currentColor === 'yellow' && <span className={`${isLight ? 'text-amber-700 font-bold' : 'text-amber-400'} font-bold`}>Dodatkowy wiersz / Nadwyżka</span>}
          {currentColor === 'red' && <span className={`${isLight ? 'text-rose-700 font-bold' : 'text-rose-400'} font-bold`}>Artykuł spoza listy / Błąd</span>}
        </div>
      )}

      {/* MODAL DO RĘCZNEGO WPROWADZANIA */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200 ${
            isLight ? 'bg-white' : 'bg-slate-900 border border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-bold text-lg ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Wprowadzanie Ręczne
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsManualModalOpen(false);
                  // Przywróć focus do phantom inputa po zamknięciu modalu
                  setTimeout(refocus, 100);
                }}
                className={`p-1.5 rounded-full transition-colors ${
                  isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-slate-800 text-slate-400'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className={`text-sm mb-4 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Użyj tego okna tylko, gdy etykieta jest zamazana i laser nie może jej odczytać.
            </p>

            <form onSubmit={handleManualSubmit} className="flex flex-col gap-4">
              <input
                ref={manualInputRef}
                type="text"
                value={manualInputValue}
                onChange={(e) => setManualInputValue(e.target.value)}
                placeholder="Wpisz kod ręcznie..."
                className={`w-full rounded-xl p-4 text-center font-mono text-lg font-semibold border-2 tracking-wider focus:outline-none transition-all ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 focus:border-teal-500 text-slate-900'
                    : 'bg-slate-950 border-slate-700 focus:border-teal-500 text-white'
                }`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setManualInputValue('');
                    manualInputRef.current?.focus();
                  }}
                  className={`py-2.5 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                    isLight ? 'bg-rose-100 hover:bg-rose-200 text-rose-700' : 'bg-rose-950 hover:bg-rose-900 text-rose-400'
                  }`}
                >
                  Czyść
                </button>
                <button
                  type="submit"
                  disabled={!manualInputValue.trim()}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    manualInputValue.trim()
                      ? 'bg-teal-500 hover:bg-teal-400 text-slate-950 cursor-pointer shadow-md'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800/50 dark:text-slate-600'
                  }`}
                >
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  Zatwierdź Kod
                </button>
              </div>
            </form>

            {/* HINTS FOR MANUAL ENTRY */}
            {showHints && (activeLocationItems.length > 0 || scannedLocationItems.length > 0) && (
              <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4 space-y-4">
                
                {/* Niezeskanowane (To Scan) */}
                {activeLocationItems.length > 0 && (
                  <div>
                    <p className={`text-xs font-bold mb-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Niezeskanowane produkty w tej lokalizacji:
                    </p>
                    <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                      {activeLocationItems.map((item, idx) => {
                        const firstEan = (item.kodPomocniczy || '').split(/[,/;\s]+/)[0];
                        const auxCode = firstEan || item.kodGlowny;
                        return (
                          <button
                            key={`unscanned-hint-${item.id}-${idx}`}
                            type="button"
                            onClick={() => {
                              setManualInputValue(auxCode);
                              setTimeout(() => manualInputRef.current?.focus(), 10);
                            }}
                            className={`text-left px-3 py-2 rounded-xl text-xs border transition-all cursor-pointer flex flex-col w-full ${
                              isLight
                                ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                                : 'bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="w-full flex justify-between items-start gap-2">
                              <span className={`font-extrabold text-[10px] leading-none mb-1 truncate flex-1 ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>{item.nazwa}</span>
                              <div className="flex flex-col gap-1 items-end">
                                {item.sj && item.sj !== "0" && item.sj !== "" && (
                                  <span className="text-[9px] bg-rose-500/10 border border-rose-500/30 text-rose-650 dark:text-rose-450 px-1 rounded font-black shrink-0">
                                    SJ: {item.sj}
                                  </span>
                                )}
                                {(() => {
                                  const codeKey = `${(item.kodGlowny || '').toUpperCase()}_row${item.rowNum}`;
                                  const currentSessionQty = sessionScannedItems.get(codeKey)?.qty || 0;
                                  const remaining = Math.max(0, item.iloscSystemowa - currentSessionQty);
                                  return (
                                    <span className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1 rounded font-black shrink-0">
                                      Pozostało: {remaining} szt.
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                            <span className={`font-mono text-[9px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Nr art.: {item.kodGlowny}</span>
                            {item.kodPomocniczy && <span className={`font-mono text-[9px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>EAN: {item.kodPomocniczy}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Zeskanowane (Already Scanned) */}
                {scannedLocationItems.length > 0 && (
                  <div className={`pt-3 border-t ${isLight ? 'border-slate-100' : 'border-slate-800/50'}`}>
                    <p className={`text-xs font-bold mb-3 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                      Zeskanowane produkty (można dobić):
                    </p>
                    <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar opacity-70 hover:opacity-100 transition-opacity">
                      {scannedLocationItems.map((item, idx) => {
                        const firstEan = (item.kodPomocniczy || '').split(/[,/;\s]+/)[0];
                        const auxCode = firstEan || item.kodGlowny;
                        return (
                          <button
                            key={`scanned-hint-${item.id}-${idx}`}
                            type="button"
                            onClick={() => {
                              setManualInputValue(auxCode);
                              setTimeout(() => manualInputRef.current?.focus(), 10);
                            }}
                            className={`text-left px-3 py-2 rounded-xl text-xs border transition-all cursor-pointer flex flex-col w-full ${
                              isLight
                                ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                                : 'bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="w-full flex justify-between items-start gap-2">
                              <span className={`font-extrabold text-[10px] leading-none mb-1 truncate flex-1 ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>{item.nazwa}</span>
                              <div className="flex flex-col gap-1 items-end">
                                {item.sj && item.sj !== "0" && item.sj !== "" && (
                                  <span className="text-[9px] bg-rose-500/10 border border-rose-500/30 text-rose-650 dark:text-rose-450 px-1 rounded font-black shrink-0">
                                    SJ: {item.sj}
                                  </span>
                                )}
                                {(() => {
                                  const codeKey = `${(item.kodGlowny || '').toUpperCase()}_row${item.rowNum}`;
                                  const currentSessionQty = sessionScannedItems.get(codeKey)?.qty || 0;
                                  return (
                                    <span className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1 rounded font-black shrink-0">
                                      Skanowano: {currentSessionQty} szt.
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                            <span className={`font-mono text-[9px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Nr art.: {item.kodGlowny}</span>
                            {item.kodPomocniczy && <span className={`font-mono text-[9px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>EAN: {item.kodPomocniczy}</span>}
                            {item.nosnik && (
                              <span className={`font-mono text-[9px] mt-0.5 ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`}>
                                📦 Nośnik: {item.nosnik}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      )}



    </div>
  );
}
