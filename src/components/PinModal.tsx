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
}

export default function PinModal({ correctPin, onSuccess, onClose }: PinModalProps) {
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
    <div id="pin_modal_wrapper" className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
      <div id="pin_modal_card" className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 mb-2">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-100">Dostęp Zabezpieczony</h3>
          <p className="text-xs text-slate-400 mt-1">Podaj kod PIN, aby otworzyć konfigurację inwentaryzacji</p>
        </div>

        {/* PIN Displays */}
        <div className="my-6">
          <div className="relative flex h-14 w-full items-center justify-between rounded-xl bg-slate-950 px-4 border border-slate-800">
            <div className="flex-1 text-center font-mono text-2xl tracking-[0.5em] text-slate-100">
              {enteredPin.length > 0 ? (
                showPin ? enteredPin : "●".repeat(enteredPin.length)
              ) : (
                <span className="text-sm font-sans tracking-normal text-slate-600">Wpisz PIN...</span>
              )}
            </div>
            {enteredPin.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
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
              className="flex h-14 items-center justify-center rounded-xl bg-slate-800 text-lg font-bold text-slate-100 border border-slate-700/50 hover:bg-slate-700 active:bg-slate-600 transition-all active:scale-95 cursor-pointer"
            >
              {num}
            </button>
          ))}
          
          <button
            type="button"
            onClick={handleClear}
            className="flex h-14 items-center justify-center rounded-xl bg-slate-800 text-xs font-bold text-slate-400 border border-slate-700/50 hover:bg-slate-700 active:bg-slate-600 transition-all cursor-pointer"
          >
            WYCZYŚĆ
          </button>
          
          <button
            key="0"
            type="button"
            onClick={() => handleKeyPress("0")}
            className="flex h-14 items-center justify-center rounded-xl bg-slate-800 text-lg font-bold text-slate-100 border border-slate-700/50 hover:bg-slate-700 active:bg-slate-600 transition-all active:scale-95 cursor-pointer"
          >
            0
          </button>
          
          <button
            type="button"
            onClick={handleBackspace}
            className="flex h-14 items-center justify-center rounded-xl bg-slate-800 text-slate-300 border border-slate-700/50 hover:bg-slate-700 active:bg-slate-600 transition-all cursor-pointer"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 text-sm font-semibold rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 active:bg-slate-600 transition-all cursor-pointer text-center"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={enteredPin.length === 0}
            className="flex-1 py-3 text-sm font-semibold rounded-xl bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50 disabled:pointer-events-none active:bg-teal-600 transition-all cursor-pointer text-center"
          >
            Zaloguj
          </button>
        </div>

      </div>
    </div>
  );
}
