/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Delete } from 'lucide-react';

interface NumpadProps {
  value: string;
  onChange: (newValue: string) => void;
  onEnter?: () => void;
  isLight?: boolean;
}

export default function Numpad({ value, onChange, onEnter, isLight }: NumpadProps) {
  const handlePress = (num: string) => {
    if (value === '0') onChange(num);
    else onChange(value + num);
  };

  const handleBackspace = () => {
    if (value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const bgBtn = isLight ? 'bg-white border-slate-200 hover:bg-slate-100 text-slate-800' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-100';
  const shadow = isLight ? 'shadow-sm' : 'shadow-md shadow-black/40';

  return (
    <div className="grid grid-cols-3 gap-2 w-full mt-4 select-none">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
        <button
          key={num}
          type="button"
          onClick={() => handlePress(num.toString())}
          className={`h-14 sm:h-16 rounded-xl border font-bold text-xl sm:text-2xl transition-all cursor-pointer active:scale-95 ${bgBtn} ${shadow}`}
        >
          {num}
        </button>
      ))}
      <button
        type="button"
        onClick={() => handlePress('0')}
        className={`col-span-2 h-14 sm:h-16 rounded-xl border font-bold text-xl sm:text-2xl transition-all cursor-pointer active:scale-95 ${bgBtn} ${shadow}`}
      >
        0
      </button>
      <button
        type="button"
        onClick={handleBackspace}
        className={`h-14 sm:h-16 flex items-center justify-center rounded-xl border transition-all cursor-pointer active:scale-95 ${
          isLight ? 'bg-rose-100 border-rose-200 hover:bg-rose-200 text-rose-700' : 'bg-rose-950 border-rose-800 hover:bg-rose-900 text-rose-500'
        } ${shadow}`}
      >
        <Delete className="h-6 w-6" />
      </button>
    </div>
  );
}
