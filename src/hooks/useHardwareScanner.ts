import React, { useEffect, useRef, useCallback } from 'react';

interface UseHardwareScannerOptions {
  onScan: (barcode: string) => void;
  isEnabled?: boolean;
  timeout?: number;
}

interface UseHardwareScannerReturn {
  phantomInputRef: React.RefObject<HTMLInputElement | null>;
  phantomInputProps: React.InputHTMLAttributes<HTMLInputElement>;
  refocus: () => void;
}

/**
 * Hook dla sprzętowych skanerów Android działających jako emulator klawiatury.
 *
 * ## Trójwarstwowa architektura odbioru sygnału
 *
 * Różne modele skanerów i przeglądarki działają inaczej. Żeby obsłużyć
 * obecne i przyszłe urządzenia, hook implementuje 3 niezależne mechanizmy:
 *
 * WARSTWA 1 — window.addEventListener('keydown')
 *   Działa na: desktop, stary Android, każda przeglądarka gdy COKOLWIEK ma focus.
 *   Nie działa na: Mobile Chrome bez aktywnego focusa (blokada systemu).
 *
 * WARSTWA 2 — onKeyDown na phantom input (niewidoczny, stale sfocusowany)
 *   Działa na: Mobile Chrome z focusem na elemencie.
 *   Klucz: inputMode="text" — NIE "none"! "none" odcina dostarczanie HID events.
 *   Phantom input ma always-on focus przez mechanizm onBlur→refocus.
 *
 * WARSTWA 3 — onChange na phantom input (bufor wartości)
 *   Działa na: skanery IME-based (wstrzykują przez warstwę IME Androida,
 *   nie przez raw keydown). Wartość akumuluje się w inpucie → wykrywamy \n/\r.
 *
 * Deduplicator: jeśli te same znaki dotrą z dwóch warstw jednocześnie,
 * ostatni skan jest ignorowany przez 200ms.
 *
 * ## Uwaga nt. wirtualnej klawiatury
 * inputMode="text" może wywołać wirtualną klawiaturę na Androidzie przy fokusie.
 * Na dedykowanych kolektorach danych (PM95, PM560 itp.) jest to akceptowalne —
 * pracownicy używają skanera, nie wirtualnej klawiatury.
 */
export function useHardwareScanner({
  onScan,
  isEnabled = true,
  timeout = 50,
}: UseHardwareScannerOptions): UseHardwareScannerReturn {
  const buffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);
  const phantomInputRef = useRef<HTMLInputElement | null>(null);

  // Deduplicator: timestamp ostatniego przetworzonego skanu + jego treść
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  /**
   * Centralna funkcja przetwarzania kodu — wywoływana przez WSZYSTKIE warstwy.
   * Zawiera deduplicator: ten sam kod w ciągu 300ms jest ignorowany.
   */
  const processScan = useCallback((rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code || code.length < 2) return;

    const now = Date.now();
    if (
      code === lastScanRef.current.code &&
      now - lastScanRef.current.time < 300
    ) {
      // Duplikat z innej warstwy — ignorujemy
      return;
    }

    lastScanRef.current = { code, time: now };
    onScan(rawCode.trim());
  }, [onScan]);

  // ─── WARSTWA 1: window.addEventListener (fallback) ─────────────────────────

  const windowBuffer = useRef<string>('');
  const windowLastKeyTime = useRef<number>(0);

  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (!isEnabled) return;

      // Jeśli phantom input ma focus → Warstwa 2 obsłuży ten event (nie duplikujemy)
      if (phantomInputRef.current && document.activeElement === phantomInputRef.current) {
        return;
      }

      // Ignoruj zdarzenia z prawdziwych pól tekstowych (użytkownik pisze ręcznie)
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const now = Date.now();
      if (now - windowLastKeyTime.current > timeout) {
        windowBuffer.current = '';
      }
      windowLastKeyTime.current = now;

      if (e.key === 'Enter') {
        const code = windowBuffer.current.trim();
        if (code.length > 0) processScan(code);
        windowBuffer.current = '';
        e.preventDefault();
      } else if (e.key.length === 1) {
        windowBuffer.current += e.key;
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [isEnabled, processScan, timeout]);

  // ─── WARSTWA 2: onKeyDown na phantom input ──────────────────────────────────

  const handlePhantomKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isEnabled) return;

      const now = Date.now();
      if (now - lastKeyTime.current > timeout) {
        buffer.current = '';
      }
      lastKeyTime.current = now;

      if (e.key === 'Enter') {
        e.preventDefault();
        // Pobierz kod z bufora keydown LUB z aktualnej wartości inputa (IME fallback)
        const inputVal = (e.target as HTMLInputElement).value.replace(/[\r\n]/g, '').trim();
        const code = buffer.current.trim() || inputVal;
        if (code.length > 0) processScan(code);
        buffer.current = '';
        // Wyczyść wartość niekontrolewanego inputa
        (e.target as HTMLInputElement).value = '';
      } else if (e.key === 'Unidentified') {
        // Znak LF (0x0A) na niektórych kolektorach Zebra/Urovo pojawia się jako 'Unidentified'
        const inputVal = (e.target as HTMLInputElement).value.replace(/[\r\n]/g, '').trim();
        const code = buffer.current.trim() || inputVal;
        if (code.length > 0) processScan(code);
        buffer.current = '';
        (e.target as HTMLInputElement).value = '';
      } else if (e.key.length === 1) {
        buffer.current += e.key;
      }
    },
    [isEnabled, processScan, timeout]
  );

  // ─── WARSTWA 3: onChange (skanery IME-based) ────────────────────────────────

  const handlePhantomChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isEnabled) return;

      const value = e.target.value;

      // Skanery IME-based dodają LF lub CR jako terminator na końcu wartości
      if (value.includes('\n') || value.includes('\r')) {
        const code = value.replace(/[\r\n]/g, '').trim();
        if (code.length > 0) processScan(code);
        // Reset — niekontrolowany input, więc piszemy bezpośrednio
        e.target.value = '';
        buffer.current = '';
      }
      // Brak terminatora → wartość akumuluje się, onChange wywoła się ponownie
    },
    [isEnabled, processScan]
  );

  // ─── Logika refocus ─────────────────────────────────────────────────────────

  const refocus = useCallback(() => {
    if (!phantomInputRef.current) return;

    const activeEl = document.activeElement;
    const isRealInputFocused =
      activeEl !== null &&
      activeEl !== phantomInputRef.current &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable);

    if (!isRealInputFocused) {
      phantomInputRef.current.focus({ preventScroll: true });
    }
  }, []);

  const handleBlur = useCallback(() => {
    // Mikro-opóźnienie: pozwala nowemu elementowi przejąć focus zanim sprawdzimy stan
    setTimeout(refocus, 50);
  }, [refocus]);

  // ─── Inicjalne ustawienie focusa ─────────────────────────────────────────────

  useEffect(() => {
    if (isEnabled) {
      const timer = setTimeout(refocus, 150);
      return () => clearTimeout(timer);
    }
  }, [isEnabled, refocus]);

  // ─── Reset bufora przy wyłączeniu ───────────────────────────────────────────

  useEffect(() => {
    if (!isEnabled) {
      buffer.current = '';
      windowBuffer.current = '';
    }
  }, [isEnabled]);

  const phantomInputProps: React.InputHTMLAttributes<HTMLInputElement> = {
    // KLUCZOWE: "text" (nie "none"!) — "none" odcina dostarczanie HID keyboard events na Androidzie
    inputMode: 'text',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
    onKeyDown: handlePhantomKeyDown,
    onChange: handlePhantomChange,
    onBlur: handleBlur,
    defaultValue: '',
  };

  return {
    phantomInputRef,
    phantomInputProps,
    refocus,
  };
}
