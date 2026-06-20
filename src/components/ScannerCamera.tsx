/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, RefreshCw, AlertCircle } from 'lucide-react';
import { sounds } from '../utils/sound';

interface ScannerCameraProps {
  onScanSuccess: (barcode: string) => void;
  onClose: () => void;
}

export default function ScannerCamera({ onScanSuccess, onClose }: ScannerCameraProps) {
  const [cameras, setCameras] = useState<Html5QrcodeCamera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [scannerError, setScannerError] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  const qrRef = useRef<Html5Qrcode | null>(null);
  const SCANNER_DOM_ID = "camera-scanner-view";

  interface Html5QrcodeCamera {
    id: string;
    label: string;
  }

  useEffect(() => {
    // 1. Get list of cameras
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setPermissionGranted(true);
          const formatted = devices.map(d => ({ id: d.id, label: d.label }));
          setCameras(formatted);

          // Prefer back camera ("environment" lookups)
          const backCam = formatted.find(c => 
            c.label.toLowerCase().includes('back') || 
            c.label.toLowerCase().includes('tył') || 
            c.label.toLowerCase().includes('rear') ||
            c.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        } else {
          setScannerError("Brak wykrytych kamer w urządzeniu.");
        }
      })
      .catch((err) => {
        console.error("Camera access error:", err);
        setPermissionGranted(false);
        setScannerError("Brak uprawnień do kamery. Zezwól na dostęp w ustawieniach przeglądarki.");
      });

    return () => {
      // Cleanup scanner upon unmount
      if (qrRef.current && qrRef.current.isScanning) {
        qrRef.current.stop().catch(err => console.error("Scanner stop err:", err));
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedCameraId || !permissionGranted) return;

    // Start scanner with active camera
    try {
      const html5Qrcode = new Html5Qrcode(SCANNER_DOM_ID);
      qrRef.current = html5Qrcode;

      setIsScanning(true);
      html5Qrcode.start(
        selectedCameraId,
        {
          fps: 15,
          qrbox: (width, height) => {
            const size = Math.min(width, height) * 0.7;
            return { width: size, height: size * 0.5 }; // Horizontal barcode shape is ideal!
          },
          aspectRatio: 1.333333,
        },
        (decodedText) => {
          // Success read!
          sounds.playSuccess();
          onScanSuccess(decodedText);
          onClose();
        },
        () => {
          // Silent error updates (for frame parse failures)
        }
      )
      .catch((err) => {
        console.error("Failed to start reading:", err);
        setScannerError(`Błąd inicjalizacji kamery: ${err}`);
        setIsScanning(false);
      });
    } catch (e) {
      console.error("Scanner exception:", e);
      setScannerError("Nie można uruchomić wizualnego skanera.");
    }

    return () => {
      if (qrRef.current && qrRef.current.isScanning) {
        const scannerInstance = qrRef.current;
        setIsScanning(false);
        scannerInstance.stop()
          .then(() => {
            console.log("Scanner stopped.");
          })
          .catch((err) => {
            console.error("Error stopping camera stream:", err);
          });
      }
    };
  }, [selectedCameraId, permissionGranted]);

  const toggleCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].id);
  };

  return (
    <div id="camera_modal_wrapper" className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/95 sm:justify-center p-4">
      <div id="camera_modal_content" className="relative mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-teal-400" />
            <h3 className="font-semibold text-slate-100">Skaner Aparatu</h3>
          </div>
          <button 
            id="close_camera_btn"
            onClick={onClose} 
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Camera Stage */}
        <div className="relative aspect-[4/3] w-full bg-slate-950 flex items-center justify-center">
          
          {/* Aim Overlay HUD */}
          {isScanning && (
            <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-8">
              <div className="flex justify-between">
                <div className="h-6 w-6 border-t-2 border-l-2 border-teal-400 rounded-tl-sm"></div>
                <div className="h-6 w-6 border-t-2 border-r-2 border-teal-400 rounded-tr-sm"></div>
              </div>
              
              {/* Laser Line */}
              <div className="relative w-full flex items-center justify-center">
                <div className="h-[2px] w-4/5 bg-teal-500 shadow-[0_0_8px_#2dd4bf] animate-pulse"></div>
              </div>

              <div className="flex justify-between">
                <div className="h-6 w-6 border-b-2 border-l-2 border-teal-400 rounded-bl-sm"></div>
                <div className="h-6 w-6 border-b-2 border-r-2 border-teal-400 rounded-br-sm"></div>
              </div>
            </div>
          )}

          {/* Actual Video Reader Container */}
          <div id={SCANNER_DOM_ID} className="h-full w-full object-cover"></div>

          {/* Fallback states */}
          {scannerError && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90">
              <AlertCircle className="h-12 w-12 text-rose-500 mb-3" />
              <p className="text-sm font-medium text-slate-200">{scannerError}</p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-teal-400 rounded-lg transition-colors border border-slate-700"
              >
                Odśwież uprawnienia
              </button>
            </div>
          )}

          {!scannerError && !isScanning && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-slate-400">
              <RefreshCw className="h-10 w-10 animate-spin text-teal-400 mb-3" />
              <p className="text-sm">Inicjalizacja podglądu wideo...</p>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex flex-col gap-3 bg-slate-900 px-5 py-4 border-t border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">
              Nakieruj aparat na kod kreskowy (EAN) lub kod QR artykułu.
            </p>
            {cameras.length > 1 && (
              <button
                id="switch_camera_btn"
                onClick={toggleCamera}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 rounded-lg border border-slate-700 hover:bg-slate-700 active:bg-slate-600 transition-all cursor-pointer shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Zmień kamerę
              </button>
            )}
          </div>
          
          {cameras.length > 0 && (
            <div className="text-[10px] text-slate-500 truncate text-right">
              Maska aktywnej kamery: {cameras.find(c => c.id === selectedCameraId)?.label || "Domyślna"}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
