/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Scan, Sparkles, Keyboard, CheckCircle } from 'lucide-react';
import { InventoryItem } from '../types';

interface ManualBarcodeEntryProps {
  onScan: (barcode: string) => void;
  activeLocationItems: InventoryItem[];
  otherLocationItems: InventoryItem[];
  currentColor: 'white' | 'green' | 'yellow' | 'red';
  isLocationSelected: boolean;
  onLaunchCamera: () => void;
  isLight?: boolean;
}

export default function ManualBarcodeEntry({
  onScan,
  activeLocationItems,
  currentColor,
  isLocationSelected,
  onLaunchCamera,
  isLight = false,
}: ManualBarcodeEntryProps) {
  const [inputValue, setInputValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep focus on scan field automatically, resembling txtKodKreskowy.SetFocus from Excel
  useEffect(() => {
    if (isLocationSelected && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLocationSelected, currentColor]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Auto-composing scanner wedging inputs (contains carriage returns, newlines, or tabs)
    if (val.includes('\n') || val.includes('\r') || val.includes('\t')) {
      const cleanValue = val.replace(/[\r\n\t]/g, '').trim();
      if (cleanValue) {
        onScan(cleanValue);
        setInputValue('');
        setTimeout(() => inputRef.current?.focus(), 10);
      }
    } else {
      setInputValue(val);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanValue = inputValue.trim();
    if (cleanValue) {
      onScan(cleanValue);
      setInputValue('');
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const cleanValue = inputValue.trim();
      if (cleanValue) {
        onScan(cleanValue);
        setInputValue('');
        setTimeout(() => inputRef.current?.focus(), 10);
      }
    }
  };

  // Get color classes matching the VBA BackColor state definitions
  const getColorClasses = () => {
    switch (currentColor) {
      case 'green':
        return isLight 
          ? 'bg-emerald-55 border-emerald-500 focus:border-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.15)] text-emerald-800'
          : 'bg-emerald-500/25 border-emerald-500/80 focus:border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.2)] text-emerald-100';
      case 'yellow':
        return isLight 
          ? 'bg-amber-55 border-amber-500 focus:border-amber-600 shadow-[0_0_12px_rgba(245,158,11,0.15)] text-amber-800'
          : 'bg-amber-500/25 border-amber-500/80 focus:border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.2)] text-amber-100';
      case 'red':
        return isLight 
          ? 'bg-rose-55 border-rose-500 focus:border-rose-600 shadow-[0_0_12px_rgba(239,68,68,0.15)] text-rose-800'
          : 'bg-rose-500/25 border-rose-500/80 focus:border-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.2)] text-rose-100';
      case 'white':
      default:
        return isLight 
          ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-teal-600 placeholder:text-slate-400'
          : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-teal-500';
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
          <h4 className={`font-extrabold text-sm ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>txtKodKreskowy (Skaner)</h4>
        </div>
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
          Uruchom Kamerę
        </button>
      </div>

      {/* Input row */}
      <form onSubmit={handleSubmit} className="relative">
        <input
          id="barcode_scanner_input"
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={!isLocationSelected}
          placeholder={isLocationSelected ? "Zeskanuj / Wpisz kod kreskowy i kliknij Enter..." : "Najpierw wybierz lokalizację..."}
          className={`w-full pr-14 rounded-2xl p-4 text-center font-mono text-lg font-semibold border-2 tracking-wider placeholder:font-sans placeholder:tracking-normal placeholder:text-sm focus:outline-none transition-all ${getColorClasses()}`}
        />
        <button
          type="submit"
          disabled={!isLocationSelected || !inputValue.trim()}
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all flex items-center justify-center ${
            inputValue.trim()
              ? 'bg-teal-500 hover:bg-teal-400 text-slate-950 cursor-pointer shadow-xs'
              : 'text-slate-400 opacity-40'
          }`}
          title="Zatwierdź kod"
        >
          <CheckCircle className="h-5 w-5" />
        </button>
      </form>

      {/* VBA Indicator state label */}
      {isLocationSelected && (
        <div className="flex items-center justify-between text-xs">
          <span className={isLight ? 'text-slate-500 font-medium' : 'text-slate-400'}>Status pola skanowania:</span>
          {currentColor === 'white' && <span className={`${isLight ? 'text-slate-600' : 'text-slate-450'} font-semibold`}>Oczekiwanie</span>}
          {currentColor === 'green' && <span className={`${isLight ? 'text-emerald-700 font-bold' : 'text-emerald-400'} font-bold`}>Poprawny odczyt (+1)</span>}
          {currentColor === 'yellow' && <span className={`${isLight ? 'text-amber-700 font-bold' : 'text-amber-400'} font-bold`}>Dodatkowy wiersz / Nadwyżka</span>}
          {currentColor === 'red' && <span className={`${isLight ? 'text-rose-700 font-bold' : 'text-rose-400'} font-bold`}>Artykuł spoza listy / Błąd</span>}
        </div>
      )}

      {/* SIMULATOR ASSISTANT */}
      {isLocationSelected && (
        <div className={`border-t pt-4 mt-1 ${isLight ? 'border-slate-100' : 'border-slate-800/80'}`}>
          <h5 className={`text-xs font-bold flex items-center gap-1.5 mb-2.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            📟 Panel Symulatora Laserowego
          </h5>
          <div className="space-y-4">
            
            {/* Active items ready to scan */}
            {activeLocationItems.length > 0 ? (
              <div>
                <p className={`text-[10px] uppercase tracking-widest font-bold mb-2 flex items-center gap-1 ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                  <CheckCircle className={`h-3.5 w-3.5 ${isLight ? 'text-emerald-600' : 'text-emerald-500'}`} /> PRODUKTY W TEJ LOKALIZACJI (KLIKNIJ, ABY SKOPIOWAĆ DO SKANERA):
                </p>
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
                            ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-800 shadow-2xs'
                            : 'bg-slate-950 border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                        title="Skopiuj kod EAN"
                      >
                        <span className={`font-extrabold text-[10px] leading-none mb-1 truncate w-full ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>{item.nazwa}</span>
                        <span className={`font-mono text-[10px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>EAN: {auxCode}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className={`text-xs font-bold ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>
                  🎉 Wszystkie pozycje z listy dla tej strefy zostały w pełni zliczone i poprawne!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
