import React, { useState, useEffect, useContext, useRef } from 'react';
import { db } from '../firebase';
import { collection, doc, setDoc, getDocs, updateDoc, writeBatch, query, where, getDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { InventoryItem } from '../types';
import { UserContext } from '../App';
import { Cloud, UploadCloud, Play, Plus, Server, FileSpreadsheet } from 'lucide-react';
import { auth } from '../firebase';
import { parseExcelFile, exportToExcel, exportToOriginalExcel } from '../utils/excelHelper';

interface FirebaseManagerProps {
  items: InventoryItem[];
  onImport: (items: InventoryItem[], round?: string) => void;
  isLight: boolean;
}

export default function FirebaseManager({ items, onImport, isLight }: FirebaseManagerProps) {
  const user = useContext(UserContext);
  const [sheets, setSheets] = useState<any[]>([]);
  const [activeSheetId, _setActiveSheetId] = useState<string | null>(localStorage.getItem('mobile_scanner_fb_sheet_id'));

  const setActiveSheetId = (newId: string | null) => {
    _setActiveSheetId(newId);
    if (newId) localStorage.setItem('mobile_scanner_fb_sheet_id', newId);
    else localStorage.removeItem('mobile_scanner_fb_sheet_id');
    window.dispatchEvent(new Event('fb-sheet-changed'));
  };

  useEffect(() => {
    const handleStorageChange = () => {
      _setActiveSheetId(localStorage.getItem('mobile_scanner_fb_sheet_id'));
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('fb-sheet-changed', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('fb-sheet-changed', handleStorageChange);
    };
  }, []);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage({ text, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const getInitialSnapshot = (): Record<number, string> => {
    try {
      const saved = localStorage.getItem('mobile_scanner_sync_snapshot_v1');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error reading sync snapshot from localStorage:", e);
    }
    return {};
  };

  const lastSyncedItemsRef = useRef<Record<number, string>>(getInitialSnapshot());
  
  const updateSyncSnapshot = (currentItems: InventoryItem[]) => {
    const snap: Record<number, string> = {};
    currentItems.forEach((it, idx) => {
      snap[idx] = `${it.licz1}|${it.licz2}|${it.licz3}|${it.adnotacje}|${it.osoba1}|${it.osoba2}|${it.osoba3}`;
    });
    lastSyncedItemsRef.current = snap;
    try {
      localStorage.setItem('mobile_scanner_sync_snapshot_v1', JSON.stringify(snap));
    } catch (e) {
      console.error("Error saving sync snapshot to localStorage:", e);
    }
  };

  // Set initial sync snapshot to prevent bulk upload exactly after a page reload
  useEffect(() => {
    if (activeSheetId && items.length > 0) {
      const saved = localStorage.getItem('mobile_scanner_sync_snapshot_v1');
      if (!saved) {
        updateSyncSnapshot(items);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    if (activeSheetId && user?.uid) {
      // Debounced auto-save without depending on stale sheet list state
      timeout = setTimeout(() => {
        syncCurrentProgressToCloud(true).catch(e => console.error("Auto-sync failed:", e));
      }, 5000);
    }
    return () => { if (timeout) clearTimeout(timeout); };
  }, [items]); // triggers 5 seconds after every change to items (each scan)

  useEffect(() => {
    const q = query(collection(db, 'sheets'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedSheets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedSheets.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSheets(loadedSheets);
    }, (error) => {
      console.error("Error fetching sheets:", error);
    });

    return () => unsubscribe();
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const uploadFileDirectlyToCloud = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadError(null);
      const parsedItems = await parseExcelFile(file);
      if (parsedItems.length === 0) {
          setUploadError('Arkusz jest pusty.');
          setIsUploading(false);
          return;
      }
      
      const sheetName = file.name.replace(/\.[^/.]+$/, ""); // remove extension
      const base64File = await fileToBase64(file);

      const sheetRef = doc(collection(db, 'sheets'));
      const hasChunks = base64File.length > 800000;
      await setDoc(sheetRef, {
        name: sheetName,
        status: 'available',
        currentRound: '1',
        assignedTo: null,
        createdBy: user?.uid,
        createdAt: new Date().toISOString(),
        hasChunks: hasChunks,
        originalFileBase64: hasChunks ? null : base64File
      });
      
      if (hasChunks) {
        const CHUNK_LEN = 800000;
        const chunksCount = Math.ceil(base64File.length / CHUNK_LEN);
        const chunkBatch = writeBatch(db);
        for (let i = 0; i < chunksCount; i++) {
          const strChunk = base64File.substring(i * CHUNK_LEN, (i + 1) * CHUNK_LEN);
          const chunkRef = doc(collection(db, `sheets/${sheetRef.id}/chunks`), `chunk_${i}`);
          chunkBatch.set(chunkRef, { data: strChunk, index: i });
        }
        await chunkBatch.commit();
      }
      
      // Chunk array into batches of 450
      const CHUNK_SIZE = 450;
      for (let i = 0; i < parsedItems.length; i += CHUNK_SIZE) {
        const chunk = parsedItems.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((item, index) => {
          const itemRef = doc(collection(db, `sheets/${sheetRef.id}/items`), `item_${i + index}`);
          batch.set(itemRef, item);
        });
        await batch.commit();
      }
      
      showToast(`Pomyślnie wgrano arkusz "${sheetName}" (${parsedItems.length} pozycji) do chmury!`, 'success');
    } catch (e: any) {
      setUploadError("Błąd podczas wgrywania pliku: " + e);
      console.error(e);
    } finally {
      setIsUploading(false);
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmUnassignId, setConfirmUnassignId] = useState<string | null>(null);

  const deleteSheet = async (sheetId: string) => {
    setConfirmDeleteId(null);
    try {
      if (activeSheetId === sheetId) {
         setActiveSheetId(null);
         localStorage.removeItem('mobile_scanner_fb_sheet_id');
         localStorage.removeItem('mobile_scanner_sync_snapshot_v1');
      }
      
      const q = query(collection(db, `sheets/${sheetId}/items`));
      const snap = await getDocs(q);
      
      const CHUNK_SIZE = 450;
      for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
        const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }

      const chunksSnap = await getDocs(query(collection(db, `sheets/${sheetId}/chunks`)));
      if (!chunksSnap.empty) {
        const chunkBatch = writeBatch(db);
        chunksSnap.docs.forEach(docSnap => chunkBatch.delete(docSnap.ref));
        await chunkBatch.commit();
      }

      await deleteDoc(doc(db, 'sheets', sheetId));
      showToast("Arkusz usunięty!", 'success');
    } catch(e: any) {
      showToast("Wystąpił błąd przy usuwaniu: " + e.message, 'error');
    }
  };

  const unassignSheet = async (sheetId: string) => {
    try {
      setConfirmUnassignId(null);
      await updateDoc(doc(db, 'sheets', sheetId), {
        status: 'available',
        assignedTo: null,
        assignedEmail: null
      });
      showToast('Arkusz został zwolniony i jest gotowy do ponownego przypisania.', 'info');
    } catch (e: any) {
      showToast("Wystąpił błąd podczas odblokowywania: " + e.message, 'error');
    }
  };

  const advanceRound = async (sheetId: string, currentRound: string) => {
    try {
      const nextRound = currentRound === '1' ? '2' : '3';
      await updateDoc(doc(db, 'sheets', sheetId), {
        status: 'available',
        currentRound: nextRound,
        assignedTo: null,
        assignedEmail: null
      });
      showToast('Udostępniono do ' + (nextRound === '2' ? 'drugiego' : 'trzeciego') + ' liczenia.', 'success');
    } catch (e: any) {
      showToast("Błąd: " + e.message, 'error');
    }
  };

  const takeOwnershipAndDownload = async (sheetId: string, claim: boolean = true) => {
    try {
      if (claim) {
        // 1. Claim it
        await updateDoc(doc(db, 'sheets', sheetId), {
          assignedTo: user?.uid,
          assignedEmail: user?.email,
          status: 'in_progress'
        });
      }
      
      // 2. Download items
      const sheetDocRef = doc(db, 'sheets', sheetId);
      const sheetDocSnap = await getDoc(sheetDocRef);
      const currentRound = sheetDocSnap.data()?.currentRound || '1';

      const q = query(collection(db, `sheets/${sheetId}/items`));
      const snap = await getDocs(q);
      const docsWithId = snap.docs.map(doc => ({ id: doc.id, data: doc.data() as InventoryItem }));
      // Sort robustly by the numeric part of "item_123"
      docsWithId.sort((a,b) => parseInt(a.id.split('_')[1] || '0') - parseInt(b.id.split('_')[1] || '0'));
      const loadedItems = docsWithId.map(d => d.data);
      
      updateSyncSnapshot(loadedItems);
      onImport(loadedItems, currentRound);
      setActiveSheetId(sheetId);
      localStorage.setItem('mobile_scanner_fb_sheet_id', sheetId);
      if (claim) {
        showToast('Pobrano arkusz do pracy!', 'success');
      } else {
        showToast('Wznowiono pracę w arkuszu!', 'success');
      }
    } catch (e: any) {
      showToast("Błąd: " + e.message, 'error');
    }
  };

  const loadSheetForAdmin = async (sheetId: string) => {
    try {
      const sheetDocRef = doc(db, 'sheets', sheetId);
      const sheetDocSnap = await getDoc(sheetDocRef);
      const currentRound = sheetDocSnap.data()?.currentRound || '1';

      const q = query(collection(db, `sheets/${sheetId}/items`));
      const snap = await getDocs(q);
      const docsWithId = snap.docs.map(doc => ({ id: doc.id, data: doc.data() as InventoryItem }));
      docsWithId.sort((a,b) => parseInt(a.id.split('_')[1] || '0') - parseInt(b.id.split('_')[1] || '0'));
      const loadedItems = docsWithId.map(d => d.data);
      
      onImport(loadedItems, currentRound);
      setActiveSheetId(null);
      localStorage.removeItem('mobile_scanner_fb_sheet_id');
      localStorage.removeItem('mobile_scanner_sync_snapshot_v1');
      // We don't set activeSheetId because the admin is just observing
      showToast(`Wczytano arkusz do podglądu/eksportu. Zawiera ${loadedItems.length} pozycji.`, 'info');
    } catch (e: any) {
      showToast("Błąd: " + e.message, 'error');
    }
  };

  const [isDownloadingId, setIsDownloadingId] = useState<string | null>(null);

  const downloadProcessedSheet = async (sheet: any) => {
    try {
      setIsDownloadingId(sheet.id);
      const q = query(collection(db, `sheets/${sheet.id}/items`));
      const snap = await getDocs(q);
      const docsWithId = snap.docs.map(doc => ({ id: doc.id, data: doc.data() as InventoryItem }));
      docsWithId.sort((a,b) => parseInt(a.id.split('_')[1] || '0') - parseInt(b.id.split('_')[1] || '0'));
      const loadedItems = docsWithId.map(d => d.data);

      const currentDateISO = new Date().toISOString().split('T')[0];
      const timeStamp = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
      const uniqueSuffix = `${currentDateISO}_${timeStamp}`;
      const fileName = `Inwentaryzacja_Eksport_${sheet.name}_${uniqueSuffix}.xlsx`;

      let base64 = sheet.originalFileBase64;
      if (sheet.hasChunks) {
         const chunksSnap = await getDocs(query(collection(db, `sheets/${sheet.id}/chunks`)));
         const chunks = chunksSnap.docs.map(d => d.data());
         chunks.sort((a,b) => a.index - b.index);
         base64 = chunks.map(c => c.data).join('');
      }

      if (base64) {
        await exportToOriginalExcel(
          loadedItems,
          base64,
          fileName,
          (msg) => showToast(msg, 'success'),
          (msg) => showToast(msg, 'error')
        );
      } else {
        await exportToExcel(
          loadedItems,
          (msg) => showToast(msg, 'success'),
          (msg) => showToast(msg, 'error'),
          "Admin_Eksport"
        );
      }
    } catch (e: any) {
      showToast("Błąd podczas eksportu: " + e.message, 'error');
    } finally {
      setIsDownloadingId(null);
    }
  };

  const syncCurrentProgressToCloud = async (silent: boolean = false, forceFull: boolean = false, itemsOverride?: any[]): Promise<boolean> => {
    if (!activeSheetId) return false;
    try {
      const sheetDoc = await getDoc(doc(db, 'sheets', activeSheetId));
      if (!sheetDoc.exists()) {
         showToast('Błąd: Ten arkusz został usunięty z serwera. Przerwano synchronizację.', 'error');
         return false;
      }
      const sheetData = sheetDoc.data();

      const CHUNK_SIZE = 450;
      let totalUpdated = 0;
      
      const targetItems = itemsOverride || items;
      
      // Extract only the items that have changed since the last snapshot (or all on forceFull)
      const itemsToUpdate = targetItems
        .map((item, index) => ({ item, index }))
        .filter(({ item, index }) => {
           if (forceFull) return true;
           const currentHashed = `${item.licz1}|${item.licz2}|${item.licz3}|${item.adnotacje}|${item.osoba1}|${item.osoba2}|${item.osoba3}`;
           return lastSyncedItemsRef.current[index] !== currentHashed;
        });

      if (itemsToUpdate.length > 0) {
        for (let i = 0; i < itemsToUpdate.length; i += CHUNK_SIZE) {
          const chunk = itemsToUpdate.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach(({ item, index }) => {
            const itemRef = doc(collection(db, `sheets/${activeSheetId}/items`), `item_${index}`);
            batch.set(itemRef, {
              licz1: item.licz1,
              licz2: item.licz2,
              licz3: item.licz3,
              adnotacje: item.adnotacje,
              osoba1: item.osoba1 || null,
              osoba2: item.osoba2 || null,
              osoba3: item.osoba3 || null
            }, { merge: true });
            totalUpdated++;
          });
          await batch.commit();
        }
        
        // Update snapshot after successful sync
        updateSyncSnapshot(targetItems);
        console.log(`[Delta Sync] Synced ${totalUpdated} changed items to Firebase.`);
        
        if (!silent) {
          showToast('Synchronizacja zakończona pomyślnie!', 'success');
        }
      } else {
        console.log(`[Delta Sync] No changes detected. Skipping Firebase write.`);
        if (!silent) {
          showToast('Arkusz jest już zsynchronizowany (brak nowych zmian).', 'info');
        }
      }

      return true;
    } catch(e: any) {
      showToast("Błąd połączenia z serwerem: " + e.message + "\n\nNie obawiaj się, twoje dane są bezpiecznie zapisane na urządzeniu. Spróbuj ponownie.", 'error');
      throw e; // Rethrow to prevent caller from advancing and clearing local state!
    }
  };
  
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [fillZerosOnFinish, setFillZerosOnFinish] = useState(false);

  const performReturn = async () => {
    setConfirmReturn(false);
    const success = await syncCurrentProgressToCloud(true, true);
    if (!success) {
       onImport([]);
       setActiveSheetId(null);
       localStorage.removeItem('mobile_scanner_fb_sheet_id');
       localStorage.removeItem('mobile_scanner_sync_snapshot_v1');
       return;
    }
    
    // Release the sheet on Firebase so others (and this user) can claim/resume it from any device
    try {
      await updateDoc(doc(db, 'sheets', activeSheetId!), {
        status: 'available',
        assignedTo: null,
        assignedEmail: null
      });
    } catch (e: any) {
      console.error("Błąd podczas zwalniania blokady arkusza:", e);
    }

    onImport([]); // Wyczyść stan
    setActiveSheetId(null);
    localStorage.removeItem('mobile_scanner_fb_sheet_id');
    localStorage.removeItem('mobile_scanner_sync_snapshot_v1');
    showToast('Zamknięto arkusz i zwolniono blokadę.', 'success');
  };

  const returnSheet = async () => {
      if (!activeSheetId) return;
      setConfirmReturn(true);
  };

  const performFinish = async () => {
    setConfirmFinish(false);
    try {
        let currentItems = items;
        if (fillZerosOnFinish) {
            const sheetDoc = await getDoc(doc(db, 'sheets', activeSheetId!));
            const round = sheetDoc.data()?.currentRound || '1';
            
            currentItems = items.map(item => {
               const workerEmail = user?.displayName || user?.email || 'Nieznany';
               let updatedItem = { ...item };
               let filled = false;
               if (round === '1' && (item.licz1 === null || item.licz1 === undefined) && item.iloscSystemowa > 0) { updatedItem.licz1 = 0; updatedItem.osoba1 = workerEmail; filled = true; }
               if (round === '2' && (item.licz2 === null || item.licz2 === undefined) && item.iloscSystemowa > 0) { updatedItem.licz2 = 0; updatedItem.osoba2 = workerEmail; filled = true; }
               if (round === '3' && (item.licz3 === null || item.licz3 === undefined) && item.iloscSystemowa > 0) { updatedItem.licz3 = 0; updatedItem.osoba3 = workerEmail; filled = true; }
               
               if (filled) {
                 const current = updatedItem.adnotacje || "";
                 const parts = current.split(/\s*\|\s*/).map(p => p.trim()).filter(Boolean);
                 const roundPrefix = round === '1' ? 'I Liczenie: ' : round === '2' ? 'II Liczenie: ' : 'III Liczenie: ';
                 const updatedParts = parts.filter(part => {
                    if (round === '1') {
                      if (part === "Brak" || part.startsWith("Braki:") || part.startsWith("Nadwyżka:")) return false;
                    }
                    return !part.startsWith(roundPrefix);
                 });
                 updatedParts.push(`${roundPrefix}Brak`);
                 updatedItem.adnotacje = updatedParts.join(" | ");
               }
               return updatedItem;
            });
            onImport(currentItems); // immediately reflect locally so subsequent actions see zeros.
        }

        const success = await syncCurrentProgressToCloud(true, true, currentItems);
        if (!success) {
           onImport([]);
           setActiveSheetId(null);
           localStorage.removeItem('mobile_scanner_fb_sheet_id');
           localStorage.removeItem('mobile_scanner_sync_snapshot_v1');
           return;
        }
        await updateDoc(doc(db, 'sheets', activeSheetId!), {
          status: 'completed'
        });
        onImport([]); // Wyczyść stan
        setActiveSheetId(null);
        localStorage.removeItem('mobile_scanner_fb_sheet_id');
        localStorage.removeItem('mobile_scanner_sync_snapshot_v1');
        setFillZerosOnFinish(false);
        showToast('Zakończono pracę z arkuszem!', 'success');
    } catch(e: any) {
         console.error("Przerwano ze względu na błąd synchronizacji", e);
         showToast("Nie można zakończyć arkusza z powodu błędu: " + e.message, 'error');
    }
  };

  const finishSheet = async () => {
      if (!activeSheetId) return;
      setConfirmFinish(true);
  };

  const btnStyle = `flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs transition-colors cursor-pointer`;

  return (
    <div className={`p-4 rounded-3xl border mb-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'}`}>
      <div className={`flex justify-between items-center mb-4 border-b pb-3 ${isLight ? 'border-slate-200' : 'border-slate-800/40'}`}>
        <h3 className={`font-bold text-sm flex items-center gap-2 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
          <Server className="h-4 w-4 text-teal-500" /> System Chmurowy
        </h3>
        <p className="text-xs text-slate-500 flex items-center gap-2">
           Zalogowano: {user?.email} ({user?.role === 'admin' ? 'Administrator' : 'Pracownik'})
           <button onClick={() => { 
              localStorage.removeItem('mobile_scanner_fb_sheet_id'); 
              const cStr = (() => { localStorage.removeItem('mobile_scanner_sync_snapshot_v1'); return localStorage.getItem('mobile_scanner_config_v1'); })();
              if (cStr) {
                 try {
                   const c = JSON.parse(cStr);
                   delete c.workerName;
                   localStorage.setItem('mobile_scanner_config_v1', JSON.stringify(c));
                 } catch(e) {}
              }
              onImport([]); 
              auth.signOut(); 
           }} className="text-rose-500 hover:text-rose-400 font-bold transition-colors cursor-pointer ml-2">Wyloguj</button>
        </p>
      </div>

      <div className="mb-6 p-5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-center">
        <p className="text-sm font-bold text-teal-400 mb-2">Dodaj nowy arkusz do chmury</p>
        <p className="text-xs text-slate-400 mb-4">Wybierz plik z telefonu lub komputera, a trafi on prosto do wspólnej chmury.</p>
        {uploadError && <div className="mb-4 text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 p-3 rounded-xl">{uploadError}</div>}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.xlsb"
          onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                  uploadFileDirectlyToCloud(e.target.files[0]);
                  e.target.value = '';
              }
          }}
          className="hidden"
        />
        <button 
          onClick={() => {
              if (!isUploading) fileInputRef.current?.click();
          }} 
          disabled={isUploading}
          className={`${btnStyle} ${isUploading ? 'bg-slate-500 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-500 cursor-pointer'} text-white w-full sm:w-auto mx-auto mt-2`}
        >
          {isUploading ? (
            <>
              <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-1"></div>
              Przetwarzanie i wysyłanie pliku...
            </>
          ) : (
            <>
              <FileSpreadsheet className="h-4 w-4" /> Wybierz i Prześlij Plik z Excela do Chmury
            </>
          )}
        </button>
      </div>

      <div>
        <p className={`text-xs font-bold mb-3 uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Dostępne Arkusze:</p>
        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
          {sheets.filter(s => user?.role === 'admin' || s.status === 'available' || (s.status === 'in_progress' && s.assignedTo === user?.uid)).length === 0 && <p className="text-xs text-slate-500 py-4 text-center border border-dashed rounded-xl border-slate-800">Brak arkuszy w bazie. Administrator musi coś przesłać.</p>}
          {sheets.filter(s => user?.role === 'admin' || s.status === 'available' || (s.status === 'in_progress' && s.assignedTo === user?.uid)).map(sheet => (
            <div key={sheet.id} className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
                sheet.status === 'completed'
                    ? (isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800 opacity-50')
                    : (isLight ? 'border-slate-200 bg-white shadow-xs' : 'border-slate-700 bg-slate-800/50')
            }`}>
              <div className="w-full sm:w-auto text-center sm:text-left">
                <p className={`font-bold text-sm ${sheet.status === 'completed' ? 'text-slate-500 line-through' : 'text-teal-400'}`}>
                    {sheet.name} {sheet.currentRound && sheet.currentRound !== '1' && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30">Runda {sheet.currentRound}</span>}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                    {new Date(sheet.createdAt).toLocaleString()} | Status: {sheet.status}
                    {sheet.assignedTo && sheet.assignedEmail && ` | Wypełnia: ${sheet.assignedEmail}`}
                </p>
              </div>
              <div className="w-full sm:w-auto flex flex-wrap justify-center sm:justify-end gap-2">
                {activeSheetId === sheet.id ? (
                  <>
                    <button 
                      onClick={() => onImport(items)}
                      className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold cursor-pointer w-full sm:w-auto transition-colors text-center flex items-center justify-center gap-1 shadow-xs"
                    >
                      Skanuj (Wznów)
                    </button>
                    <button 
                      onClick={() => syncCurrentProgressToCloud(false, true)} 
                      className={`px-3 py-2 rounded-lg text-xs font-bold cursor-pointer w-full sm:w-auto transition-colors flex items-center justify-center gap-1 ${
                        isLight ? 'bg-sky-100 text-sky-700 hover:bg-sky-200 border border-sky-200' : 'bg-sky-600/20 text-sky-400 hover:bg-sky-600/40 border border-sky-500/30'
                      }`}
                    >
                      <Cloud className="h-4 w-4" /> Prześlij do chmury
                    </button>
                    <button 
                      onClick={returnSheet} 
                      className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold cursor-pointer w-full sm:w-auto transition-colors"
                    >
                      Rozłącz
                    </button>
                    <button 
                      onClick={finishSheet} 
                      className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer w-full sm:w-auto transition-colors"
                    >
                      Zakończ i Oddaj
                    </button>
                  </>
                ) : sheet.status === 'available' ? (
                  <button 
                    onClick={() => takeOwnershipAndDownload(sheet.id)}
                    className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold cursor-pointer w-full sm:w-auto transition-colors"
                  >
                    Pracuj na tym arkuszu
                  </button>
                ) : sheet.status === 'in_progress' ? (
                  sheet.assignedTo === user?.uid ? (
                    <button 
                      onClick={() => takeOwnershipAndDownload(sheet.id, false)}
                      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer w-full sm:w-auto transition-colors"
                    >
                      Wznów pracę
                    </button>
                  ) : (
                    <span className={`text-[10px] font-bold px-3 py-2 rounded-lg w-full sm:w-auto text-center flex items-center justify-center ${
                      isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-400'
                    }`}>
                      Zajęte: {sheet.assignedEmail ? sheet.assignedEmail.split('@')[0] : 'Inny pracownik'}
                    </span>
                  )
                ) : sheet.status === 'completed' ? (
                   <span className={`text-[10px] font-bold px-3 py-2 rounded-lg w-full sm:w-auto text-center flex items-center justify-center ${
                     isLight ? 'bg-slate-100/80 text-slate-500 line-through' : 'bg-slate-800 text-slate-500'
                   }`}>Zakończono</span>
                ) : null}
                {user?.role === 'admin' && (
                  <>
                    <button 
                      onClick={() => loadSheetForAdmin(sheet.id)}
                      className="px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold cursor-pointer w-full sm:w-auto transition-colors"
                    >
                      Pobierz podgląd
                    </button>
                    <button 
                      onClick={() => downloadProcessedSheet(sheet)}
                      disabled={isDownloadingId === sheet.id}
                      className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white text-xs font-bold cursor-pointer w-full sm:w-auto transition-colors flex items-center justify-center gap-1.5"
                    >
                      <FileSpreadsheet className="h-4 w-4" /> 
                      {isDownloadingId === sheet.id ? 'Pobieranie...' : 'Pobierz Gotowy Plik'}
                    </button>
                    {(sheet.status === 'in_progress' || sheet.status === 'completed') && (
                      confirmUnassignId === sheet.id ? (
                        <button 
                          onClick={() => unassignSheet(sheet.id)}
                          className="px-3 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold cursor-pointer w-full sm:w-auto transition-colors"
                        >
                          Potwierdź cofnięcie do puli
                        </button>
                      ) : (
                        <button 
                          onClick={() => setConfirmUnassignId(sheet.id)}
                          className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold cursor-pointer w-full sm:w-auto transition-colors"
                        >
                          Cofnij do puli
                        </button>
                      )
                    )}
                    {sheet.status === 'completed' && (!sheet.currentRound || sheet.currentRound === '1' || sheet.currentRound === '2') && (
                        <button 
                          onClick={() => advanceRound(sheet.id, sheet.currentRound || '1')}
                          className="px-3 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold cursor-pointer w-full sm:w-auto transition-colors"
                        >
                          Udostępnij {(!sheet.currentRound || sheet.currentRound === '1') ? '2-gie' : '3-cie'} liczenie
                        </button>
                    )}
                    {confirmDeleteId === sheet.id ? (
                      <button 
                        onClick={() => deleteSheet(sheet.id)}
                        className="px-3 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-[10px] font-bold cursor-pointer w-full sm:w-auto transition-colors"
                      >
                        Potwierdź usunięcie
                      </button>
                    ) : (
                      <button 
                        onClick={() => setConfirmDeleteId(sheet.id)}
                        className="px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer w-full sm:w-auto transition-colors"
                      >
                        Usuń
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeSheetId && (
        <div className="h-20"></div> /* Spacer so list doesn't get hidden behind the fixed bar */
      )}

      {/* Confirmation Modals */}
      {confirmReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-5 border transition-all duration-200 ${
            isLight ? 'bg-white border-slate-200 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <h4 className="font-extrabold text-lg text-center text-amber-500 dark:text-amber-400">Rozłączanie z arkuszem</h4>
            <p className={`text-sm text-center ${isLight ? 'text-slate-600' : 'text-slate-300 opacity-80'}`}>
              Czy na pewno chcesz przestać pracować nad tym arkuszem na tym urządzeniu? Inni wciąż będą mogli w nim pracować.
            </p>
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setConfirmReturn(false)}
                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all cursor-pointer ${
                  isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={performReturn}
                className="flex-1 py-3 text-sm font-bold rounded-xl bg-amber-500 text-slate-900 hover:bg-amber-400 transition-all cursor-pointer"
              >
                Rozłącz
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmFinish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-5 border transition-all duration-200 ${
            isLight ? 'bg-white border-slate-200 text-slate-950' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <h4 className="font-extrabold text-lg text-center text-emerald-600 dark:text-emerald-400">Kończenie Arkusza</h4>
            <p className={`text-sm text-center ${isLight ? 'text-slate-600' : 'text-slate-300 opacity-80'}`}>
              Czy na pewno chcesz OSTATECZNIE ZAMKNĄĆ ten arkusz? Zablokuje to edycję dla wszystkich w chmurze!
            </p>
            <label className="flex items-center gap-2 cursor-pointer mt-4">
              <input 
                type="checkbox" 
                checked={fillZerosOnFinish}
                onChange={(e) => setFillZerosOnFinish(e.target.checked)}
                className="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-500 cursor-pointer"
              />
              <span className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Uzupełnij jeszcze niezeskanowane systemowe pozycje zerami? (Nie nadpisze pobranych)</span>
            </label>
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setConfirmFinish(false)}
                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all cursor-pointer ${
                  isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={performFinish}
                className="flex-1 py-3 text-sm font-bold rounded-xl bg-emerald-500 text-slate-900 hover:bg-emerald-400 transition-all cursor-pointer"
              >
                Zakończ
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full p-4 rounded-3xl shadow-2xl flex items-center justify-between border animate-fade-in transition-all bg-slate-900 border-slate-800 text-slate-100 dark:bg-white dark:border-slate-200 dark:text-slate-950">
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
              toastMessage.type === 'success' ? 'bg-emerald-500' :
              toastMessage.type === 'error' ? 'bg-rose-500' : 'bg-amber-500'
            }`} />
            <p className="text-xs font-bold leading-normal">{toastMessage.text}</p>
          </div>
          <button 
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1.5 hover:bg-slate-800 dark:hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Zamknij
          </button>
        </div>
      )}
    </div>
  );
}
