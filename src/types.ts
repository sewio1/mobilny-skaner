/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface InventoryItem {
  id: string; // Unique ID to manage local edits and added records
  rowNum: number; // Row number reference in the original sheet
  lokalizacja: string; // "Nr miejsca" - Location e.g., REG-A-01
  kodGlowny: string; // "Nr artykułu" - Main Article Number
  kodPomocniczy: string; // "EAN" - Auxiliary Barcode/EAN
  nazwa: string; // "Nazwa artykułu" - Product name
  sj: string; // "SJ" - Quality status (e.g., "0", "A", "B", "")
  iloscSystemowa: number; // "Ilość" - Expected system quantity
  licz1: number | null; // "Ilość I Licz." - First count
  licz2: number | null; // "Ilość II Licz." - Second count
  licz3: number | null; // "Ilość III Licz." - Third count
  osoba1?: string; // Controller for count 1
  osoba2?: string; // Controller for count 2
  osoba3?: string; // Controller for count 3
  lp: string; // "LP." - Row index
  partia: string; // "Partia" - Batch details
  dataWaznosci: string; // "Data ważn." - Expiration Date
  adnotacje: string; // "Adnotacje" - Comments
  isNew?: boolean; // Marker if this row was manually added on mobile
  customFields?: Record<string, string>; // Extra dynamic columns from Excel
}

export interface InventoryConfig {
  pin: string; // Access security PIN (default: "1234")
  skanZbiorczy: boolean; // B2: Skan zbiorczy - bulk scanning toggle
  weryfikacjaPartii: boolean; // B3: Weryfikacja partii i daty toggle
  limitIlosci: number; // B4: Threshold above which bulk scanning triggers
  ignorowanePartie: string; // B5: Semicolon-separated lot/batch names to ignore e.g. "0;000;brak;-"
  pokazujInnaLok: boolean; // B6: Inform user of original location when scanned incorrectly
  pozwalajDodawac: boolean; // B7: Allow adding unrecognized/wrong items
  motyw?: 'light' | 'dark'; // Light or dark theme preference
  workerName?: string; // Przez kogo został podjęty (osoba licząca)
}

export type CountRound = '1' | '2' | '3';

export interface ScanLog {
  timestamp: string;
  barcode: string;
  itemCode: string;
  itemDescription: string;
  location: string;
  status: 'sukces' | 'nadwyzka' | 'nowy' | 'bladdokacji' | 'nieznany';
  details: string;
}
