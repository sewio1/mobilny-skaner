/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useContext } from 'react';
import { 
  Warehouse, Play, Search, RotateCcw, AlertTriangle, 
  CheckSquare, Check, X, Shield, RefreshCw, KeyRound, ArrowRight,
  ClipboardList, PlusCircle, Trash, Info, Sun, Moon, Database, LogOut
} from 'lucide-react';

import { InventoryItem, InventoryConfig, CountRound, ScanLog } from '../types';
import { DEMO_INVENTORY, DEFAULT_CONFIG } from '../demoData';
import { sounds } from '../utils/sound';

import ManualBarcodeEntry from './ManualBarcodeEntry';
import ScannerCamera from './ScannerCamera';
import PinModal from './PinModal';
import SettingsPanel from './SettingsPanel';
import ExcelImportExport from './ExcelImportExport';
import FirebaseManager from './FirebaseManager';
import WorkerNameModal from './WorkerNameModal';
import Numpad from './Numpad';
import { UserContext } from '../App';
import { db, auth } from '../firebase';
import { doc, onSnapshot, setDoc, collection, addDoc, Timestamp } from 'firebase/firestore';
import NotificationBell from './NotificationBell';
import { signOut } from 'firebase/auth';

import { exportToExcel } from '../utils/excelHelper';

export default function Dashboard() {
  const user = useContext(UserContext);
  
  // --- STATE PERSISTENCE & INITIALIZATION ---
  const [items, setItems] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem('mobile_scanner_inventory_v1');
    return saved ? JSON.parse(saved) : [];
  });

  const [config, setConfig] = useState<InventoryConfig>(() => {
    const saved = localStorage.getItem('mobile_scanner_config_v1');
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });

  const [logs, setLogs] = useState<ScanLog[]>(() => {
    const saved = localStorage.getItem('mobile_scanner_logs_v1');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    if (user?.email && config.workerName === 'Admin' && user.role !== 'admin') {
      // Auto-fix if it was stuck on Admin from a previous session
      const name = user.email.split('@')[0];
      const defaultName = name.charAt(0).toUpperCase() + name.slice(1);
      setConfig(prev => ({ ...prev, workerName: defaultName }));
    }
  }, [user, config.workerName]);

  // Sync global settings from firebase
  useEffect(() => {
    // We already have a robust mechanism below, but we can also use this for specific things
  }, []);

  const [activeSheetName, setActiveSheetName] = useState<string>(() => {
    return localStorage.getItem('mobile_scanner_sheet_name_v1') || '';
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "settings", "globalConfig"), (docSnap) => {
      if (docSnap.exists()) {
        const remoteConf = docSnap.data() as Partial<InventoryConfig>;
        setConfig(prev => ({
          ...prev,
          skanZbiorczy: remoteConf.skanZbiorczy ?? prev.skanZbiorczy,
          weryfikacjaPartii: remoteConf.weryfikacjaPartii ?? prev.weryfikacjaPartii,
          limitIlosci: remoteConf.limitIlosci ?? prev.limitIlosci,
          ignorowanePartie: remoteConf.ignorowanePartie ?? prev.ignorowanePartie,
          pokazujInnaLok: remoteConf.pokazujInnaLok ?? prev.pokazujInnaLok,
          pozwalajDodawac: remoteConf.pozwalajDodawac ?? prev.pozwalajDodawac,
          pin: remoteConf.pin ?? prev.pin
        }));
      }
    });
    return () => unsubscribe();
  }, []);

  // Save to persistence whenever state modifies
  useEffect(() => {
    localStorage.setItem('mobile_scanner_inventory_v1', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem('mobile_scanner_config_v1', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('mobile_scanner_logs_v1', JSON.stringify(logs));
  }, [logs]);

  // --- THEME SYNC ENGINE ---
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('mobile_scanner_theme_v1');
    if (saved === 'light' || saved === 'dark') return saved;
    return config.motyw || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('mobile_scanner_theme_v1', theme);
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
      document.body.style.backgroundColor = '#f8fafc'; // slate-50
      document.body.style.color = '#0f172a'; // slate-900
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.style.backgroundColor = '#020617'; // slate-950
      document.body.style.color = '#f1f5f9'; // slate-100
    }
  }, [theme]);

  // Sync theme if config changes internally
  useEffect(() => {
    if (config.motyw && config.motyw !== theme) {
      setTheme(config.motyw);
    }
  }, [config.motyw]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    setConfig(prev => ({ ...prev, motyw: nextTheme }));
  };

  // --- COMPONENT ACTIVE STATES ---
  const [activeLocation, setActiveLocation] = useState<string>('');
  const [isLocationLocked, setIsLocationLocked] = useState<boolean>(false);
  const [countRound, setCountRound] = useState<CountRound>('1');

  const [scanColor, setScanColor] = useState<'white' | 'green' | 'yellow' | 'red'>('white');
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [isPinOpen, setIsPinOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState<boolean>(false);
  const [isDataManagerOpen, setIsDataManagerOpen] = useState<boolean>(false);
  const [adminMode, setAdminMode] = useState<'manage' | 'work'>('work');

  // Lists tracking current active scans similar to kodyDoZeskanowania and kodyZeskanowane dictionaries in VBA
  const [sessionExpectedCodes, setSessionExpectedCodes] = useState<string[]>([]); // Keys of expected items
  const [sessionScannedItems, setSessionScannedItems] = useState<Map<string, { qty: number; rowRef: number; batch?: string; expiry?: string; addedManually?: boolean }>>(() => new Map());

  // Visual Tabs
  const [activeTab, setActiveTab] = useState<'todo' | 'done' | 'logs' | 'excel'>('todo');

  // --- POPUP INTERACTIVE DIALOGS ---
  // A. Bulk scan query details
  const [bulkScanQuery, setBulkScanQuery] = useState<{
    barcode: string;
    description: string;
    rowNum: number;
    sysQty: number;
    expectedKey: string;
  } | null>(null);
  const [bulkInputQty, setBulkInputQty] = useState<string>('');

  // B. Batch & date validation trigger
  const [batchVerificationQuery, setBatchVerificationQuery] = useState<{
    barcode: string;
    description: string;
    rowNum: number;
    expectedBatch: string;
    expectedExpiry: string;
    expectedKey: string;
  } | null>(null);

  // C. Input observed manual deviation values
  const [deviationInput, setDeviationInput] = useState<{
    barcode: string;
    rowNum: number;
    expectedKey: string;
  } | null>(null);
  const [manualBatch, setManualBatch] = useState<string>('');
  const [manualExpiry, setManualExpiry] = useState<string>('');

  const [batchSelectionQuery, setBatchSelectionQuery] = useState<{
    barcode: string;
    matchedItems: InventoryItem[];
  } | null>(null);

  // D. Unrecognized scan option
  const [addUnknownQuery, setAddUnknownQuery] = useState<{
    barcode: string;
    suggestedLoc?: string; // B6: If found in another location
  } | null>(null);
  const [addUnknownQty, setAddUnknownQty] = useState<string>('1');

  // E. Generic Confirmation Dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // F. Generic Alert Dialog (non-blocking)
  const [alertDialog, setAlertDialog] = useState<{
    message: string;
    title?: string;
  } | null>(null);

  // --- INITIALIZE LISTS UPON SELECTING LOCATION ---
  const loadLocation = (loc: string) => {
    const targetLoc = loc.trim().toUpperCase();
    if (!targetLoc) return;

    // A. Check if location exists in database
    const locationExists = items.some(i => (i.lokalizacja || '').toUpperCase() === targetLoc);

    if (!locationExists) {
      sounds.playError();
      setAlertDialog({ message: `Nie odnaleziono lokalizacji: "${targetLoc}" w aktualnej bazie danych.` });
      return;
    }

    // B. Suggest Count Round automatically (VBA: Suggest round based on values)
    const itemsInLoc = items.filter(i => (i.lokalizacja || '').toUpperCase() === targetLoc);
    let sugRound: CountRound = '1';

    const hasRound1 = itemsInLoc.some(i => i.licz1 !== null);
    const hasRound2 = itemsInLoc.some(i => i.licz2 !== null);
    const hasRound3 = itemsInLoc.some(i => i.licz3 !== null);

    if (hasRound1) {
      if (hasRound2) {
        if (hasRound3) {
          sounds.playWarning();
          setAlertDialog({ message: `Lokalizacja "${targetLoc}" została już policzona 3 razy.` });
          return;
        } else {
          sugRound = '3';
        }
      } else {
        sugRound = '2';
      }
    } else {
      sugRound = '1';
    }

    setCountRound(sugRound);

    // C. Check Quality Status (SJ != "0" or blank alert)
    const sjCodesWithWarnings = itemsInLoc.filter(i => i.sj && i.sj !== "0" && i.sj.trim() !== "");
    if (sjCodesWithWarnings.length > 0) {
      sounds.playWarning();
      const warningDetails = sjCodesWithWarnings.map(i => `${i.nazwa.slice(0, 20)}.. (SJ: ${i.sj})`).join('\n');
      setAlertDialog({ message: `⚠️ UWAGA! Statusy jakości w strefie: ${targetLoc}\nWykryto status inny niż "0":\n${warningDetails}`, title: "Ostrzeżenie o jakości (SJ)!" });
    } else {
      sounds.playSuccess();
    }

    // D. Build code lookup keys representing expected collection
    // We map barcode and sku. Row reference is appended to support duplicate barcodes in different rows!
    const expectedKeys: string[] = [];
    itemsInLoc.forEach(item => {
      const codeKey = `${(item.kodGlowny || '').toUpperCase()}_row${item.rowNum}`;
      expectedKeys.push(codeKey);
    });

    setSessionExpectedCodes(expectedKeys);
    setSessionScannedItems(new Map()); // Reset active session counts

    setActiveLocation(targetLoc);
    setIsLocationLocked(true);
    setScanColor('white');
  };

  // Release lock on Location setup
  const releaseLocation = () => {
    if (sessionScannedItems.size > 0) {
      setConfirmDialog({
        message: "Posiadasz niezapisany bilans z bieżącej strefy. Czy na pewno chcesz opuścić i wyczyścić aktualne postępy?",
        onConfirm: () => {
          setActiveLocation('');
          setIsLocationLocked(false);
          setSessionExpectedCodes([]);
          setSessionScannedItems(new Map());
          setScanColor('white');
        }
      });
      return;
    }
    setActiveLocation('');
    setIsLocationLocked(false);
    setSessionExpectedCodes([]);
    setSessionScannedItems(new Map());
    setScanColor('white');
  };

  // --- COMPILE EXPORT PREPARATION (VBA: ZapiszWyniki) ---
  const handleConfirmAndSaveLocation = () => {
    // Determine counts vs expectations
    const locationItems = items.filter(i => (i.lokalizacja || '').toUpperCase() === activeLocation);
    let totalExpectedQty = 0;
    let totalCountedQty = 0;

    locationItems.forEach(item => {
      totalExpectedQty += item.iloscSystemowa;
    });

    sessionScannedItems.forEach((val) => {
      totalCountedQty += val.qty;
    });

    const difference = totalCountedQty - totalExpectedQty;
    let confirmMsg = `Rozbieżność rzędu: ${difference > 0 ? '+' : ''}${difference} szt. (Oczekiwano: ${totalExpectedQty}, Wpisano: ${totalCountedQty})\n\nCzy zatwierdzić i zaktualizować spis dla strefy "${activeLocation}" pod spisem tury ${countRound}?`;

    if (difference === 0) {
      confirmMsg = `Stan zgodny (Suma: ${totalCountedQty} szt.)\n\nZatwierdzić i zapisać do bazy danych?`;
    }

    setConfirmDialog({
      message: confirmMsg,
      onConfirm: () => {
        sounds.playSuccess();

        const updateAnnotations = (current: string, round: string, statusText: string): string => {
          if (!current) current = "";
          const parts = current.split(/\s*\|\s*/).map(p => p.trim()).filter(Boolean);
          const roundPrefix = round === '1' ? 'I Liczenie: ' : round === '2' ? 'II Liczenie: ' : 'III Liczenie: ';
          
          const updatedParts = parts.filter(part => {
            if (round === '1') {
              if (part === "Brak" || part.startsWith("Braki:") || part.startsWith("Nadwyżka:")) {
                return false;
              }
            }
            return !part.startsWith(roundPrefix);
          });
          
          if (statusText) {
            updatedParts.push(`${roundPrefix}${statusText}`);
          }
          return updatedParts.join(" | ");
        };

        // Overwrite database cells with active state (Yellow for surplus, Red for deficits)
        const updatedItems = items.map(item => {
          if ((item.lokalizacja || '').toUpperCase() === activeLocation) {
            // Find sum inside session map matching item main/EAN codes
            let recordedQty = 0;
            sessionScannedItems.forEach((val) => {
              if (val.rowRef === item.rowNum) {
                recordedQty += val.qty;
              }
            });

            // Match the appropriate count round
            let newStatusAdnotacje = "";
            if (recordedQty !== item.iloscSystemowa) {
              if (recordedQty === 0) {
                newStatusAdnotacje = "Brak";
              } else if (recordedQty < item.iloscSystemowa) {
                newStatusAdnotacje = `Braki: ${recordedQty - item.iloscSystemowa} szt.`;
              } else if (recordedQty > item.iloscSystemowa) {
                newStatusAdnotacje = `Nadwyżka: +${recordedQty - item.iloscSystemowa} szt.`;
              }
            }
            
            const finalAdnotacje = updateAnnotations(item.adnotacje || "", countRound, newStatusAdnotacje);

            return {
              ...item,
              licz1: countRound === '1' ? recordedQty : item.licz1,
              licz2: countRound === '2' ? recordedQty : item.licz2,
              licz3: countRound === '3' ? recordedQty : item.licz3,
              osoba1: countRound === '1' ? config.workerName : item.osoba1,
              osoba2: countRound === '2' ? config.workerName : item.osoba2,
              osoba3: countRound === '3' ? config.workerName : item.osoba3,
              adnotacje: finalAdnotacje
            };
          }
          return item;
        });

        setItems(updatedItems);
        
        // Append general audit trail log
        const newLog: ScanLog = {
          timestamp: new Date().toLocaleTimeString(),
          barcode: `CONFIRM-R${countRound}`,
          itemCode: activeLocation,
          itemDescription: `Zatwierdzono liczenie strefy. Suma: ${totalCountedQty} szt.`,
          location: activeLocation,
          status: 'sukces',
          details: `Tura ${countRound}. Sygnatura sumy oczekiwanej: ${totalExpectedQty} szt.`
        };
        setLogs(prev => [newLog, ...prev]);

        // Emit real-time notification to the team (Enterprise WMS feature)
        if (!config.powiadomieniaTylkoArkusz) {
          try {
            const sheetInfo = activeSheetName ? ` (${activeSheetName})` : '';
            addDoc(collection(db, 'notifications'), {
              workerName: config.workerName || user?.email || 'Nieznany Pracownik',
              message: `Zatwierdzono strefę: ${activeLocation}${sheetInfo}. Tura ${countRound}. Policzono: ${totalCountedQty} szt.`,
              location: activeLocation,
              isRead: false,
              timestamp: Timestamp.now()
            }).catch(e => console.error("Web Push Error", e));
          } catch(e) {}
        }

        // Soft Reset
        setActiveLocation('');
        setIsLocationLocked(false);
        setSessionExpectedCodes([]);
        setSessionScannedItems(new Map());
        setScanColor('white');
      }
    });
  };

  // --- CORE INTERVENTORY SCANNERS TRIGGER (VBA: PrzetworzSkan) ---
  const handleBarcodeScanned = (scannedCodeRaw: string) => {
    const rawBarcode = scannedCodeRaw.trim();
    if (!rawBarcode) return;

    const barcode = rawBarcode.toUpperCase();
    const locationItems = items.filter(i => (i.lokalizacja || '').toUpperCase() === activeLocation);

    // 1. Search for matching code in our expectation directory inside the current active location
    const scanMode = config.trybSkanowania || 'oba';
    const matchedItems = locationItems.filter(item => {
      const matchPrimary = (item.kodGlowny || '').toUpperCase() === barcode;
      const matchAux = (item.kodPomocniczy || '').toUpperCase() === barcode;
      if (scanMode === 'ean') return matchAux;
      if (scanMode === 'kodGlowny') return matchPrimary;
      return matchPrimary || matchAux; // 'oba' — domyślnie
    });

    if (matchedItems.length === 1) {
      // Exactly 1 match
      processKnownItemScan(barcode, matchedItems[0]);
    } else if (matchedItems.length > 1) {
      // Multiple batches exist for this product code
      setBatchSelectionQuery({ barcode, matchedItems });
    } else {
      // PRODUCT NOT LOCATED IN THIS LOCATION OR COMPLETELY UNKNOWN (VBA: ObslugaBleduLubNadwyzki)
      processUnknownItemScan(barcode);
    }
  };

  // Helper A: Process items in the active location
  const processKnownItemScan = (barcode: string, item: InventoryItem) => {
    const expectedKey = `${(item.kodGlowny || '').toUpperCase()}_row${item.rowNum}`;

    // 1. Resolve parameters
    const expectedBatch = item.partia || "";
    const expectedExpiry = item.dataWaznosci || "";

    // 2. Check Expiration and Batch verification state (B3 validation)
    const isVerificationEnabled = config.weryfikacjaPartii;
    const hasValidBatchToVerify = expectedBatch !== "" && !isBatchIgnored(expectedBatch);
    const hasValidExpiryToVerify = expectedExpiry !== "";

    const requiresVerification = isVerificationEnabled && (hasValidBatchToVerify || hasValidExpiryToVerify);

    if (requiresVerification) {
      // Trigger batch match confirmation popup
      setBatchVerificationQuery({
        barcode,
        description: item.nazwa,
        rowNum: item.rowNum,
        expectedBatch,
        expectedExpiry,
        expectedKey
      });
      return;
    }

    // 3. Check Bulk Scan State (B2 toggle and B4 Limit threshold)
    const isBulkEnabled = config.skanZbiorczy;
    const isAboveLimit = item.iloscSystemowa > config.limitIlosci;

    if (isBulkEnabled && isAboveLimit) {
      setBulkScanQuery({
        barcode,
        description: item.nazwa,
        rowNum: item.rowNum,
        sysQty: item.iloscSystemowa,
        expectedKey
      });
      setBulkInputQty(String(item.iloscSystemowa));
      return;
    }

    // 4. Default: Standard incremental increase (+1)
    applyIncrementalCount(expectedKey, item.rowNum, 1);
  };

  // Helper B: Process misplaced or unrecognized items (VBA: ObslugaBleduLubNadwyzki)
  const processUnknownItemScan = (barcode: string) => {
    sounds.playError();
    setScanColor('red');

    // Check if item belongs to any other warehouse location (VBA: ZnajdzPoprawnaLokalizacje)
    const foundElsewhere = items.find(i => (i.kodGlowny || '').toUpperCase() === barcode || (i.kodPomocniczy || '').toUpperCase() === barcode);
    const correctLoc = foundElsewhere ? foundElsewhere.lokalizacja : undefined;

    setAddUnknownQuery({
      barcode,
      suggestedLoc: correctLoc
    });
  };

  // Check if batch lot matches ignored arrays from settings
  const isBatchIgnored = (batch: string): boolean => {
    const lotFilters = config.ignorowanePartie.split(';').map(f => f.trim().toUpperCase());
    return lotFilters.includes((batch || '').toUpperCase());
  };

  // Increments item records inside the visual counting map
  const applyIncrementalCount = (
    expectedKey: string,
    rowRef: number,
    amount: number,
    customBatch?: string,
    customExpiry?: string,
    manualAdd?: boolean
  ) => {
    setSessionScannedItems(prev => {
      const next = new Map<string, { qty: number; rowRef: number; batch?: string; expiry?: string; addedManually?: boolean }>(prev);
      const current = next.get(expectedKey) || { qty: 0, rowRef, batch: customBatch, expiry: customExpiry, addedManually: manualAdd };
      
      const newQty = current.qty + amount;
      next.set(expectedKey, {
        qty: newQty,
        rowRef: current.rowRef,
        batch: customBatch || current.batch,
        expiry: customExpiry || current.expiry,
        addedManually: current.addedManually
      });

      return next;
    });

    setScanColor('green');
    sounds.playSuccess();

    // Log the scan
    const itemRef = items.find(i => i.rowNum === rowRef);
    const description = itemRef ? itemRef.nazwa : "Manualny Towar magazynowy";
    const logObj: ScanLog = {
      timestamp: new Date().toLocaleTimeString(),
      barcode: expectedKey.split('_')[0],
      itemCode: itemRef ? itemRef.kodGlowny : expectedKey,
      itemDescription: description,
      location: activeLocation,
      status: manualAdd ? 'nowy' : 'sukces',
      details:`Dodano +${amount} szt. (Partia: ${customBatch || itemRef?.partia || 'brak'})`
    };
    setLogs(prev => [logObj, ...prev]);

    // Reset indicator back to normal white border after 1 second
    setTimeout(() => setScanColor('white'), 1000);
  };

  // --- POPUP SUBMISSIONS HANDLERS ---
  
  // Submit Bulk scan quantity input
  const submitBulkScan = () => {
    if (!bulkScanQuery) return;
    const qty = parseInt(bulkInputQty);
    if (isNaN(qty) || qty < 0) {
      setAlertDialog({ message: "Proszę wprowadzić poprawną ilość dodatnią!" });
      return;
    }

    applyIncrementalCount(bulkScanQuery.expectedKey, bulkScanQuery.rowNum, qty);
    setBulkScanQuery(null);
  };

  // Submit Batch verification is matching
  const submitBatchMatching = (isMatching: boolean) => {
    if (!batchVerificationQuery) return;

    if (isMatching) {
      // Confirmed matching, check bulk scanner status trigger
      const item = items.find(i => i.rowNum === batchVerificationQuery.rowNum);
      if (item && config.skanZbiorczy && item.iloscSystemowa > config.limitIlosci) {
        setBulkScanQuery({
          barcode: batchVerificationQuery.barcode,
          description: batchVerificationQuery.description,
          rowNum: batchVerificationQuery.rowNum,
          sysQty: item.iloscSystemowa,
          expectedKey: batchVerificationQuery.expectedKey
        });
        setBulkInputQty(String(item.iloscSystemowa));
      } else {
        applyIncrementalCount(batchVerificationQuery.expectedKey, batchVerificationQuery.rowNum, 1);
      }
      setBatchVerificationQuery(null);
    } else {
      // Display form input to observed batch deviations
      setDeviationInput({
        barcode: batchVerificationQuery.barcode,
        rowNum: batchVerificationQuery.rowNum,
        expectedKey: batchVerificationQuery.expectedKey
      });
      setManualBatch(batchVerificationQuery.expectedBatch);
      setManualExpiry(batchVerificationQuery.expectedExpiry);
      setBatchVerificationQuery(null);
    }
  };

  // Save manual batch deviation and enter it into our temporary directory as a new line reference!
  const submitDeviationLot = () => {
    if (!deviationInput) return;
    
    const srcRow = items.find(i => i.rowNum === deviationInput.rowNum);
    if (!srcRow) return;

    // VBA: DodajNowyWierszDoArkusza. We create a copy of the row, but override the lot references and system totals to 0
    const newRowIndex = items.length > 0 ? Math.max(...items.map(i => i.rowNum)) + 1 : 1;
    const newRecord: InventoryItem = {
      id: `dev-${Date.now()}`,
      rowNum: newRowIndex,
      lokalizacja: activeLocation,
      kodGlowny: srcRow.kodGlowny,
      kodPomocniczy: srcRow.kodPomocniczy,
      nazwa: srcRow.nazwa,
      sj: srcRow.sj,
      iloscSystemowa: 0, // 0 for deviation inserts
      licz1: null,
      licz2: null,
      licz3: null,
      lp: String(items.length + 1),
      partia: manualBatch.trim() || "-",
      dataWaznosci: manualExpiry.trim() || "-",
      adnotacje: "Rozbicie na nową partię (Partia: " + manualBatch.trim() + ", Data ważn: " + manualExpiry.trim() + ")",
      isNew: true,
    };

    setItems(prev => {
      const newItems = [...prev];
      const srcIndex = newItems.findIndex(i => i.rowNum === deviationInput.rowNum);
      if (srcIndex >= 0) {
        const src = newItems[srcIndex];
        const existingAdn = src.adnotacje ? src.adnotacje + " | " : "";
        newItems[srcIndex] = {
          ...src,
          adnotacje: existingAdn + `Zgłoszono nową partię: ${manualBatch.trim() || '-'}, data: ${manualExpiry.trim() || '-'}`
        };
      }
      return [...newItems, newRecord];
    });

    // Add key to expectation set
    const newExpectedKey = `${(srcRow.kodGlowny || '').toUpperCase()}_row${newRowIndex}`;
    setSessionExpectedCodes(prev => [...prev, newExpectedKey]);
    
    // Zamiast od razu dodawać 1 sztukę (applyIncrementalCount), otwieramy okno Numpada
    setBulkScanQuery({
      barcode: deviationInput.barcode,
      description: srcRow.nazwa,
      rowNum: newRowIndex,
      sysQty: 0,
      expectedKey: newExpectedKey
    });
    setBulkInputQty("");

    setDeviationInput(null);
  };

  // Save unknown item setup or block
  const handleAddUnknown = () => {
    if (!addUnknownQuery) return;
    const qty = parseInt(addUnknownQty);

    if (isNaN(qty) || qty < 1) {
      setAlertDialog({ message: "Proszę wpisać poprawną ilość!" });
      return;
    }

    // 1. Search for item model in generic inventory database
    const modelItem = items.find(i => (i.kodGlowny || '').toUpperCase() === addUnknownQuery.barcode || (i.kodPomocniczy || '').toUpperCase() === addUnknownQuery.barcode);
    
    const newRowIndex = items.length > 0 ? Math.max(...items.map(i => i.rowNum)) + 1 : 1;
    const finalRecord: InventoryItem = {
      id: `man-${Date.now()}`,
      rowNum: newRowIndex,
      lokalizacja: activeLocation,
      kodGlowny: modelItem ? modelItem.kodGlowny : addUnknownQuery.barcode,
      kodPomocniczy: modelItem ? modelItem.kodPomocniczy : addUnknownQuery.barcode,
      nazwa: modelItem ? modelItem.nazwa : `Towar Nieznany (${addUnknownQuery.barcode})`,
      sj: modelItem ? modelItem.sj : "0",
      iloscSystemowa: 0,
      licz1: null,
      licz2: null,
      licz3: null,
      lp: String(items.length + 1),
      partia: modelItem ? modelItem.partia : "",
      dataWaznosci: modelItem ? modelItem.dataWaznosci : "",
      adnotacje: "Dodano na skanerze (lokalizacja)",
      isNew: true
    };

    setItems(prev => [...prev, finalRecord]);

    const newKey = `${(finalRecord.kodGlowny || '').toUpperCase()}_row${newRowIndex}`;
    setSessionExpectedCodes(prev => [...prev, newKey]);
    applyIncrementalCount(newKey, newRowIndex, qty, finalRecord.partia, finalRecord.dataWaznosci, true);

    setAddUnknownQuery(null);
    setAddUnknownQty('1');
  };

  // Clear log history
  const clearLogs = () => {
    setConfirmDialog({
      message: "Czy na pewno chcesz usunąć całą historię skanowania?",
      onConfirm: () => {
        setLogs([]);
      }
    });
  };

  // Reset entire database to default preset
  const resetToDefaults = () => {
    setConfirmDialog({
      message: "Czy na pewno chcesz wyczyścić całkowicie stan pracy i usunąć aktualną bazę?",
      onConfirm: () => {
        setItems([]);
        setConfig(DEFAULT_CONFIG);
        setLogs([]);
        setActiveLocation('');
        setIsLocationLocked(false);
        setScanColor('white');
        setSessionExpectedCodes([]);
        localStorage.removeItem('mobile_scanner_fb_sheet_id');
        setSessionScannedItems(new Map());
      }
    });
  };

  // Unique list of remaining locations based on the selected count round and discrepancies
  const getRemainingLocations = () => {
    const locMap = new Map<string, boolean>();
    
    items.forEach(item => {
      const loc = (item.lokalizacja || '').toUpperCase();
      
      if (countRound === '1') {
        if (item.licz1 === null) locMap.set(loc, true);
      } else if (countRound === '2') {
        // For round 2, show locations that are already counted in round 1 but have discrepancies, and haven't been counted in round 2 yet.
        const hasDiscrepancy = item.licz1 !== null && item.licz1 !== item.iloscSystemowa;
        if (hasDiscrepancy && item.licz2 === null) locMap.set(loc, true);
      } else if (countRound === '3') {
        // For round 3, show locations that are counted in round 2 but still have a discrepancy (or where licz1 != licz2), and haven't been counted in round 3 yet.
        const hasDiscrepancy = item.licz2 !== null && item.licz2 !== item.iloscSystemowa;
        if (hasDiscrepancy && item.licz3 === null) locMap.set(loc, true);
      }
    });

    return Array.from(locMap.keys()).sort();
  };

  // --- COMPUTE THEME CLASSES ---
  const isLight = theme === 'light';

  // Computed visual classes based on theme
  const cBgMain = isLight ? "bg-slate-50 text-slate-900" : "bg-slate-950 text-slate-100";
  const cTextTitle = isLight ? "text-slate-900" : "text-white";
  const cTextMuted = isLight ? "text-slate-500 font-medium" : "text-slate-400";
  const cTextLabel = isLight ? "text-slate-600 font-bold" : "text-slate-400 font-medium";
  const cCard = isLight ? "bg-white border border-slate-200 shadow-sm" : "bg-slate-900 border border-slate-800/80";
  const cInput = isLight ? "bg-slate-50 border border-slate-200 text-slate-950 focus:border-teal-600 font-bold" : "bg-slate-950 border border-slate-800 text-slate-100 font-bold";
  const cSelect = isLight ? "bg-slate-50 border border-slate-200 text-slate-950 focus:border-teal-600 font-bold" : "bg-slate-950 border border-slate-800 text-slate-200";
  const cInnerCard = isLight ? "bg-slate-100/60 border border-slate-200/85" : "bg-slate-950/40 border border-slate-800/80";
  const cProgressBg = isLight ? "bg-slate-200" : "bg-slate-800";
  const cListItemBorder = isLight ? "border-slate-200 bg-white" : "border-slate-800/80 bg-slate-900/40";
  const cTabActive = isLight ? "bg-teal-50 text-teal-700 border-teal-200 shadow-sm font-bold" : "bg-slate-800 text-teal-400 border-slate-700";
  const cTabInactive = isLight ? "border-slate-200 text-slate-500 hover:text-slate-900 bg-transparent hover:bg-slate-100" : "border-slate-800/40 text-slate-400 hover:text-slate-200 bg-transparent hover:bg-slate-800/20";

  return (
    <div className={`min-h-screen ${cBgMain} flex flex-col font-sans select-none pb-6 transition-colors duration-200`}>
      <WorkerNameModal 
        isOpen={!config.workerName} 
        onSave={(name) => setConfig(prev => ({ ...prev, workerName: name }))}
        isLight={isLight}
        defaultName={user?.email ? (user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1)) : ''}
      />
      
      {/* HEADER BAR */}
      <header id="header_navigation_main" className={`sticky top-0 z-30 flex flex-col justify-center border-b ${isLight ? 'border-teal-100/80 bg-white/95 text-slate-950 shadow-xs' : 'border-slate-800 bg-slate-900/90'} backdrop-blur px-5 py-3 shrink-0 transition-all duration-200`}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <Warehouse className={`h-6 w-6 ${isLight ? 'text-teal-600' : 'text-teal-400'}`} />
            <div>
              <h1 className={`text-base font-extrabold tracking-tight ${cTextTitle} leading-none`}>Skaner Magazynowy</h1>
              <p className={`text-[10px] ${isLight ? 'text-slate-500 font-semibold' : 'text-slate-400'} mt-1 font-mono uppercase tracking-widest`}>
                {config.workerName ? `Osoba: ${config.workerName}` : "Zaloguj się / Podaj Imię"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 relative">
            {/* Real-time Notification Bell */}
            <NotificationBell isLight={isLight} />

            {/* Quick theme switcher button */}
            <button
              id="fast_theme_toggle_btn"
              onClick={toggleTheme}
              className={`flex items-center justify-center p-2 rounded-xl transition-colors cursor-pointer ${
                isLight 
                  ? 'text-teal-600 hover:bg-slate-100' 
                  : 'text-teal-400 hover:bg-slate-800'
              }`}
              title={isLight ? "Włącz tryb ciemny" : "Włącz tryb jasny"}
            >
              {isLight ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>
            
            {/* User Avatar & Menu */}
            <div>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className={`flex h-9 w-9 items-center justify-center rounded-full font-bold text-sm select-none cursor-pointer border-2 transition-all ${
                  isLight 
                    ? 'bg-teal-100/50 text-teal-700 border-teal-200 hover:bg-teal-200/50' 
                    : 'bg-teal-900/30 text-teal-400 border-teal-800/50 hover:bg-teal-800/50'
                }`}
              >
                {config.workerName ? config.workerName.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : '?')}
              </button>
              
              {isUserMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
                  <div className={`absolute top-full right-0 mt-2 w-48 rounded-2xl shadow-xl border overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200 ${
                    isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                  }`}>
                    <div className={`px-4 py-3 border-b ${isLight ? 'border-slate-100 bg-slate-50' : 'border-slate-800 bg-slate-950/50'}`}>
                      <p className={`text-xs font-bold truncate ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {config.workerName || 'Pracownik'}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">
                        {user?.email || 'Niezalogowany'}
                      </p>
                    </div>
                    <div className="p-1">
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setIsPinOpen(true);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-xl transition-colors cursor-pointer ${
                          isLight ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <Shield className="h-4 w-4" />
                        Ustawienia
                      </button>
                      <button
                        onClick={async () => {
                          setIsUserMenuOpen(false);
                          setIsLogoutConfirmOpen(true);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-xl transition-colors cursor-pointer ${
                          isLight ? 'text-rose-600 hover:bg-rose-50' : 'text-rose-400 hover:bg-rose-500/10'
                        }`}
                      >
                        <LogOut className="h-4 w-4" />
                        Wyloguj
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* WORKSPACE VIEWPORT */}
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-5 flex flex-col gap-5 overflow-x-hidden">
        
        {/* PROGRESS INDICATOR */}
        {items.length > 0 && (() => {
          // Obliczamy ile towarów zostało już policzonych (zarówno z bazy, jak i w aktualnie otwartej sesji)
          let counted = 0;
          items.forEach(i => {
            const hasGlobalCount = countRound === '1' ? i.licz1 !== null : countRound === '2' ? i.licz2 !== null : i.licz3 !== null;
            const expectedKey = `${(i.kodGlowny || '').toUpperCase()}_row${i.rowNum}`;
            const hasSessionCount = sessionScannedItems.has(expectedKey);
            
            if (hasGlobalCount || hasSessionCount) {
              counted++;
            }
          });
          const percent = items.length > 0 ? (counted / items.length) * 100 : 0;

          return (
            <div className={`p-4 rounded-3xl border transition-colors duration-200 ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-gradient-to-tr from-slate-900 to-slate-950 border-teal-500/15'} shadow-sm space-y-3`}>
              <div className="flex justify-between items-center text-xs">
                <span className={`${cTextMuted}`}>Bieżący postęp inwentaryzacji:</span>
                <span className="text-teal-600 dark:text-teal-400 font-bold font-mono">
                  {counted} / {items.length} pozycji
                </span>
              </div>
              <div className={`h-2 w-full ${cProgressBg} rounded-full overflow-hidden`}>
                <div 
                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500" 
                  style={{ width: `${percent}%` }}
                ></div>
              </div>
            </div>
          );
        })()}

        {/* START SCREEN WHEN NO SHEET LOADED */}
        {items.length === 0 && (
          <div className="flex flex-col gap-5 py-6">
            <div className="text-center mb-4">
              <h2 className={`text-xl font-bold ${cTextTitle}`}>
                Witaj, {config.workerName || user?.email?.split('@')[0]}
              </h2>
              <p className={`text-sm mt-2 ${cTextMuted}`}>
                {user?.role === 'admin' 
                  ? 'Wybierz panel aby rozpocząć' 
                  : 'Kliknij poniżej aby wybrać arkusz do inwentaryzacji'}
              </p>
            </div>

            {user?.role === 'admin' ? (
              <button
                onClick={() => {
                  setAdminMode('manage');
                  setIsDataManagerOpen(true);
                }}
                className={`w-full p-6 rounded-3xl border flex items-center gap-5 transition-all text-left ${
                  isLight 
                    ? 'bg-white border-indigo-200 hover:border-indigo-400 shadow-sm' 
                    : 'bg-slate-800 border-indigo-500/30 hover:border-indigo-500'
                }`}
              >
                <div className={`p-4 rounded-2xl ${isLight ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/20 text-indigo-400'}`}>
                  <Database className="w-8 h-8" />
                </div>
                <div>
                  <h3 className={`font-bold text-lg ${cTextTitle}`}>Zarządzanie Arkuszami</h3>
                  <p className={`text-xs mt-1 leading-relaxed ${cTextMuted}`}>
                    Dodawaj nowe arkusze skanowania i przeglądaj zwroty
                  </p>
                </div>
              </button>
            ) : (
              <div className={`p-5 rounded-3xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                <FirebaseManager 
                  items={items}
                  onImport={(newItems, importedRound) => {
                    setItems(newItems);
                    if (importedRound) setCountRound(importedRound as CountRound);
                  }}
                  isLight={isLight}
                />
              </div>
            )}

            {user?.role === 'admin' && (
              <button
                 onClick={() => {
                    setAdminMode('work');
                    setIsDataManagerOpen(true);
                 }}
                 className={`w-full p-6 rounded-3xl border flex items-center gap-5 transition-all text-left ${
                    isLight 
                      ? 'bg-white border-teal-200 hover:border-teal-400 shadow-sm' 
                      : 'bg-slate-800 border-teal-500/30 hover:border-teal-500'
                  }`}
              >
                 <div className={`p-4 rounded-2xl ${isLight ? 'bg-teal-50 text-teal-600' : 'bg-teal-500/20 text-teal-400'}`}>
                   <ClipboardList className="w-8 h-8" />
                 </div>
                 <div>
                    <h3 className={`font-bold text-lg ${cTextTitle}`}>Panel Liczenia</h3>
                    <p className={`text-xs mt-1 leading-relaxed ${cTextMuted}`}>
                      Pobierz aktywny arkusz z chmury i rozpocznij skanowanie lokalizacji
                    </p>
                 </div>
              </button>
            )}
          </div>
        )}

        {/* STEP 1: ZONE & COUNT ROUND SELECTION PANEL */}
        {items.length > 0 && !isLocationLocked ? (
          <div className={`${cCard} rounded-3xl p-5 shadow-sm space-y-4 transition-colors duration-200`}>
            <div className="flex items-center gap-2">
              <Warehouse className={`h-5 w-5 ${isLight ? 'text-teal-600' : 'text-teal-400'}`} />
              <h3 className={`font-bold ${cTextTitle} text-sm`}>Wybór Lokalizacji Spisu</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              
              {/* Dropdown for counting round */}
              <div className="flex flex-col gap-1.5">
                <label className={`text-xs ${cTextLabel} font-bold`}>Tura Liczenia</label>
                <select
                   id="cbo_number_liczenia"
                   value={countRound}
                   onChange={(e) => setCountRound(e.target.value as CountRound)}
                   className={`w-full rounded-2xl ${cSelect} p-3.5 text-xs focus:outline-none transition-colors duration-200`}
                >
                  <option value="1">Pierwsze (Licz. 1)</option>
                  <option value="2">Powtórne (Licz. 2)</option>
                  <option value="3">Rozstrzygające (Licz. 3)</option>
                </select>
              </div>

              {/* Text Input for Zone */}
              <div className="flex flex-col gap-1.5">
                <label className={`text-xs ${cTextLabel} font-bold`}>Strefa Spisu / Lokalizacja</label>
                <div className="relative">
                  <input
                    id="txt_lokalizacja_input"
                    type="text"
                    placeholder="np. A-01-01"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        loadLocation((e.target as HTMLInputElement).value);
                      }
                    }}
                    className={`w-full rounded-2xl ${cInput} p-3 text-xs tracking-wider placeholder:font-normal uppercase focus:outline-none focus:border-teal-450 transition-colors duration-200`}
                  />
                  <div className={`absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 shrink-0`}>
                    <Search className="h-4 w-4" />
                  </div>
                </div>
              </div>

            </div>

            {/* List of remaining locations */}
            <div className={`pt-3 border-t ${isLight ? 'border-slate-100' : 'border-slate-800/40'}`}>
              <p className={`text-[10px] ${isLight ? 'text-slate-500 font-bold' : 'text-slate-500'} uppercase tracking-widest font-bold mb-2.5`}>
                Sugerowane strefy (pozostałe do policzenia):
              </p>
              <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto">
                {getRemainingLocations().length > 0 ? (
                  getRemainingLocations().map(loc => (
                    <button
                      key={loc}
                      onClick={() => loadLocation(loc)}
                      className={`px-3 py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        isLight 
                          ? 'bg-white text-slate-700 border-slate-200/90 hover:border-teal-500 hover:text-teal-600 shadow-xs' 
                          : 'bg-slate-950 border-slate-800 hover:border-teal-400/50 hover:bg-slate-900 text-slate-300 hover:text-teal-400'
                      }`}
                    >
                      <span>{loc}</span>
                      <ArrowRight className="h-3 w-3 opacity-40 shrink-0" />
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold py-1">Gratulacje! Wszystkie strefy spisu zostały policzone.</p>
                )}
              </div>
            </div>

          </div>
        ) : items.length > 0 && isLocationLocked ? (
          /* LOCKED ZONE HUD */
          <div className={`border rounded-3xl p-5 shadow-sm space-y-4 transition-colors duration-200 ${
            isLight 
              ? 'bg-white border-teal-200/80' 
              : 'bg-slate-900 border-teal-500/30'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`h-2.5 w-2.5 rounded-full ${isLight ? 'bg-teal-500' : 'bg-teal-400'} animate-ping shrink-0`} />
                <div>
                  <h3 className={`font-bold ${cTextTitle} text-sm leading-none`}>Strefa: {activeLocation}</h3>
                  <p className={`text-[10px] ${cTextMuted} mt-1 font-mono`}>Tura spisu: {countRound} Liczenie</p>
                </div>
              </div>
              <button
                id="unlock_location_btn"
                onClick={releaseLocation}
                className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold ${
                  isLight 
                    ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-150' 
                    : 'border-slate-700 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20'
                } transition-all cursor-pointer`}
              >
                Opuść Strefę
              </button>
            </div>

            {/* Confirm spisu Button */}
            <div className="flex gap-2">
              <button
                id="sum_confirm_btn"
                onClick={handleConfirmAndSaveLocation}
                className="flex-1 flex items-center justify-center gap-2 p-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-2xl text-xs transition-all cursor-pointer"
              >
                <Check className="h-4.5 w-4.5" />
                Zatwierdź i Zapisz Wyniki Strefy
              </button>
            </div>
          </div>
        ) : null}

        {/* STEP 2: ACTIVE SCANNING BOARD */}
        {isLocationLocked && (
          <>
            <ManualBarcodeEntry 
              onScan={handleBarcodeScanned}
              currentColor={scanColor}
              isLocationSelected={isLocationLocked}
              onLaunchCamera={() => setIsCameraOpen(true)}
              activeLocationItems={items.filter(i => {
                if ((i.lokalizacja || '').toUpperCase() !== activeLocation) return false;
                if (countRound === '2' && (i.licz1 === null || i.licz1 === i.iloscSystemowa)) return false;
                if (countRound === '3' && (i.licz2 === null || i.licz2 === i.iloscSystemowa)) return false;
                const codeKey = `${(i.kodGlowny || '').toUpperCase()}_row${i.rowNum}`;
                const currentSessionQty = sessionScannedItems.get(codeKey)?.qty || 0;
                const remaining = i.iloscSystemowa - currentSessionQty;
                return remaining > 0;
              })}
              scannedLocationItems={items.filter(i => {
                if ((i.lokalizacja || '').toUpperCase() !== activeLocation) return false;
                if (countRound === '2' && (i.licz1 === null || i.licz1 === i.iloscSystemowa)) return false;
                if (countRound === '3' && (i.licz2 === null || i.licz2 === i.iloscSystemowa)) return false;
                const codeKey = `${(i.kodGlowny || '').toUpperCase()}_row${i.rowNum}`;
                const currentSessionQty = sessionScannedItems.get(codeKey)?.qty || 0;
                const remaining = i.iloscSystemowa - currentSessionQty;
                return remaining <= 0;
              })}
              isLight={isLight}
              showHints={config.podpowiedziWpisywania}
            />

            {/* CENTRAL TABS CONTROLLERS */}
            <div className={`flex gap-1.5 p-1 rounded-2xl border transition-colors duration-200 ${
              isLight ? 'bg-slate-100 border-slate-200 shadow-xs' : 'bg-slate-950 border-slate-800/80'
            }`}>
              <button
                onClick={() => setActiveTab('todo')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  activeTab === 'todo' ? cTabActive : cTabInactive
                }`}
              >
                Do zeskanowania
              </button>
              <button
                onClick={() => setActiveTab('done')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  activeTab === 'done' ? cTabActive : cTabInactive
                }`}
              >
                Zliczone
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  activeTab === 'logs' ? cTabActive : cTabInactive
                }`}
              >
                Logi Spisu
              </button>
            </div>

            {/* TAB CONTENT: TODO LIST (VBA: txtDoZeskanowania) */}
            {activeTab === 'todo' && (
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs text-slate-500 px-1">
                  <span>Nazwa artykułu / Kod systemowy</span>
                  <span>System</span>
                </div>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {(() => {
                    const todoItems = items.filter(i => {
                      if ((i.lokalizacja || '').toUpperCase() !== activeLocation) return false;
                      if (countRound === '2' && (i.licz1 === null || i.licz1 === i.iloscSystemowa)) return false;
                      if (countRound === '3' && (i.licz2 === null || i.licz2 === i.iloscSystemowa)) return false;
                      const codeKey = `${(i.kodGlowny || '').toUpperCase()}_row${i.rowNum}`;
                      const currentSessionQty = sessionScannedItems.get(codeKey)?.qty || 0;
                      return Math.max(0, i.iloscSystemowa - currentSessionQty) > 0;
                    });

                    if (todoItems.length === 0) {
                      return (
                        <div className={`text-center py-10 rounded-2xl border ${
                          isLight ? 'bg-emerald-50/40 border-emerald-100/90 text-emerald-800' : 'bg-emerald-950/10 border-emerald-900/30 text-emerald-400'
                        }`}>
                          <p className="text-xs font-bold">🎉 Wszystkie oczekiwane artykuły w tej strefie zostały zliczone!</p>
                          <p className="text-[10px] text-slate-500 mt-1">Sprawdź zakładkę "Zliczone" lub zatwierdź i zapisz wyniki strefy.</p>
                        </div>
                      );
                    }

                    return todoItems.map((item, idx) => {
                      const codeKey = `${(item.kodGlowny || '').toUpperCase()}_row${item.rowNum}`;
                      const currentSessionQty = sessionScannedItems.get(codeKey)?.qty || 0;
                      const remaining = Math.max(0, item.iloscSystemowa - currentSessionQty);

                      return (
                        <div 
                          key={`${item.id}-${idx}`}
                          className={`${cCard} rounded-2xl p-4 flex justify-between items-center transition-colors duration-200`}
                        >
                          <div className="flex-1 pr-4">
                            <h5 className={`font-bold text-xs ${isLight ? 'text-slate-900' : 'text-slate-100'} flex items-center gap-1.5 h-auto`}>
                              {item.sj !== "0" && item.sj !== "" && (
                                <span className="text-[10px] bg-rose-500/10 border border-rose-500/30 text-rose-650 dark:text-rose-450 px-1.5 py-0.5 rounded font-black shrink-0">
                                  SJ: {item.sj}
                                </span>
                              )}
                              {item.nazwa}
                            </h5>
                            <p className="text-[10px] text-slate-500 font-mono mt-1">
                              Nr art.: {item.kodGlowny} | EAN: {item.kodPomocniczy || "brak"}
                            </p>
                            {item.partia && (
                              <p className={`text-[9px] ${isLight ? 'text-teal-700' : 'text-teal-400'} font-mono mt-0.5`}>
                                Partia: {item.partia} (Ważn: {item.dataWaznosci || 'nieokreślona'})
                              </p>
                            )}
                            {item.customFields && Object.keys(item.customFields).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {Object.entries(item.customFields).map(([key, val]) => (
                                  <div key={key} className={`px-1.5 py-0.5 rounded text-[9px] border flex items-center ${isLight ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'}`}>
                                    <span className="opacity-70 mr-1 truncate max-w-[60px]">{key}:</span>
                                    <span className="font-bold truncate max-w-[100px]">{val}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-sm font-extrabold ${isLight ? 'text-teal-650' : 'text-teal-400'} font-mono`}>
                              {remaining} szt.
                            </div>
                            <span className="text-[9px] text-slate-500 font-mono">oczekuje</span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* TAB CONTENT: ALREADY COUNT CORES (VBA: txtZeskanowane) */}
            {activeTab === 'done' && (
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs text-slate-500 px-1">
                  <span>Wpisane / Zeskanowane pozycje</span>
                  <span>Stan</span>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {sessionScannedItems.size === 0 ? (
                    <div className={`text-center py-8 text-slate-500 border border-dashed rounded-3xl ${
                      isLight ? 'bg-slate-100/50 border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}>
                      <p className="text-xs">Brak aktywnych ujęć spisu</p>
                      <p className="text-[10px] text-slate-600 mt-1">Użyj laserowych symulacji lub aparatu.</p>
                    </div>
                  ) : (
                    Array.from(sessionScannedItems.entries()).map(([key, val], idx) => {
                      const originItem = items.find(i => i.rowNum === val.rowRef);
                      const sysQty = originItem ? originItem.iloscSystemowa : 0;

                      return (
                        <div 
                          key={`${key}-${idx}`}
                          className={`${cCard} rounded-2xl p-4 shadow-xs transition-colors duration-200`}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1 pr-2 min-w-0">
                              <h5 className={`font-bold text-xs ${isLight ? 'text-slate-900' : 'text-slate-100'} flex items-center gap-1.5`}>
                                {val.addedManually && (
                                  <span className="text-[9px] bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-black shrink-0">
                                    DODANY
                                  </span>
                                )}
                                {originItem ? originItem.nazwa : `Nieznany Nr art. (${key.split('_')[0]})`}
                              </h5>
                              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                                Nr art.: {originItem?.kodGlowny || key.split('_')[0]} | EAN: {originItem?.kodPomocniczy || 'brak'}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                                Partia: {val.batch || 'brak'} / Ważn: {val.expiry || 'brak'}
                              </p>
                              {originItem?.customFields && Object.keys(originItem.customFields).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {Object.entries(originItem.customFields).map(([key, value]) => (
                                    <div key={key} className={`px-1.5 py-0.5 rounded text-[9px] border flex items-center ${isLight ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'}`}>
                                      <span className="opacity-70 mr-1 truncate max-w-[60px]">{key}:</span>
                                      <span className="font-bold truncate max-w-[100px]">{value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <div className="text-right">
                                <div className={`text-sm font-extrabold font-mono ${
                                  val.qty === sysQty 
                                    ? (isLight ? 'text-emerald-600 font-black' : 'text-emerald-400')
                                    : (val.qty === 0 && sysQty > 0)
                                    ? (isLight ? 'text-rose-600' : 'text-rose-500')
                                    : (val.qty > 0 && val.qty < sysQty)
                                    ? (isLight ? 'text-blue-600' : 'text-blue-400')
                                    : (isLight ? 'text-amber-600' : 'text-amber-500')
                                }`}>
                                  {val.qty} szt.
                                </div>
                                <span className="text-[9px] text-slate-500 block">
                                  Sys. ({sysQty} szt.)
                                </span>
                              </div>
                              {/* Przycisk dobijania — skanuje ten sam artykuł ponownie */}
                              {originItem && (
                                <button
                                  onClick={() => handleBarcodeScanned(originItem.kodPomocniczy || originItem.kodGlowny)}
                                  className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors border cursor-pointer ${
                                    isLight
                                      ? 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100'
                                      : 'bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20'
                                  }`}
                                >
                                  +1 dobij
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: LOG TRAIL */}
            {activeTab === 'logs' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>Historia operacji laserowych</span>
                  {user?.role === 'admin' && (
                    <button
                      onClick={clearLogs}
                      className="text-rose-600 dark:text-rose-450 hover:underline font-bold transition-all cursor-pointer"
                    >
                      Wyczyść dziennik
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {logs.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-8">Dziennik jest pusty.</p>
                  ) : (
                    logs.map((log, idx) => (
                      <div 
                        key={idx}
                        className={`p-3 rounded-2xl text-[11px] leading-relaxed flex justify-between gap-4 items-center border transition-colors duration-200 ${
                          isLight ? 'bg-white border-slate-200 text-slate-900 shadow-xs' : 'bg-slate-900 border-slate-800 text-slate-100'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-mono">{log.timestamp}</span>
                            <span className={`font-black uppercase text-[9px] px-1 rounded ${
                              log.status === 'sukces' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}>
                              {log.status}
                            </span>
                          </div>
                          <p className={`mt-1 font-semibold ${isLight ? 'text-slate-850' : 'text-slate-200'}`}>{log.itemDescription}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{log.details}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* DATA MANAGER LAUNCHER - Only if already loaded */}
        {!isLocationLocked && items.length > 0 && (
          <button
            onClick={() => {
              if (user?.role === 'admin') {
                setAdminMode('manage');
              } else {
                setAdminMode('work');
              }
              setIsDataManagerOpen(true);
            }}
            className={`w-full p-4 rounded-3xl border flex items-center justify-center gap-2 font-bold transition-all ${
              isLight 
                ? 'bg-white border-slate-200 hover:shadow-md text-teal-600 hover:border-teal-400' 
                : 'bg-slate-900 border-slate-800 hover:bg-slate-800/80 hover:border-teal-500/50 text-teal-400'
            }`}
          >
            <ClipboardList className="h-5 w-5" /> 
            {user?.role === 'admin' ? 'Zarządzanie Baza (Manager)' : 'Zmień arkusz (Chmura)'}
          </button>
        )}

      </main>

      {/* --- FLOATING OVERLAY MODALS --- */}

      {/* Z. Data Management Modal */}
      {isDataManagerOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm overflow-y-auto pt-10 pb-20 px-4">
          <div className="max-w-lg mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white drop-shadow-md">
                {adminMode === 'manage' ? 'Zarządzanie Baza (Manager)' : 'Wybór Arkusza (Pracownik)'}
              </h2>
              <button
                onClick={() => setIsDataManagerOpen(false)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className={`p-4 rounded-3xl space-y-4 ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
               {/* Worker Name Config inside Data Manager */}
               <div className="space-y-1 mt-2 mb-4 p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20">
                  <label className={`block text-xs font-bold ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>Osoba Wykonująca Spis (Twoje Imię / ID)</label>
                  <input
                    type="text"
                    value={config.workerName || ''}
                    onChange={(e) => setConfig({ ...config, workerName: e.target.value })}
                    placeholder="np. Jan Kowalski"
                    className={`w-full mt-2 p-3 rounded-xl border text-sm font-bold focus:outline-none transition-colors ${
                      isLight 
                        ? 'bg-white border-slate-200 text-slate-800 focus:border-teal-500' 
                        : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-teal-500'
                    }`}
                  />
               </div>

              <FirebaseManager 
                items={items}
                onImport={(newItems, importedRound, sheetName) => {
                  setItems(newItems);
                  if (importedRound) setCountRound(importedRound as CountRound);
                  
                  if (newItems.length === 0) {
                     setActiveSheetName('');
                     localStorage.removeItem('mobile_scanner_sheet_name_v1');
                  } else if (sheetName) {
                    setActiveSheetName(sheetName);
                    localStorage.setItem('mobile_scanner_sheet_name_v1', sheetName);
                  }
                  
                  if (newItems.length > 0) setIsDataManagerOpen(false);
                }}
                isLight={isLight}
              />
              {user?.role === 'admin' && adminMode === 'manage' && (
                <ExcelImportExport 
                  items={items}
                  onImport={(newItems) => {
                    setItems(newItems);
                    setActiveSheetName('Lokalny Plik');
                    localStorage.setItem('mobile_scanner_sheet_name_v1', 'Lokalny Plik');
                    if (newItems.length > 0) setIsDataManagerOpen(false);
                  }}
                  onResetToDemo={() => {
                    resetToDefaults();
                    setIsDataManagerOpen(false);
                  }}
                  theme={theme}
                  workerName={config.workerName}
                />
              )}
            </div>
            
            {items.length === 0 && (
             <div className="text-center text-slate-400 text-xs">
                Musisz załadować dane, aby przejść do skanera.
             </div>
            )}
          </div>
        </div>
      )}

      {/* A. Camera Scanner Stage */}
      {isCameraOpen && (
        <ScannerCamera 
          onScanSuccess={handleBarcodeScanned}
          onClose={() => setIsCameraOpen(false)}
        />
      )}

      {/* Logout Confirmation */}
      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-5 border transition-all duration-200 ${
            isLight ? 'bg-white border-slate-200 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <h4 className="font-extrabold text-lg text-center">Wyloguj</h4>
            <p className="text-sm text-center opacity-80">
              Czy na pewno chcesz się wylogować? (Lokalne postępy, które nie zostały wysłane do chmury zostaną usunięte).
            </p>
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setIsLogoutConfirmOpen(false)}
                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all cursor-pointer border ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent' : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700'
                }`}
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsLogoutConfirmOpen(false);
                  
                  // Clear local storage so next user starts fresh
                  localStorage.removeItem('mobile_scanner_inventory_v1');
                  localStorage.removeItem('mobile_scanner_fb_sheet_id');
                  
                  setConfig(prev => ({ ...prev, workerName: '' }));
                  try {
                    await signOut(auth);
                  } catch(e) {}
                  window.location.reload();
                }}
                className={`flex-1 py-3 text-sm font-bold rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500 hover:text-white transition-all cursor-pointer`}
              >
                Wyloguj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B. PIN Authorization Screen */}
      {isPinOpen && (
        <PinModal 
          correctPin={config.pin}
          onSuccess={() => {
            setIsPinOpen(false);
            setIsSettingsOpen(true);
          }}
          onClose={() => setIsPinOpen(false)}
          isLight={isLight}
        />
      )}

      {/* C. Systems Settings panel */}
      {isSettingsOpen && (
        <SettingsPanel 
          config={config}
          isAdmin={user?.role === 'admin'}
          onClose={() => setIsSettingsOpen(false)}
          isLight={isLight}
          onSave={async (newConf, isGlobal) => {
            setConfig(newConf);
            setIsSettingsOpen(false);
            
            if (isGlobal && user?.role === 'admin') {
              try {
                await setDoc(doc(db, "settings", "globalConfig"), {
                  skanZbiorczy: newConf.skanZbiorczy,
                  weryfikacjaPartii: newConf.weryfikacjaPartii,
                  limitIlosci: newConf.limitIlosci,
                  ignorowanePartie: newConf.ignorowanePartie,
                  pokazujInnaLok: newConf.pokazujInnaLok,
                  pozwalajDodawac: newConf.pozwalajDodawac,
                  pin: newConf.pin
                });
                alert("Ustawienia zostały zapisane lokalnie i w chmurze (globalnie dla skanerów).");
              } catch (e) {
                alert("Błąd zapisu w chmurze: " + (e as any).message);
              }
            } else {
              alert("Ustawienia zapisane lokalnie.");
            }
          }}
        />
      )}

      {/* D. BULK QUANTITY MODAL (VBA: Skan zbiorczy) */}
      {bulkScanQuery && (
        <div id="bulk_modal_popup" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div id="bulk_modal_box" className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 text-center border transition-all duration-200 ${
            isLight ? 'bg-white border-slate-200 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <div className={`flex h-12 w-12 mx-auto items-center justify-center rounded-full ${isLight ? 'bg-teal-50 text-teal-600' : 'bg-teal-500/10 text-teal-400'}`}>
              <ClipboardList className="h-6 w-6" />
            </div>
            
            <div className="space-y-1">
              <h4 className={`text-sm font-bold uppercase tracking-widest leading-none ${isLight ? 'text-slate-800' : 'text-slate-400'}`}>B2: Skan Zbiorczy (Ilościowy)</h4>
              <p className={`text-[11px] ${cTextMuted}`}>Wykryto dużą partię towarową przekraczającą limit ({config.limitIlosci} szt.)</p>
            </div>

            <div className={`p-3.5 rounded-2xl border space-y-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'}`}>
              <p className={`font-extrabold text-sm ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{bulkScanQuery.description}</p>
              <p className="text-[10px] text-slate-500 font-mono">Kod towaru: {bulkScanQuery.barcode}</p>
            </div>

            <div className="flex flex-col gap-2">
              <label className={`text-xs font-semibold text-left ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Podaj CAŁKOWITĄ znalezioną ilość fizyczną:</label>
              <div 
                className={`w-full rounded-2xl p-4 font-mono text-center text-xl font-bold transition-all ${
                  isLight 
                    ? 'bg-slate-50 border-2 border-slate-200 text-teal-700' 
                    : 'bg-slate-950 border-2 border-slate-800 text-teal-400'
                }`}
              >
                {bulkInputQty || '0'}
              </div>
              <Numpad 
                value={bulkInputQty} 
                onChange={setBulkInputQty} 
                isLight={isLight} 
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setBulkScanQuery(null)}
                className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={submitBulkScan}
                className="flex-1 py-3 text-xs font-bold rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 transition-all cursor-pointer"
              >
                Potwierdź i Zapisz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* E. BATCH & EXPIRATION DATE CONFIRM DIALOGUE (VBA: WeryfikujPartieIDate - Part 1) */}
      {batchVerificationQuery && (
        <div id="batch_auth_dialogue" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div id="batch_auth_modal" className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-5 border transition-all duration-200 ${
            isLight ? 'bg-white border-slate-200 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 animate-pulse shrink-0" />
              <h4 className={`font-extrabold text-sm ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>B3: Weryfikacja Partii i Daty</h4>
            </div>

            <div className="text-xs space-y-2 leading-relaxed">
              <p className={isLight ? 'text-slate-600 font-semibold' : 'text-slate-300'}>
                Produkt: <strong className={isLight ? 'text-slate-900 font-black' : 'text-white'}>{batchVerificationQuery.description}</strong>
              </p>
              
              <div className={`p-3.5 rounded-2xl border grid grid-cols-2 gap-2 text-center ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Partia systemowa</span>
                  <span className={`font-mono font-bold text-xs ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>{batchVerificationQuery.expectedBatch || 'BRAK'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Termin ważności</span>
                  <span className={`font-mono font-bold text-xs ${isLight ? 'text-teal-700' : 'text-teal-400'}`}>{batchVerificationQuery.expectedExpiry || 'BRAK'}</span>
                </div>
              </div>

              <p className={`mt-1 ${isLight ? 'text-slate-700' : 'text-slate-350'}`}>
                Czy dane odczytane z fizycznego kartonu/opakowania są <strong className={isLight ? 'text-emerald-700' : 'text-emerald-400'}>całkowicie zgodne</strong> z powyższym systemem?
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => submitBatchMatching(false)}
                className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer border ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' : 'bg-slate-800 border-slate-700/60 text-slate-300 hover:bg-slate-700'
                }`}
              >
                NIE (Wprowadź różnicę)
              </button>
              <button
                type="button"
                onClick={() => submitBatchMatching(true)}
                className="flex-1 py-3 text-xs font-bold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all cursor-pointer"
              >
                TAK (Zgodność)
              </button>
            </div>

          </div>
        </div>
      )}

      {/* E2. BATCH SELECTION FOR MULTIPLE ITEMS */}
      {batchSelectionQuery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-5 border transition-all duration-200 ${
            isLight ? 'bg-white border-slate-200 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <h4 className="font-extrabold text-sm text-center">Wykryto wiele wpisów</h4>
            <p className="text-xs text-center opacity-80">
              Wybierz odpowiednią partię/datę z listy by dodać sztukę, lub dodaj nową partię.
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {batchSelectionQuery.matchedItems.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => {
                    processKnownItemScan(batchSelectionQuery.barcode, item);
                    setBatchSelectionQuery(null);
                  }}
                  className={`w-full p-3 rounded-xl border flex flex-col items-start text-left cursor-pointer transition-colors ${
                    isLight ? 'bg-slate-50 border-slate-200 hover:border-teal-500' : 'bg-slate-950 border-slate-800 hover:border-teal-500'
                  }`}
                >
                  <div className="w-full flex justify-between">
                    <div className="text-xs font-bold text-teal-600 dark:text-teal-400">Partia: {item.partia || 'BRAK'}</div>
                    <div className="text-[10px] font-mono opacity-50">Lp. {item.lp}</div>
                  </div>
                  <div className="text-[10px] opacity-70 mt-1">Data: {item.dataWaznosci || 'BRAK'} | Zliczone: {item.licz1 || item.licz2 || item.licz3 || 0} szt.</div>
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBatchSelectionQuery(null)}
                className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer border ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent' : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700'
                }`}
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeviationInput({
                    barcode: batchSelectionQuery.barcode,
                    rowNum: batchSelectionQuery.matchedItems[0].rowNum, // Base off the first one
                    expectedKey: `${(batchSelectionQuery.matchedItems[0].kodGlowny || '').toUpperCase()}_row${batchSelectionQuery.matchedItems[0].rowNum}`
                  });
                  setManualBatch('');
                  setManualExpiry('');
                  setBatchSelectionQuery(null);
                }}
                className={`flex-1 py-3 text-xs font-bold rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500 hover:text-white transition-all cursor-pointer`}
              >
                Inna partia...
              </button>
            </div>
          </div>
        </div>
      )}

      {/* F. INPUT MANUAL BATCH WORK (VBA: WeryfikujPartieIDate - Part 2) */}
      {deviationInput && (
        <div id="deviation_fields_dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div id="deviation_fields_modal" className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 border transition-all duration-200 ${
            isLight ? 'bg-white border-slate-200 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            
            <div className="flex items-center gap-2">
              <PlusCircle className={`h-5 w-5 ${isLight ? 'text-teal-600' : 'text-teal-400'} shrink-0`} />
              <h4 className={`font-extrabold text-sm ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Wprowadzanie Rozbicia Partii</h4>
            </div>

            <p className={`text-xs leading-normal ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
              Zostanie wygenerowany dodatkowy wiersz w Excelu dla nowej partii towaru ułatwiający precyzyjne odczyty (VBA: <code>DodajNowyWierszDoArkusza</code>).
            </p>

            {/* Batch Enter */}
            <div className="flex flex-col gap-1.5">
              <label className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-450'}`}>Zaobserwowana Partia</label>
              <input
                type="text"
                value={manualBatch}
                onChange={(e) => setManualBatch(e.target.value)}
                placeholder="np. LOT-2026A"
                className={`w-full rounded-xl p-2.5 text-xs font-mono uppercase focus:outline-none focus:border-teal-500 transition-colors border ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-950' : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
              />
            </div>

            {/* Expiry Enter */}
            <div className="flex flex-col gap-1.5">
              <label className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-450'}`}>Zaobserwowana Data Ważności</label>
              <input
                type="text"
                value={manualExpiry}
                onChange={(e) => setManualExpiry(e.target.value)}
                placeholder="np. RRRR-MM-DD"
                className={`w-full rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:border-teal-500 transition-colors border ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-950' : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeviationInput(null)}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={submitDeviationLot}
                className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 transition-colors cursor-pointer"
              >
                Utwórz & Zlicz
              </button>
            </div>

          </div>
        </div>
      )}

      {/* G. HANDLE ADDING UNKNOWN ITEMS (VBA: ObslugaBleduLubNadwyzki) */}
      {addUnknownQuery && (
        <div id="unknown_scan_alert_popup" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div id="unknown_scan_alert_box" className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 text-center border transition-all duration-200 ${
            isLight ? 'bg-white border-slate-200 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
              <AlertTriangle className="h-6 w-6 animate-pulse" />
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-black text-rose-500 leading-none">⚠️ Towar spoza bieżącej listy</h4>
              <p className={`text-[11px] ${cTextMuted}`}>Zeskanowano kod: <strong className={`font-mono ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>{addUnknownQuery.barcode}</strong></p>
            </div>

            {/* B6: Show other location alert */}
            {addUnknownQuery.suggestedLoc && config.pokazujInnaLok && (
              <div className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 rounded-2xl text-[11px] leading-relaxed max-w-[280px] mx-auto">
                <Info className="h-4 w-4 mx-auto mb-1 shrink-0" />
                Produkt ten jest przypisany do innej lokalizacji: <strong className="font-extrabold uppercase">{addUnknownQuery.suggestedLoc}</strong>.
              </div>
            )}

            {/* Check if adding block is in place B7 */}
            {!config.pozwalajDodawac ? (
              <div className="space-y-4">
                <div className={`p-3 bg-rose-500/10 border border-rose-500/20 text-xs font-bold rounded-2xl ${
                  isLight ? 'text-rose-700 border-rose-200' : 'text-rose-500 border-rose-500/20'
                }`}>
                  DODAWANIE ZABLOKOWANE (B7)<br />
                  <span className={`text-[10px] font-normal ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Odłóż produkt na paletę do weryfikacji lub nadwyżek.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddUnknownQuery(null)}
                  className={`w-full py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  Zamknij ostrzeżenie
                </button>
              </div>
            ) : (
              /* ALLOW INSERTS B7 */
              <div className="space-y-4">
                <p className={`text-xs leading-normal ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                  Chcesz mimo to zliczyć i dodać pozycję do bieżącej strefy <strong className={isLight ? 'text-slate-900 font-black' : 'text-white'}>{activeLocation}</strong>?
                </p>

                <div className="flex flex-col gap-2">
                  <label className={`text-xs font-medium text-left ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Podaj ilość:</label>
                  <div 
                    className={`w-full rounded-2xl p-3 font-mono text-center text-lg font-bold border ${
                      isLight 
                        ? 'bg-slate-50 border-slate-200 text-teal-700' 
                        : 'bg-slate-950 border-slate-800 text-teal-400'
                    }`}
                  >
                    {addUnknownQty || '0'}
                  </div>
                </div>

                <Numpad 
                  value={addUnknownQty} 
                  onChange={setAddUnknownQty} 
                  isLight={isLight} 
                />

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAddUnknownQuery(null)}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-colors ${
                      isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    Anuluj (Odrzuć)
                  </button>
                  <button
                    type="button"
                    onClick={handleAddUnknown}
                    className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 transition-colors cursor-pointer"
                  >
                    Dopisz Pozycję
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* G. GENERIC CONFIRMATION DIALOG */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
          <div className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 text-center border transition-all duration-200 ${
            isLight ? 'bg-white border-slate-200 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-teal-500/10 text-teal-500">
              <Info className="h-6 w-6" />
            </div>

            <p className="text-sm font-semibold whitespace-pre-wrap">{confirmDialog.message}</p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className={`flex-1 py-3 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="flex-1 py-3 text-xs font-bold rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 transition-colors cursor-pointer"
              >
                Potwierdź
              </button>
            </div>
          </div>
        </div>
      )}

        {/* H. GENERIC ALERT DIALOG */}
        {alertDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
            <div className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 text-center border transition-all duration-200 ${
              isLight ? 'bg-white border-slate-200 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}>
              <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                <AlertTriangle className="h-6 w-6" />
              </div>
  
              {alertDialog.title && <h4 className="text-sm font-black text-rose-500 leading-none">{alertDialog.title}</h4>}
              <p className="text-sm font-semibold whitespace-pre-wrap">{alertDialog.message}</p>
  
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setAlertDialog(null)}
                  className={`w-full py-3 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        )}
  
        {/* Deleted floating bar */}
      </div>
    );
  }


