import React, { useState } from 'react';
import { User } from 'lucide-react';

interface WorkerNameModalProps {
  isOpen: boolean;
  onSave: (name: string) => void;
  isLight: boolean;
  defaultName?: string;
}

export default function WorkerNameModal({ isOpen, onSave, isLight, defaultName = "" }: WorkerNameModalProps) {
  const [name, setName] = useState(defaultName);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length >= 2) {
      onSave(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl ${
        isLight ? 'bg-white border text-slate-800' : 'bg-slate-900 border border-slate-700 text-slate-100'
      }`}>
        <div className="flex flex-col items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-teal-500/20 flex items-center justify-center mb-4 text-teal-500 border border-teal-500/30">
            <User className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-center">Przedstaw się</h2>
          <p className="text-xs text-center mt-2 opacity-70">
            Podaj swoje imię, abyśmy wiedzieli, kto wykonuje skanowanie regałów.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-2 opacity-80 uppercase tracking-wider">
              Twoje Imię lub ID
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Jan Kowalski"
              className={`w-full px-4 py-3 rounded-xl border text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            />
          </div>
          <button
            type="submit"
            disabled={name.trim().length < 2}
            className={`w-full py-4 rounded-xl font-bold text-sm tracking-wide bg-teal-500 hover:bg-teal-400 text-slate-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            ROZPOCZNIJ PRACĘ
          </button>
        </form>
      </div>
    </div>
  );
}
