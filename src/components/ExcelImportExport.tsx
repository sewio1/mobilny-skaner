/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { exportToExcel, exportDiscrepancyReport } from '../utils/excelHelper';
import { Upload, Download, Mail, CheckCircle2, AlertTriangle, FileSpreadsheet, Send, ArrowRight, X, Lock, Unlock } from 'lucide-react';
import { InventoryItem } from '../types';
import { sounds } from '../utils/sound';

interface ExcelImportExportProps {
  items: InventoryItem[];
  onImport: (newItems: InventoryItem[]) => void;
  onResetToDemo: () => void;
  theme?: 'light' | 'dark';
  workerName?: string;
  countRound?: string;
}

export default function ExcelImportExport({ items, onImport, onResetToDemo, theme = 'dark', workerName, countRound = '1' }: ExcelImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMailOpen, setIsMailOpen] = useState<boolean>(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);
  
  // Mail State matching VBA const exactly
  const [toEmail, setToEmail] = useState<string>("gp4.administracja@fulfilio.com");
  const [ccEmail, setCcEmail] = useState<string>("");
  const [subject, setSubject] = useState<string>("Inwentaryzacja_Dane");
  const [sendingState, setSendingState] = useState<'idle' | 'sending' | 'success'>('idle');

  const [dragActive, setDragActive] = useState<boolean>(false);
  const [importReport, setImportReport] = useState<{ count: number; locations: number } | null>(null);
  const [isPanelExpanded, setIsPanelExpanded] = useState<boolean>(false);
  const [sliderValue, setSliderValue] = useState<number>(0);

  // Helper helper to normalize Polish characters and special marks
  const normalizeStr = (str: string): string => {
    return str
      .toLowerCase()
      .trim()
      .replace(/ł/g, "l")
      .replace(/ą/g, "a")
      .replace(/ć/g, "c")
      .replace(/ę/g, "e")
      .replace(/ń/g, "n")
      .replace(/ó/g, "o")
      .replace(/ś/g, "s")
      .replace(/ź/g, "z")
      .replace(/ż/g, "z")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // removes general diacritics
      .replace(/[^a-z0-9]/g, ""); // strip space and punctuation for sturdy comparison
  };

  // --- PARSE IMPORTED EXCEL WORKBOOKS (VBA ImportujNoweDane_Wersja9) ---
  const handleFiles = async (files: FileList | File[]) => {
    const allParsedItems: InventoryItem[] = [];
    const uniqueLocs = new Set<string>();
    let hasError = false;
    let errorMsg = "";

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const data = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) resolve(e.target.result as ArrayBuffer);
            else reject(new Error("Brak danych w pliku"));
          };
          reader.onerror = (err) => reject(err);
          reader.readAsArrayBuffer(file);
        });

        const workbook = XLSX.read(data, { type: 'array' });
        // Use the first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: "" });

        if (rawRows.length === 0) continue;

        // Detect columns from headers
        const firstRowKeys = Object.keys(rawRows[0]);

        // Helper to match column headers even if there are subtle differences (VBA mapping simulation)
        const findColumn = (possibleNames: string[]): string => {
          // 1. First, search for exact case-insensitive normalized matches (Very high priority)
          for (const possible of possibleNames) {
            const normP = normalizeStr(possible);
            for (const key of firstRowKeys) {
              if (normalizeStr(key) === normP) {
                return key;
              }
            }
          }

          // 2. Second, case-insensitive simple trimmed exact matches
          for (const possible of possibleNames) {
            const lowerP = possible.toLowerCase().trim();
            for (const key of firstRowKeys) {
              const lowerKey = key.toLowerCase().trim();
              if (lowerKey === lowerP) {
                return key;
              }
            }
          }

          // 3. Third, check normalized inclusion (with safe safeguards to avoid matching generic words)
          for (const possible of possibleNames) {
            const normP = normalizeStr(possible);
            if (normP.length < 3) continue; // too short to prevent collision (e.g. "lp" or "sj")
            for (const key of firstRowKeys) {
              const normKey = normalizeStr(key);
              // Avoid partial match false positive for "ilość" vs "ilość i licz"
              if (normP === "ilosc" && normKey.includes("licz")) {
                continue; // Do not match 'ilosc' to 'ilosc i licz'
              }
              if (normKey === normP || normKey.includes(normP)) {
                return key;
              }
            }
          }

          // 4. Last fallback: soft substring search
          for (const possible of possibleNames) {
            const lowerP = possible.toLowerCase().trim();
            for (const key of firstRowKeys) {
              const lowerKey = key.toLowerCase().trim();
              if (lowerKey.includes(lowerP) || lowerP.includes(lowerKey)) {
                // safeguard
                if (lowerP === "ilosc" && lowerKey.includes("licz")) {
                  continue;
                }
                return key;
              }
            }
          }
          return "";
        };

        const colLokalizacjaKey = findColumn(["nr miejsca", "lokalizacja", "miejsc", "strefa", "location", "miejsce", "adres"]);
        const colKodGlownyKey = findColumn(["nr artykulu", "nr artykulu", "kod artykulu", "kod", "article", "sku", "indeks", "nr towaru", "kod towaru", "towar"]);
        const colKodPomocniczyKey = findColumn(["ean", "kod pomocniczy", "pomocniczy", "barcode", "kod kreskowy", "kody pomocnicze"]);
        const colNazwaKey = findColumn(["nazwa artykulu", "nazwa", "opisz", "product", "description", "nazwa towaru", "opis"]);
        const colSJKey = findColumn(["sj", "status jakosci", "jakosc", "status", "jakosć"]);
        const colSystemowaKey = findColumn(["ilosc", "ilosc systemowa", "systemowa", "qty", "quantity", "ilość", "stan", "stan systemowy"]);
        const colLicz1Key = findColumn(["ilosc i licz", "licz 1", "licz1", "count 1", "i liczenie", "spis 1", "licz_1"]);
        const colLicz2Key = findColumn(["ilosc ii licz", "licz 2", "licz2", "count 2", "ii liczenie", "spis 2", "licz_2"]);
        const colLicz3Key = findColumn(["ilosc iii licz", "licz 3", "licz3", "count 3", "iii liczenie", "spis 3", "licz_3"]);
        const colLpKey = findColumn(["lp.", "lp", "index", "l.p.", "liczba porządkowa"]);
        const colPartiaKey = findColumn(["partia", "lot", "batch", "nr partii", "seria", "numer serii"]);
        const colDataKey = findColumn(["data wazn", "data waznosci", "data", "expiry", "date", "data ważności", "termin ważności"]);
        const colAdnotacjeKey = findColumn(["adnotacje", "uwagi", "annotations", "komentarz"]);
        const colNosnikKey = findColumn(["nr nośnika", "nośnik", "nosnik", "sscc", "paleta", "nr palety"]);

        const knownKeys = new Set([
          colLokalizacjaKey, colKodGlownyKey, colKodPomocniczyKey, colNazwaKey, 
          colSJKey, colSystemowaKey, colLicz1Key, colLicz2Key, colLicz3Key, 
          colLpKey, colPartiaKey, colDataKey, colAdnotacjeKey, colNosnikKey
        ].filter(Boolean));

        if (!colLokalizacjaKey || !colKodGlownyKey) {
          throw new Error(`Plik ${file.name}: Nie można odnaleźć kluczowych kolumn (Nr miejsca lub Nr artykułu).`);
        }

        const parsedItems: InventoryItem[] = rawRows.map((row: any, index: number) => {
          const rawQty = parseFloat(row[colSystemowaKey]);
          const qty = isNaN(rawQty) ? 0 : rawQty;

          const l1 = row[colLicz1Key] !== undefined && row[colLicz1Key] !== "" ? parseFloat(row[colLicz1Key]) : null;
          const l2 = row[colLicz2Key] !== undefined && row[colLicz2Key] !== "" ? parseFloat(row[colLicz2Key]) : null;
          const l3 = row[colLicz3Key] !== undefined && row[colLicz3Key] !== "" ? parseFloat(row[colLicz3Key]) : null;

          const customFields: Record<string, string> = {};
          for (const key of firstRowKeys) {
            if (!knownKeys.has(key)) {
              const val = row[key];
              if (val !== undefined && val !== null && String(val).trim() !== "") {
                customFields[key] = String(val).trim();
              }
            }
          }

          return {
            id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            rowNum: index + 2,
            lokalizacja: String(row[colLokalizacjaKey]).trim(),
            kodGlowny: String(row[colKodGlownyKey]).trim(),
            kodPomocniczy: colKodPomocniczyKey ? String(row[colKodPomocniczyKey]).trim() : "",
            nazwa: colNazwaKey ? String(row[colNazwaKey]).trim() : `Artykuł ${row[colKodGlownyKey]}`,
            sj: colSJKey ? String(row[colSJKey]).trim() : "0",
            iloscSystemowa: qty,
            licz1: isNaN(l1 as any) ? null : l1,
            licz2: isNaN(l2 as any) ? null : l2,
            licz3: isNaN(l3 as any) ? null : l3,
            lp: colLpKey ? String(row[colLpKey]).trim() : String(index + 1),
            partia: colPartiaKey ? String(row[colPartiaKey]).trim() : "",
            dataWaznosci: colDataKey ? String(row[colDataKey]).trim() : "",
            adnotacje: colAdnotacjeKey ? String(row[colAdnotacjeKey]).trim() : "",
            nosnik: colNosnikKey ? String(row[colNosnikKey]).trim() : "",
            customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
          };
        });

        parsedItems.forEach(i => {
          allParsedItems.push(i);
          uniqueLocs.add(i.lokalizacja);
        });

      } catch (err: any) {
        hasError = true;
        errorMsg = err.message || err;
        console.error(`Błąd importu Excela (${file.name}): `, err);
      }
    }

    if (allParsedItems.length > 0) {
      onImport(allParsedItems);
      sounds.playSuccess();
      setImportReport({ count: allParsedItems.length, locations: uniqueLocs.size });
      
      // Hide report alert after 6 seconds
      setTimeout(() => setImportReport(null), 6000);

      if (hasError) {
        try { alert(`Wczytano poprawne pliki, ale zignorowano niektóre błędy:\n${errorMsg}`); } catch (e) {}
      }
    } else {
      sounds.playError();
      try { alert(`Błąd importu: ${hasError ? errorMsg : 'Brak danych w plikach'}`); } catch (e) {}
    }
    
    // Reset the input so the same files can be re-selected if needed
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  // --- BUILD & EXPORT SPREADSHEET (VBA ZapiszArkuszDaneNaDysku) ---
  const handleExport = () => {
    exportToExcel(
      items, 
      () => { sounds.playSuccess(); }, 
      (msg) => { 
        sounds.playError();
        try { alert(msg); } catch (e) {} 
      },
      workerName
    );
  };

  const handleExportDiff = () => {
    exportDiscrepancyReport(
      items, 
      (msg) => { 
        if (msg.includes("Brak")) sounds.playError();
        else sounds.playSuccess(); 
        try { alert(msg); } catch (e) {}
      }, 
      (msg) => { 
        sounds.playError();
        try { alert(msg); } catch (e) {} 
      },
      workerName,
      countRound
    );
  };

  // --- EMAIL SENDER (VBA WyslijPlikMailem) ---
  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setSendingState('sending');

    // Simulate authentic Outlook SMTP pipeline animation
    setTimeout(() => {
      setSendingState('success');
      sounds.playSuccess();
      
      // Auto close and clean the sheet attachment
      setTimeout(() => {
        setIsMailOpen(false);
        setSendingState('idle');
      }, 3000);

    }, 2500);
  };

  const isLight = theme === 'light';

  // Computed styles based on theme
  const cCard = isLight ? "bg-white border border-slate-200 shadow-xs" : "bg-slate-900 border border-slate-800/80";
  const cTextTitle = isLight ? "text-slate-900" : "text-slate-100";
  const cTextMuted = isLight ? "text-slate-500 font-medium" : "text-slate-400";
  const cTextLabel = isLight ? "text-slate-600 font-bold" : "text-slate-400 font-medium";
  const cDragBorder = isLight 
    ? (dragActive ? "border-teal-500 bg-teal-50/50" : "border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50") 
    : (dragActive ? "border-teal-400 bg-teal-500/10" : "border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60");
  const cDragText = isLight ? "text-slate-800" : "text-slate-300";
  const cDragBtn = isLight ? "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs" : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700";
  const cBtnSec = isLight ? "bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200 shadow-xs" : "bg-slate-800 hover:bg-slate-700 border border-slate-755 text-slate-100";
  const cBtnMail = isLight ? "bg-emerald-600 hover:bg-emerald-505 text-white active:bg-emerald-700 shadow-xs" : "bg-emerald-500 hover:bg-emerald-400 text-slate-950";
  return (
    <div id="excel_panel_holder" className="flex flex-col gap-5">
      
      {/* Excel Operations box */}
      <div className={`${cCard} rounded-3xl shadow-sm transition-colors duration-200 overflow-hidden`}>
        
        {!isPanelExpanded ? (
          <div className="p-5 flex flex-col gap-5 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-2">
              <Lock className={`h-5 w-5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
              <h4 className={`font-bold ${cTextTitle} text-sm`}>Awaryjny panel plików lokalnych</h4>
            </div>
            
            <div className={`relative w-full h-12 rounded-full overflow-hidden flex items-center px-1 border ${isLight ? 'bg-slate-200 border-slate-300' : 'bg-slate-800 border-slate-700'}`}>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Przesuń suwak w prawo aby odblokować
                </span>
              </div>
              
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={sliderValue}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setSliderValue(val);
                  if (val > 95) {
                    setIsPanelExpanded(true);
                    setSliderValue(0);
                    sounds.playSuccess();
                  }
                }}
                onMouseUp={() => { if (sliderValue <= 95) setSliderValue(0); }}
                onTouchEnd={() => { if (sliderValue <= 95) setSliderValue(0); }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 m-0"
              />
              
              <div 
                className="absolute left-1 top-1 bottom-1 bg-teal-500 rounded-full pointer-events-none flex items-center justify-end pr-1 transition-all"
                style={{ width: `max(2.5rem, calc(${sliderValue}% - 0.5rem))` }}
              >
                 <div className="h-8 w-8 bg-white rounded-full shadow-sm flex items-center justify-center shrink-0">
                   <Unlock className="h-4 w-4 text-teal-600" />
                 </div>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsPanelExpanded(false)}
            className={`flex items-center justify-between w-full p-5 cursor-pointer transition-colors ${
              isLight ? 'bg-slate-50 border-b border-slate-100 hover:bg-slate-100' : 'bg-slate-800/30 border-b border-slate-800 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet className={`h-5 w-5 ${isLight ? 'text-teal-600' : 'text-teal-400'}`} />
              <h4 className={`font-bold ${cTextTitle} text-sm`}>Awaryjny panel plików lokalnych</h4>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
              <Lock className="h-3.5 w-3.5 text-rose-500" />
              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">
                Zablokuj
              </span>
            </div>
          </button>
        )}

        {isPanelExpanded && (
          <div className="p-5 pt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
            {/* Drag and drop module */}
            <div
              onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={onButtonClick}
          className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${cDragBorder}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.xlsb"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFiles(e.target.files);
              }
            }}
            className="hidden"
          />
          <Upload className={`h-8 w-8 ${isLight ? 'text-slate-400' : 'text-slate-500'} mb-2.5 animate-bounce`} />
          <p className={`text-sm font-semibold ${cDragText}`}>Przeciągnij arkusz Excel (.xlsx, .xlsb)</p>
          <p className="text-xs text-slate-500 mt-1">lub kliknij, aby wybrać dokument z dysku/telefonu</p>
          <div className={`mt-3 px-3 py-1.5 text-[11px] rounded-lg font-bold transition-colors ${cDragBtn}`}>
            Wybierz plik z inwentaryzacją
          </div>
        </div>

        {/* Action triggers */}
        <div className="grid grid-cols-1 gap-3">
          
          <button
            id="download_excel_btn"
            onClick={handleExport}
            disabled={!items || items.length === 0}
            className={`flex items-center justify-center gap-1.5 p-3.5 rounded-2xl text-xs font-bold transition-all ${
              !items || items.length === 0 
                ? 'opacity-50 cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500' 
                : `cursor-pointer ${cBtnSec}`
            }`}
          >
            <Download className={`h-4 w-4 ${(!items || items.length === 0) ? 'text-slate-400' : isLight ? 'text-teal-600 font-extrabold' : 'text-teal-400'}`} />
            Pełny Arkusz
          </button>

        </div>

        {/* Demo reset trigger if they want to discard custom data */}
        <div className={`flex justify-between items-center gap-3 pt-4 border-t ${isLight ? 'border-slate-100' : 'border-slate-800/40'}`}>
          <div className="flex flex-col gap-2 w-full">
            {isConfirmingClear ? (
                <button
                  onClick={() => {
                    onImport([]);
                    try { localStorage.removeItem('mobile_scanner_fb_sheet_id'); } catch(e) {}
                    sounds.playSuccess();
                    setIsConfirmingClear(false);
                  }}
                  className="text-rose-600 dark:text-rose-400 font-bold cursor-pointer transition-colors text-xs text-center w-full bg-rose-500/20 py-2 rounded-lg"
                >
                  Naciśnij ponownie, aby wyczyścić
                </button>
            ) : (
                <button
                  onClick={() => setIsConfirmingClear(true)}
                  className="text-rose-600 dark:text-rose-400 hover:text-rose-500 font-bold hover:underline cursor-pointer transition-colors text-xs text-center w-full"
                >
                  Wyczyść aktualne dane (Usuń lokalny arkusz)
                </button>
            )}
          </div>
        </div>

          </div>
        )}
      </div>

      {/* Success alert of loaded excel data */}
      {importReport && (
        <div className={`flex items-start gap-3 p-4 border rounded-2xl animate-fade-in transition-all duration-200 ${
          isLight ? 'bg-emerald-50 border-emerald-250 text-slate-900' : 'bg-emerald-500/10 border-emerald-500/30 text-slate-300'
        }`}>
          <CheckCircle2 className={`h-5 w-5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'} shrink-0 mt-0.5`} />
          <div>
            <h5 className={`text-xs font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>Import Zakończony Sukcesem!</h5>
            <p className={`text-xs mt-0.5 leading-relaxed ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Zastąpiono poprzednie dane. Wczytano <strong>{importReport.count}</strong> pozycji w <strong>{importReport.locations}</strong> różnych lokalizacjach warehouse.
            </p>
          </div>
        </div>
      )}

      {/* Mailing Dialogue Modal */}
      {isMailOpen && (
        <div id="email_dialogue_wrapper" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div id="email_dialogue_modal" className={`w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 border transition-all duration-200 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border border-slate-800'
          }`}>
            
            {/* Modal Heading */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className={`h-5 w-5 ${isLight ? 'text-teal-600' : 'text-teal-400'}`} />
                <h4 className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'} text-sm`}>Wysyłanie Inwentaryzacji (Outlook)</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsMailOpen(false)}
                className={`rounded-full p-1 transition-colors cursor-pointer ${
                  isLight ? 'text-slate-405 hover:bg-slate-100 text-slate-500' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {sendingState === 'idle' && (
              <form onSubmit={handleSendEmail} className="space-y-4">
                
                {/* To */}
                <div className="flex flex-col gap-1.5">
                  <label className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Główny Adresat (VBA value)</label>
                  <input
                    type="email"
                    required
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    className={`w-full rounded-xl p-2.5 text-xs font-mono transition-all border focus:outline-none ${
                      isLight 
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-teal-600' 
                        : 'bg-slate-950 border border-slate-800 text-slate-100 focus:border-teal-500'
                    }`}
                  />
                </div>

                {/* CC */}
                <div className="flex flex-col gap-1.5">
                  <label className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Adresat DW (Opcjonalnie)</label>
                  <input
                    type="text"
                    value={ccEmail}
                    onChange={(e) => setCcEmail(e.target.value)}
                    className={`w-full rounded-xl p-2.5 text-xs font-mono transition-all border focus:outline-none ${
                      isLight 
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-teal-600' 
                        : 'bg-slate-950 border border-slate-800 text-slate-100 focus:border-teal-500'
                    }`}
                  />
                </div>

                {/* Subject */}
                <div className="flex flex-col gap-1.5">
                  <label className={`text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Temat Wiadomości</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className={`w-full rounded-xl p-2.5 text-xs font-medium transition-all border focus:outline-none ${
                      isLight 
                        ? 'bg-slate-50 border-slate-200 text-slate-950 focus:border-teal-600 font-bold' 
                        : 'bg-slate-950 border border-slate-800 text-slate-100 focus:border-teal-500'
                    }`}
                  />
                </div>

                {/* Attachment Badge */}
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}>
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className={`h-4 w-4 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} />
                    <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>Inwentaryzacja_Dane.xlsx</span>
                  </div>
                  <span className="text-[10px] text-slate-500">Załączono ({items.length} wierszy)</span>
                </div>

                {/* Footer buttons */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsMailOpen(false)}
                    className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                      isLight ? 'text-slate-500 bg-slate-100 hover:bg-slate-200' : 'text-slate-405 bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    className={`flex items-center gap-1 px-5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      isLight ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm' : 'bg-teal-500 hover:bg-teal-400 text-slate-950'
                    }`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Generuj & Wyślij
                  </button>
                </div>

              </form>
            )}

            {sendingState === 'sending' && (
              <div className={`flex flex-col items-center justify-center py-8 text-center ${isLight ? 'text-slate-900' : 'text-slate-300'}`}>
                <Upload className="h-12 w-12 text-teal-500 animate-bounce mb-3" />
                <h5 className="font-semibold text-sm">Pakowanie i Wysyłanie...</h5>
                <p className="text-xs text-slate-500 mt-1 leading-normal max-w-[260px]">
                  Generowanie arkusza Excel, szyfrowanie załącznika i połączenie z serwerem pocztowym Outlook.
                </p>
              </div>
            )}

            {sendingState === 'success' && (
              <div className={`flex flex-col items-center justify-center py-8 text-center ${isLight ? 'text-slate-900' : 'text-slate-300'}`}>
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
                <h5 className={`font-bold text-sm ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>Wiadomość Wysłana!</h5>
                <p className={`text-xs mt-1 max-w-[280px] ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                  Inwentaryzacja została pomyślnie wysłana jako raport do <strong>{toEmail}</strong>.
                </p>
                <div className={`mt-4 px-3 py-1.5 rounded-xl text-[10px] text-slate-500 border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  Kod Outlook status: 200 OK
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
