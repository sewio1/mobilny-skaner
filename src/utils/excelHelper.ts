import * as XLSX from 'xlsx';
import { InventoryItem } from '../types';

export const parseExcelFile = (file: File): Promise<InventoryItem[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // Let the UI render the loading spinner before blocking thread
      setTimeout(() => {
        try {
          const data = e.target?.result;
          if (!data) return reject("Brak danych w pliku");

        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: "" });

        if (rawRows.length === 0) {
          return reject("Wybrany arkusz jest pusty.");
        }

        const firstRowKeys = Object.keys(rawRows[0]);

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
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, "");
        };

        const findColumn = (possibleNames: string[]): string => {
          for (const possible of possibleNames) {
            const normP = normalizeStr(possible);
            for (const key of firstRowKeys) {
              if (normalizeStr(key) === normP) return key;
            }
          }
          for (const possible of possibleNames) {
            const lowerP = possible.toLowerCase().trim();
            for (const key of firstRowKeys) {
              const lowerKey = key.toLowerCase().trim();
              if (lowerKey === lowerP) return key;
            }
          }
          for (const possible of possibleNames) {
            const normP = normalizeStr(possible);
            if (normP.length < 3) continue;
            for (const key of firstRowKeys) {
              const normKey = normalizeStr(key);
              if (normP === "ilosc" && normKey.includes("licz")) continue;
              if (normKey === normP || normKey.includes(normP)) return key;
            }
          }
          for (const possible of possibleNames) {
            const lowerP = possible.toLowerCase().trim();
            for (const key of firstRowKeys) {
              const lowerKey = key.toLowerCase().trim();
              if (lowerKey.includes(lowerP) || lowerP.includes(lowerKey)) {
                if (lowerP === "ilosc" && lowerKey.includes("licz")) continue;
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
        const colLicz1Key = findColumn(["ilosc i licz", "licz 1", "licz1", "count 1", "i liczenie", "spis 1", "licz_1", "liczenie 1", "1 liczenie", "pierwsze liczenie"]);
        const colOsoba1Key = findColumn(["osoba 1", "osoba1", "skaner 1", "skaner1", "kto liczyl 1"]);
        const colLicz2Key = findColumn(["ilosc ii licz", "licz 2", "licz2", "count 2", "ii liczenie", "spis 2", "licz_2", "liczenie 2", "2 liczenie", "drugie liczenie"]);
        const colOsoba2Key = findColumn(["osoba 2", "osoba2", "skaner 2", "skaner2", "kto liczyl 2"]);
        const colLicz3Key = findColumn(["ilosc iii licz", "licz 3", "licz3", "count 3", "iii liczenie", "spis 3", "licz_3", "liczenie 3", "3 liczenie", "trzecie liczenie"]);
        const colOsoba3Key = findColumn(["osoba 3", "osoba3", "skaner 3", "skaner3", "kto liczyl 3"]);
        const colLpKey = findColumn(["lp.", "lp", "index", "l.p.", "liczba porządkowa"]);
        const colPartiaKey = findColumn(["partia", "lot", "batch", "nr partii", "seria", "numer serii"]);
        const colDataKey = findColumn(["data wazn", "data waznosci", "data", "expiry", "date", "data ważności", "termin ważności"]);
        const colAdnotacjeKey = findColumn(["adnotacje", "uwagi", "annotations", "komentarz"]);

        if (!colLokalizacjaKey || !colKodGlownyKey) {
          return reject("Nie można odnaleźć kluczowych kolumn: 'Nr miejsca' (Lokalizacja) lub 'Nr artykułu' (SKU). Upewnij się, że pierwszy wiersz to nagłówki.");
        }

        const parsedItems: InventoryItem[] = rawRows.map((row: any, index: number) => {
          const rawQty = parseFloat(row[colSystemowaKey]);
          const qty = isNaN(rawQty) ? 0 : rawQty;
          const l1 = row[colLicz1Key] !== undefined && row[colLicz1Key] !== "" ? parseFloat(row[colLicz1Key]) : null;
          const l2 = row[colLicz2Key] !== undefined && row[colLicz2Key] !== "" ? parseFloat(row[colLicz2Key]) : null;
          const l3 = row[colLicz3Key] !== undefined && row[colLicz3Key] !== "" ? parseFloat(row[colLicz3Key]) : null;

          return {
            id: `imported-${index}-${Date.now()}`,
            rowNum: index + 2,
            lokalizacja: String(row[colLokalizacjaKey]).trim(),
            kodGlowny: String(row[colKodGlownyKey]).trim(),
            kodPomocniczy: colKodPomocniczyKey ? String(row[colKodPomocniczyKey]).trim() : "",
            nazwa: colNazwaKey ? String(row[colNazwaKey]).trim() : `Artykuł ${row[colKodGlownyKey]}`,
            sj: colSJKey ? String(row[colSJKey]).trim() : "0",
            iloscSystemowa: qty,
            licz1: isNaN(l1 as any) ? null : l1,
            osoba1: colOsoba1Key ? String(row[colOsoba1Key]).trim() : "",
            licz2: isNaN(l2 as any) ? null : l2,
            osoba2: colOsoba2Key ? String(row[colOsoba2Key]).trim() : "",
            licz3: isNaN(l3 as any) ? null : l3,
            osoba3: colOsoba3Key ? String(row[colOsoba3Key]).trim() : "",
            lp: colLpKey ? String(row[colLpKey]).trim() : String(index + 1),
            partia: colPartiaKey ? String(row[colPartiaKey]).trim() : "",
            dataWaznosci: colDataKey ? String(row[colDataKey]).trim() : "",
            adnotacje: colAdnotacjeKey ? String(row[colAdnotacjeKey]).trim() : "",
          };
        });

        resolve(parsedItems);
        } catch (err: any) {
          reject(err.message || err);
        }
      }, 50); // Small 50ms delay to let React render the spinner!
    };
    reader.onerror = (e) => reject("Błąd odczytu pliku");
    reader.readAsArrayBuffer(file);
  });
};

export const exportToExcel = async (items: InventoryItem[], showMessage: (msg: string) => void, onError: (msg: string) => void, workerName?: string) => {
  try {
    const ExcelJS = await import('exceljs');
    const { saveAs } = await import('file-saver');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Dane');

    // Define columns
    worksheet.columns = [
      { header: 'LP.', key: 'lp', width: 6 },
      { header: 'Nr miejsca', key: 'miejsca', width: 15 },
      { header: 'Nr artykułu', key: 'kod', width: 15 },
      { header: 'EAN', key: 'ean', width: 15 },
      { header: 'Nazwa artykułu', key: 'nazwa', width: 40 },
      { header: 'Partia', key: 'partia', width: 15 },
      { header: 'Data ważn.', key: 'dataWazn', width: 12 },
      { header: 'SJ', key: 'sj', width: 8 },
      { header: 'Ilość systemowa', key: 'ilosc', width: 15 },
      { header: 'Ilość I Licz.', key: 'licz1', width: 15 },
      { header: 'Osoba 1', key: 'osoba1', width: 20 },
      { header: 'Ilość II Licz.', key: 'licz2', width: 15 },
      { header: 'Osoba 2', key: 'osoba2', width: 20 },
      { header: 'Ilość III Licz.', key: 'licz3', width: 15 },
      { header: 'Osoba 3', key: 'osoba3', width: 20 },
      { header: 'Adnotacje', key: 'adnotacje', width: 30 },
      ...(workerName ? [{ header: 'Ostatnio pracujący', key: 'workerName', width: 20 }] as any : [])
    ];

    // Style headers
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' } // Light gray
    };

    items.forEach((item, idx) => {
      const row = worksheet.addRow({
        lp: item.lp || String(idx + 1),
        miejsca: item.lokalizacja,
        kod: item.kodGlowny,
        ean: item.kodPomocniczy,
        nazwa: item.nazwa,
        partia: item.partia,
        dataWazn: item.dataWaznosci,
        sj: item.sj,
        ilosc: item.iloscSystemowa,
        licz1: item.licz1 === null ? '' : item.licz1,
        osoba1: item.osoba1 || '',
        licz2: item.licz2 === null ? '' : item.licz2,
        osoba2: item.osoba2 || '',
        licz3: item.licz3 === null ? '' : item.licz3,
        osoba3: item.osoba3 || '',
        adnotacje: item.adnotacje,
        workerName: workerName || ''
      });

      const getStyleForValue = (val: any, sysQty: any): { fill?: any, fontColor?: string } => {
        let type: 'ok' | 'deficit' | 'partial_deficit' | 'surplus' | 'uncounted' = 'uncounted';
        if (val !== null && val !== undefined && String(val).trim() !== "" && !isNaN(Number(val))) {
           const counted = Number(val);
           const sysQtyNum = Number(sysQty) || 0;
           if (counted === sysQtyNum) type = 'ok';
           else if (counted === 0 && sysQtyNum > 0) type = 'deficit';
           else if (counted > 0 && counted < sysQtyNum) type = 'partial_deficit';
           else if (counted > sysQtyNum) type = 'surplus';
        }

        let fill: any = undefined;
        let fontColor: string | undefined = undefined;
        if (type === 'ok') {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
            fontColor = 'FF006100';
        } else if (type === 'deficit') {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
            fontColor = 'FF9C0006';
        } else if (type === 'partial_deficit') {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE5FF' } }; // Blue
            fontColor = 'FF004085';
        } else if (type === 'surplus') {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
            fontColor = 'FF9C6500';
        }
        return { fill, fontColor };
      };

      const applyStyleToCol = (colNum: number, style: { fill?: any, fontColor?: string }) => {
        const cell = row.getCell(colNum);
        if (style.fill) cell.fill = style.fill;
        if (style.fontColor) cell.font = { ...(cell.font || {}), color: { argb: style.fontColor } };
      };

      applyStyleToCol(10, getStyleForValue(item.licz1, item.iloscSystemowa));
      applyStyleToCol(12, getStyleForValue(item.licz2, item.iloscSystemowa));
      applyStyleToCol(14, getStyleForValue(item.licz3, item.iloscSystemowa));
    });

    const currentDateISO = new Date().toISOString().split('T')[0];
    const timeStamp = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
    const uniqueSuffix = `${currentDateISO}_${timeStamp}`;
    const fileName = workerName 
      ? `Inwentaryzacja_${workerName.replace(/\s+/g, '_')}_${uniqueSuffix}.xlsx`
      : `Inwentaryzacja_Dane_${uniqueSuffix}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, fileName);
    
    if (showMessage) {
      showMessage(`Zapisano plik na dysku: ${fileName}`);
    }
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Błąd eksportu Excela: ", msg);
    if (onError) {
      onError("Błąd podczas eksportowania bazy: " + msg);
    }
  }
};

export const exportToOriginalExcel = async (
  items: InventoryItem[],
  originalFileBase64: string,
  fileName: string,
  showMessage: (msg: string) => void,
  onError: (msg: string) => void
) => {
  try {
    const ExcelJS = await import('exceljs');
    const { saveAs } = await import('file-saver');

    const workbook = new ExcelJS.Workbook();
    
    const base64ToArrayBuffer = (base64Str: string): ArrayBuffer => {
      const binaryString = window.atob(base64Str);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    };

    await workbook.xlsx.load(base64ToArrayBuffer(originalFileBase64));
    
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error("Nie znaleziono arkusza w pliku Excel.");
    }

    const getCellStringValue = (cell: any): string => {
      if (cell === null || cell === undefined || cell.value === null || cell.value === undefined) return "";
      const val = cell.value;
      if (typeof val === 'object') {
        if ('richText' in val && Array.isArray((val as any).richText)) {
          return (val as any).richText.map((rt: any) => rt.text || '').join('').trim();
        }
        if ('text' in val) {
          return String((val as any).text || '').trim();
        }
        if ('result' in val) {
          return String((val as any).result || '').trim();
        }
        if ('value' in val) {
          return String((val as any).value || '').trim();
        }
        return JSON.stringify(val);
      }
      return String(val).trim();
    };

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
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
    };

    let headerRowIdx = 1;
    for (let r = 1; r <= 10; r++) {
      const row = worksheet.getRow(r);
      let matches = 0;
      row.eachCell((cell) => {
        const val = getCellStringValue(cell).toLowerCase();
        if (val.includes("lokalizacja") || val.includes("miejsc") || val.includes("artyku") || val.includes("kod")) {
          matches++;
        }
      });
      if (matches >= 2) {
        headerRowIdx = r;
        break;
      }
    }

    const headerRow = worksheet.getRow(headerRowIdx);
    
    // Find the maximum column index that actually has a header label to avoid coloring empty columns
    let maxColStyle = 13;
    try {
      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (colNumber > maxColStyle) {
          maxColStyle = colNumber;
        }
      });
    } catch (e) {
      console.warn("Failed to determine header max column", e);
    }
    
    // Create a flexible column matcher identical to the parser
    const findColumnIndex = (possibleNames: string[]): number | null => {
      // 1. Exact verbatim match (ignoring case/whitespace)
      for (const possible of possibleNames) {
        const lowerP = possible.toLowerCase().trim();
        let colIdx: number | null = null;
        headerRow.eachCell((cell, colNumber) => {
          if (colIdx) return;
          const lowerKey = getCellStringValue(cell).toLowerCase().trim();
          if (lowerKey === lowerP) colIdx = colNumber;
        });
        if (colIdx) return colIdx;
      }
      
      // 2. Exact match using normalizeStr
      for (const possible of possibleNames) {
        const normP = normalizeStr(possible);
        if (normP.length < 3) continue;
        let colIdx: number | null = null;
        headerRow.eachCell((cell, colNumber) => {
          if (colIdx) return;
          const normKey = normalizeStr(getCellStringValue(cell));
          if (normP === "ilosc" && normKey.includes("licz")) return;
          if (normKey === normP || normKey.includes(normP)) colIdx = colNumber;
        });
        if (colIdx) return colIdx;
      }

      // 3. Substring match
      for (const possible of possibleNames) {
        const lowerP = possible.toLowerCase().trim();
        let colIdx: number | null = null;
        headerRow.eachCell((cell, colNumber) => {
          if (colIdx) return;
          const lowerKey = getCellStringValue(cell).toLowerCase().trim();
          if (lowerKey.includes(lowerP) || lowerP.includes(lowerKey)) {
             if (lowerP === "ilosc" && lowerKey.includes("licz")) return;
             colIdx = colNumber;
          }
        });
        if (colIdx) return colIdx;
      }
      
      return null;
    };

    const colIndexLokalizacja = findColumnIndex(["nr miejsca", "lokalizacja", "miejsc", "strefa", "location", "miejsce", "adres"]);
    const colIndexKodGlowny = findColumnIndex(["nr artykulu", "nr artykulu", "kod artykulu", "kod", "article", "sku", "indeks", "nr towaru", "kod towaru", "towar"]);
    const colIndexKodPomocniczy = findColumnIndex(["ean", "kod pomocniczy", "pomocniczy", "barcode", "kod kreskowy", "kody pomocnicze", "ean13"]);
    const colIndexIloscSys = findColumnIndex(["ilosc systemowa", "systemowa", "ilosc", "sys", "oczekiwana", "stan"]);
    const colIndexLicz1 = findColumnIndex(["ilosc i licz", "licz 1", "licz1", "count 1", "i liczenie", "spis 1", "licz_1", "liczenie 1", "1 liczenie", "pierwsze liczenie"]);
    const colIndexOsoba1 = findColumnIndex(["osoba 1", "osoba1", "skaner 1", "skaner1", "kto liczyl 1"]);
    const colIndexLicz2 = findColumnIndex(["ilosc ii licz", "licz 2", "licz2", "count 2", "ii liczenie", "spis 2", "licz_2", "liczenie 2", "2 liczenie", "drugie liczenie"]);
        const colIndexOsoba2 = findColumnIndex(["osoba 2", "osoba2", "skaner 2", "skaner2", "kto liczyl 2"]);
    const colIndexLicz3 = findColumnIndex(["ilosc iii licz", "licz 3", "licz3", "count 3", "iii liczenie", "spis 3", "licz_3", "liczenie 3", "3 liczenie", "trzecie liczenie"]);
    const colIndexOsoba3 = findColumnIndex(["osoba 3", "osoba3", "skaner 3", "skaner3", "kto liczyl 3"]);
    const colIndexAdnotacje = findColumnIndex(["adnotacje", "uwagi", "annotations", "komentarz"]);

    let cLokalizacja = colIndexLokalizacja || 2;
    let cKodGlowny = colIndexKodGlowny || 3;
    let cKodPomocniczy: number | null = colIndexKodPomocniczy || 4;
    let cNazwa = 5;
    let cPartia = 6;
    let cDataWazn = 7;
    let cIloscSys = 8;
    let cLicz1 = colIndexLicz1;
    let cOsoba1 = colIndexOsoba1;
    let cLicz2 = colIndexLicz2;
    let cOsoba2 = colIndexOsoba2;
    let cLicz3 = colIndexLicz3;
    let cOsoba3 = colIndexOsoba3;
    let cAdnotacje = colIndexAdnotacje || 13;

    // Sprawdzamy czy ktokolwiek robił dane liczenie
    const hasOsoba1 = items.some(i => !!i.osoba1);
    const hasOsoba2 = items.some(i => !!i.osoba2);
    const hasOsoba3 = items.some(i => !!i.osoba3);

    // Dynamicznie dodajemy tylko te kolumny liczenia, które rzeczywiście miały miejsce
    let nextCol = headerRow.cellCount + 1;
    const thinBorder = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} } as any;
    if (hasOsoba1 && !cOsoba1) { 
      cOsoba1 = nextCol++; 
      const c = headerRow.getCell(cOsoba1); c.value = "Liczenie I (Osoba)"; c.font = { bold: true }; c.border = thinBorder; worksheet.getColumn(cOsoba1).width = 22;
    }
    if (hasOsoba2 && !cOsoba2) { 
      cOsoba2 = nextCol++; 
      const c = headerRow.getCell(cOsoba2); c.value = "Liczenie II (Osoba)"; c.font = { bold: true }; c.border = thinBorder; worksheet.getColumn(cOsoba2).width = 22;
    }
    if (hasOsoba3 && !cOsoba3) { 
      cOsoba3 = nextCol++; 
      const c = headerRow.getCell(cOsoba3); c.value = "Liczenie III (Osoba)"; c.font = { bold: true }; c.border = thinBorder; worksheet.getColumn(cOsoba3).width = 22;
    }
    items.forEach((item) => {
      let safeRowNum = Number(item.rowNum);
      if (isNaN(safeRowNum) || safeRowNum < 1) {
        safeRowNum = worksheet.rowCount + 1;
      }
      
      let row = worksheet.getRow(safeRowNum);
      const rowKeyIdx = cKodGlowny || 3;
      const sheetRowCode = getCellStringValue(row.getCell(rowKeyIdx)).trim().toUpperCase();
      const itemCodeParsed = (item.kodGlowny || "").trim().toUpperCase();

      let isNewOrDeviation = (item as any).isNew === true;

      if (isNewOrDeviation) {
        // Nowe wiersze (rozbicia partii) wstawiamy bezpośrednio POD oryginalnym wierszem źródłowym
        // Szukamy ostatniego wiersza z tym samym kodem w arkuszu, żeby dodać poniżej
        let sourceRowNumber = worksheet.rowCount + 1; // fallback na koniec pliku
        const targetCode = (item.kodGlowny || "").trim().toUpperCase();
        const targetLoc = (item.lokalizacja || "").trim().toUpperCase();
        let lastMatchRowNumber = -1;
        worksheet.eachRow((r, rowIdx) => {
          if (rowIdx > headerRowIdx) {
            const codeVal = getCellStringValue(r.getCell(cKodGlowny || 3)).trim().toUpperCase();
            const locVal = cLokalizacja ? getCellStringValue(r.getCell(cLokalizacja)).trim().toUpperCase() : "";
            if (codeVal === targetCode && (locVal === targetLoc || !cLokalizacja)) {
              lastMatchRowNumber = rowIdx;
            }
          }
        });
        if (lastMatchRowNumber > 0) {
          // Wstawiamy nowy pusty wiersz bezpośrednio po ostatnim wierszu tego artykułu
          sourceRowNumber = lastMatchRowNumber + 1;
          worksheet.spliceRows(sourceRowNumber, 0, []);
        } else {
          // Nie znaleziono artykułu, dodaj na końcu
          worksheet.addRow([]);
          sourceRowNumber = worksheet.rowCount;
        }
        row = worksheet.getRow(sourceRowNumber);
      } else {
        // Istniejące wiersze: najpierw sprawdź czy na zadanym numerze wiersza jest właściwy rekord
        const sheetRowMatches =
          sheetRowCode === itemCodeParsed &&
          (cLokalizacja ? getCellStringValue(row.getCell(cLokalizacja)).trim().toUpperCase() === (item.lokalizacja || "").trim().toUpperCase() : true);

        if (!sheetRowMatches && itemCodeParsed) {
          // Szukamy wiersza pasującego do kodu + lokalizacji + partii + daty
          let found = false;
          const itemLoc = (item.lokalizacja || "").trim().toUpperCase();
          const itemPartia = (item.partia || "").trim().toUpperCase();
          const itemData = (item.dataWaznosci || "").trim().toUpperCase();

          worksheet.eachRow((r, rowIdx) => {
            if (rowIdx > headerRowIdx && !found) {
              const codeVal = getCellStringValue(r.getCell(cKodGlowny || 3)).trim().toUpperCase();
              const locVal = cLokalizacja ? getCellStringValue(r.getCell(cLokalizacja)).trim().toUpperCase() : "";
              const partiaVal = getCellStringValue(r.getCell(cPartia || 6)).trim().toUpperCase();
              const dataVal = getCellStringValue(r.getCell(cDataWazn || 7)).trim().toUpperCase();

              if (
                codeVal === itemCodeParsed &&
                (locVal === itemLoc || !cLokalizacja) &&
                (partiaVal === itemPartia || !itemPartia) &&
                (dataVal === itemData || !itemData)
              ) {
                row = r;
                found = true;
              }
            }
          });

          if (!found) {
            // Nie znaleziono – szukaj po samym kodzie i lokalizacji (bez partii/daty)
            worksheet.eachRow((r, rowIdx) => {
              if (rowIdx > headerRowIdx && !found) {
                const codeVal = getCellStringValue(r.getCell(cKodGlowny || 3)).trim().toUpperCase();
                const locVal = cLokalizacja ? getCellStringValue(r.getCell(cLokalizacja)).trim().toUpperCase() : "";
                if (codeVal === itemCodeParsed && (locVal === (item.lokalizacja || "").trim().toUpperCase() || !cLokalizacja)) {
                  row = r;
                  found = true;
                }
              }
            });
          }

          if (!found) {
            row = worksheet.addRow([]);
            isNewOrDeviation = true;
          }
        }
      }

      // Dla zupełnie nowych wierszy wypełnij lewą stronę (kod, EAN, nazwa, partia, data, itp.)
      if (isNewOrDeviation) {
        if (cLokalizacja) { const c = row.getCell(cLokalizacja); c.value = item.lokalizacja || null; c.border = thinBorder; }
        if (cKodGlowny) { 
          const c = row.getCell(cKodGlowny); 
          c.value = item.kodGlowny || null; 
          c.border = thinBorder; 
        }
        if (cKodPomocniczy) { const c = row.getCell(cKodPomocniczy); c.value = item.kodPomocniczy || null; c.border = thinBorder; }
        if (cNazwa) { const c = row.getCell(cNazwa); c.value = item.nazwa || null; c.border = thinBorder; }
        if (cPartia) { const c = row.getCell(cPartia); c.value = item.partia || null; c.border = thinBorder; }
        if (cDataWazn) { const c = row.getCell(cDataWazn); c.value = item.dataWaznosci || null; c.border = thinBorder; }
        if (cIloscSys) { const c = row.getCell(cIloscSys); c.value = 0; c.border = thinBorder; }
        
        // Dodajmy też domyślnie LP. jeśli wiersz jest nowy
        const colLp = headerRow.cellCount >= 1 ? 1 : null;
        if (colLp) {
          const c = row.getCell(colLp);
          if (!c.value) { c.value = item.lp || String(worksheet.rowCount); c.border = thinBorder; }
        }

        // Zastosuj obramowania do WSZYSTKICH komórek w zakresie nagłówka, żeby nie było "dziur"
        // WAŻNE: nie sprawdzamy c.border bo ExcelJS zawsze zwraca obiekt nawet dla pustej granicy
        const totalCols = Math.max(headerRow.cellCount, cAdnotacje || 0, cLicz1 || 0, cLicz2 || 0, cLicz3 || 0);
        for (let col = 1; col <= totalCols; col++) {
          row.getCell(col).border = thinBorder;
        }
      }

      if (cLicz1) {
        const cell = row.getCell(cLicz1);
        cell.value = (item.licz1 === null || item.licz1 === undefined || String(item.licz1).trim() === "") ? null : Number(item.licz1);
      }
      if (cOsoba1) {
        const c = row.getCell(cOsoba1); c.value = item.osoba1 || null; c.border = thinBorder;
      }
      if (cLicz2) {
        const cell = row.getCell(cLicz2);
        cell.value = (item.licz2 === null || item.licz2 === undefined || String(item.licz2).trim() === "") ? null : Number(item.licz2);
      }
      if (cOsoba2) {
        const c = row.getCell(cOsoba2); c.value = item.osoba2 || null; c.border = thinBorder;
      }
      if (cLicz3) {
        const cell = row.getCell(cLicz3);
        cell.value = (item.licz3 === null || item.licz3 === undefined || String(item.licz3).trim() === "") ? null : Number(item.licz3);
      }
      if (cOsoba3) {
        const c = row.getCell(cOsoba3); c.value = item.osoba3 || null; c.border = thinBorder;
      }
        if (cAdnotacje) {
          const c = row.getCell(cAdnotacje);
          c.value = item.adnotacje || null;
          c.alignment = { wrapText: true, vertical: 'top' };
          c.border = thinBorder;
          if (item.adnotacje) {
             row.height = undefined; // Force auto-height for wrapped text
          }
        }

      const getStyleForValue = (val: any, sysQty: any): { fill?: any, fontColor?: string } => {
        let type: 'ok' | 'deficit' | 'partial_deficit' | 'surplus' | 'uncounted' = 'uncounted';
        if (val !== null && val !== undefined && String(val).trim() !== "" && !isNaN(Number(val))) {
           const counted = Number(val);
           const sysQtyNum = Number(sysQty) || 0;
           if (counted === sysQtyNum) type = 'ok';
           else if (counted === 0 && sysQtyNum > 0) type = 'deficit';
           else if (counted > 0 && counted < sysQtyNum) type = 'partial_deficit';
           else if (counted > sysQtyNum) type = 'surplus';
        }

        let fill: any = undefined;
        let fontColor: string | undefined = undefined;
        if (type === 'ok') {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }; // Green
            fontColor = 'FF006100';
        } else if (type === 'deficit') {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }; // Red
            fontColor = 'FF9C0006';
        } else if (type === 'partial_deficit') {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE5FF' } }; // Blue
            fontColor = 'FF004085';
        } else if (type === 'surplus') {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } }; // Yellow
            fontColor = 'FF9C6500';
        }
        return { fill, fontColor };
      };

      const applyStyleToCol = (colNum: number, style: { fill?: any, fontColor?: string }) => {
        const cell = row.getCell(colNum);
        
        // Klonowanie stylu, aby obejść błąd biblioteki exceljs polegający na nadpisywaniu 
        // współdzielonych stylów (co powoduje kolorowanie całego wiersza z oryginalnego pliku)
        const clonedStyle = JSON.parse(JSON.stringify(cell.style || {}));
        
        if (style.fill) clonedStyle.fill = style.fill;
        if (style.fontColor) {
          clonedStyle.font = clonedStyle.font || {};
          clonedStyle.font.color = { argb: style.fontColor };
        }
        
        cell.style = clonedStyle;
      };

      if (cLicz1) applyStyleToCol(cLicz1, getStyleForValue(item.licz1, item.iloscSystemowa));
      if (cLicz2) applyStyleToCol(cLicz2, getStyleForValue(item.licz2, item.iloscSystemowa));
      if (cLicz3) applyStyleToCol(cLicz3, getStyleForValue(item.licz3, item.iloscSystemowa));
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, fileName);
    
    if (showMessage) {
      showMessage(`Zapisano gotowy do druku oryginalny arkusz: ${fileName}`);
    }
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Błąd eksportu szablonu: ", msg);
    if (onError) {
      onError("Błąd eksportu szablonu: " + msg);
    }
  }
};
export const exportDiscrepancyReport = async (items: InventoryItem[], showMessage: (msg: string) => void, onError: (msg: string) => void, workerName?: string, countRound?: string) => {
  try {
    const ExcelJS = await import('exceljs');
    const { saveAs } = await import('file-saver');
    const discrepancies = items.filter(i => {
      const licz = countRound === '2' ? i.licz2 : (countRound === '3' ? i.licz3 : i.licz1);
      return licz !== null && licz !== undefined && Number(licz) !== Number(i.iloscSystemowa);
    });
    if (discrepancies.length === 0) {
      showMessage("Brak niezgodnosci.");
      return;
    }
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Niezgodnosci');
    worksheet.addRow(["Lokalizacja", "Kod Glowny", "Nazwa", "Ilosc Systemowa", "Policzono", "Roznica"]);
    discrepancies.forEach(i => {
      const licz = countRound === '2' ? i.licz2 : (countRound === '3' ? i.licz3 : i.licz1);
      worksheet.addRow([i.lokalizacja, i.kodGlowny, i.nazwa, i.iloscSystemowa, licz, Number(licz) - Number(i.iloscSystemowa)]);
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const ms = Date.now();
    saveAs(blob, "Raport_Niezgodnosci_" + ms + ".xlsx");
    showMessage("Wyeksportowano raport niezgodnosci.");
  } catch (e: any) {
    onError(e.message || "Blad");
  }
};
