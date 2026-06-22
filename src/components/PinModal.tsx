/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ShieldAlert, Delete, X, Eye, EyeOff } from 'lucide-react';
import { sounds } from '../utils/sound';

interface PinModalProps {
  correctPin: string;
  onSuccess: () => void;
  onClose: () => void;
  isLight?: boolean;
}

export default function PinModal({ correctPin, onSuccess, onClose, isLight = false }: PinModalProps) {
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);

  const handleKeyPress = (num: string) => {
    setErrorMsg('');
    if (enteredPin.length < 8) {
      setEnteredPin(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    setErrorMsg('');
    setEnteredPin(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setErrorMsg('');
    setEnteredPin('');
  };

  const handleSubmit = () => {
    if (enteredPin === correctPin) {
      sounds.playSuccess();
      onSuccess();
    } else {
      sounds.playError();
      setErrorMsg("Błędny kod PIN!");
      setEnteredPin('');
    }
  };

  return (
    <div id="pin_modal_wrapper" className={`fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center transition-colors ${
      isLight ? 'bg-slate-900/30 backdrop-blur-sm' : 'bg-slate-950/80'
    }`}>
      <div id="pin_modal_card" className={`w-full max-w-sm rounded-3xl border p-6 shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full mb-2 ${
            isLight ? 'bg-amber-100 text-amber-600' : 'bg-amber-500/10 text-amber-500'
          }`}>
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h3 className={`text-lg font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>Dostęp Zabezpieczony</h3>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Podaj kod PIN, aby otworzyć konfigurację inwentaryzacji</p>
        </div>

        {/* PIN Displays */}
        <div className="my-6">
          <div className={`relative flex h-14 w-full items-center justify-between rounded-xl px-4 border transition-colors ${
            isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800'
          }`}>
            <div className={`flex-1 text-center font-mono text-2xl tracking-[0.5em] ${
              isLight ? 'text-slate-800' : 'text-slate-100'
            }`}>
              {enteredPin.length > 0 ? (
                showPin ? enteredPin : "●".repeat(enteredPin.length)
              ) : (
                <span className={`text-sm font-sans tracking-normal ${
                  isLight ? 'text-slate-400' : 'text-slate-600'
                }`}>Wpisz PIN...</span>
              )}
            </div>
            {enteredPin.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className={`transition-colors cursor-pointer ${
                  isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
          {errorMsg && (
            <p className="mt-2 text-center text-xs font-semibold text-rose-500 animate-pulse">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Touch Numeric Pad */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => handleKeyPress(num)}
              className={`flex h-14 items-center justify-center rounded-xl text-lg font-bold border transition-all active:scale-95 cursor-pointer ${
                isLight 
                  ? 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50 active:bg-slate-100 shadow-sm'
                  : 'bg-slate-800 text-slate-100 border-slate-700/50 hover:bg-slate-700 active:bg-slate-600'
              }`}
            >
              {num}
            </button>
          ))}
          
          <button
            type="button"
            onClick={handleClear}
            className={`flex h-14 items-center justify-center rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              isLight
                ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 active:bg-slate-300'
                : 'bg-slate-800 text-slate-400 border-slate-700/50 hover:bg-slate-700 active:bg-slate-600'
            }`}
          >
            WYCZYŚĆ
          </button>
          
          <button
            key="0"
            type="button"
            onClick={() => handleKeyPress("0")}
            className={`flex h-14 items-center justify-center rounded-xl text-lg font-bold border transition-all active:scale-95 cursor-pointer ${
              isLight 
                ? 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50 active:bg-slate-100 shadow-sm'
                : 'bg-slate-800 text-slate-100 border-slate-700/50 hover:bg-slate-700 active:bg-slate-600'
            }`}
          >
            0
          </button>
          
          <button
            type="button"
            onClick={handleBackspace}
            className={`flex h-14 items-center justify-center rounded-xl border transition-all cursor-pointer ${
              isLight
                ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 active:bg-slate-300'
                : 'bg-slate-800 text-slate-300 border-slate-700/50 hover:bg-slate-700 active:bg-slate-600'
            }`}
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all cursor-pointer text-center border ${
              isLight
                ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50 active:bg-slate-100'
                : 'bg-slate-800 text-slate-300 border-transparent hover:bg-slate-700 active:bg-slate-600'
            }`}
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={enteredPin.length === 0}
            className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all cursor-pointer text-center ${
              isLight
                ? 'bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 disabled:pointer-events-none active:bg-teal-700'
                : 'bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50 disabled:pointer-events-none active:bg-teal-600'
            }`}
          >
            Zaloguj
          </button>
        </div>

      </div>
    </div>
  );
}
