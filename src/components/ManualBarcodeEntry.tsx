import React, { useState, useRef, useEffect } from 'react';
import { Scan, Sparkles, Keyboard, CheckCircle, X, Zap } from 'lucide-react';
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
  });

  // Focus w modalu
  useEffect(() => {
    if (isManualModalOpen && manualInputRef.current) {
      setTimeout(() => manualInputRef.current?.focus(), 50);
    }
  }, [isManualModalOpen]);

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
            <div className="flex items-center gap-3 w-full mb-1">
              <Zap className={`h-6 w-6 shrink-0 ${currentColor === 'white' ? 'animate-pulse text-teal-500' : 'text-slate-400'}`} />
              <input
                ref={phantomInputRef}
                {...phantomInputProps}
                placeholder="SKANUJ KOD TUTAJ..."
                className={`w-full bg-transparent text-center font-black text-xl outline-none placeholder:font-bold ${
                  isLight ? 'placeholder:text-slate-300 text-slate-800' : 'placeholder:text-slate-700 text-slate-100'
                }`}
              />
            </div>
            <span className="text-xs font-medium opacity-60 text-center">
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
              <button
                type="submit"
                disabled={!manualInputValue.trim()}
                className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  manualInputValue.trim()
                    ? 'bg-teal-500 hover:bg-teal-400 text-slate-950 cursor-pointer shadow-md'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800/50 dark:text-slate-600'
                }`}
              >
                <CheckCircle className="w-5 h-5" />
                Zatwierdź Kod
              </button>
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
                        const auxCode = item.kodPomocniczy || item.kodGlowny;
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
                            <span className={`font-extrabold text-[10px] leading-none mb-1 truncate w-full ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>{item.nazwa}</span>
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
                        const auxCode = item.kodPomocniczy || item.kodGlowny;
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
                            <span className={`font-extrabold text-[10px] leading-none mb-1 truncate w-full ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>{item.nazwa}</span>
                            <span className={`font-mono text-[9px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Nr art.: {item.kodGlowny}</span>
                            {item.kodPomocniczy && <span className={`font-mono text-[9px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>EAN: {item.kodPomocniczy}</span>}
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

      {/* SIMULATOR ASSISTANT (Tylko pomocniczo) */}
      {isLocationSelected && (
        <div className={`border-t pt-4 mt-1 ${isLight ? 'border-slate-100' : 'border-slate-800/80'}`}>
          <h5 className={`text-xs font-bold flex items-center gap-1.5 mb-2.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            📟 Produkty do Skanera
          </h5>
          <div className="space-y-4">
            {activeLocationItems.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeLocationItems.map((item, idx) => {
                  const auxCode = item.kodPomocniczy || item.kodGlowny;
                  return (
                    <button
                      key={`${item.id}-${idx}`}
                      type="button"
                      onClick={() => navigator.clipboard.writeText(auxCode)}
                      className={`text-left px-3 py-2 rounded-xl text-xs border transition-all cursor-pointer flex flex-col max-w-[175px] ${
                        isLight
                          ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                          : 'bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <span className={`font-extrabold text-[10px] leading-none mb-1 truncate w-full ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>{item.nazwa}</span>
                      <span className={`font-mono text-[9px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Nr art.: {item.kodGlowny}</span>
                      {item.kodPomocniczy && <span className={`font-mono text-[9px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>EAN: {item.kodPomocniczy}</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className={`text-xs font-bold ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>
                🎉 Wszystkie pozycje z listy dla tej strefy zostały zliczone!
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
