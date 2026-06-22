import React, { useEffect, useState, useRef } from 'react';
import { Bell, Trash2, AlertTriangle } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot, Timestamp, writeBatch, doc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { sounds } from '../utils/sound';

export interface AppNotification {
  id: string;
  message: string;
  timestamp: Timestamp | null;
  isRead: boolean;
  workerName: string;
  location: string;
}

export default function NotificationBell({ isLight = false }: { isLight?: boolean }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  
  const isInitialSnapshot = useRef(true);

  useEffect(() => {
    // Prośba o uprawnienia do wysyłania powiadomień systemowych (Web Push API)
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }

    const q = query(
      collection(db, 'notifications'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: AppNotification[] = [];
      let newUnreadCount = 0;
      
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as AppNotification;
          
          if (!isInitialSnapshot.current) {
            console.log('[NotificationBell] PUSH WYZWOLONY DLA:', data.message);
            sounds.playSuccess(); // Sygnał dla Admina
            
            if (typeof Notification !== 'undefined') {
              if (Notification.permission === 'granted') {
                new Notification('System WMS', {
                  body: data.message,
                  icon: '/icon.svg',
                });
              } else if (Notification.permission !== 'denied') {
                Notification.requestPermission();
              }
            }
          }
        }
      });

      // Zbieranie wszystkich do listy dropdown
      snapshot.forEach((doc) => {
        const data = doc.data() as AppNotification;
        fetched.push({ ...data, id: doc.id });
        if (!data.isRead) newUnreadCount++;
      });

      setNotifications(fetched);
      setUnreadCount(newUnreadCount);
      isInitialSnapshot.current = false;
    }, (error) => {
      console.error("[NotificationBell] onSnapshot error:", error);
      alert("Błąd powiadomień: " + error.message);
    });

    return () => unsubscribe();
  }, []);

  const toggleDropdown = async () => {
    setIsOpen(!isOpen);
    if (!isOpen && unreadCount > 0) {
      setUnreadCount(0); // Optymistyczna aktualizacja UI
      
      try {
        const batch = writeBatch(db);
        const unreadDocs = notifications.filter(n => !n.isRead);
        unreadDocs.forEach(n => {
          const ref = doc(db, 'notifications', n.id);
          batch.update(ref, { isRead: true });
        });
        await batch.commit();
      } catch (e) {
        console.error("Błąd podczas odznaczania powiadomień", e);
      }
    }
  };

  const handleClearHistory = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const q = query(collection(db, 'notifications'));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(d => {
        batch.delete(d.ref);
      });
      await batch.commit();
      setIsConfirmingClear(false);
      sounds.playSuccess();
    } catch (err) {
      console.error("Błąd podczas usuwania historii", err);
      sounds.playError();
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={toggleDropdown}
        className={`relative p-2 rounded-full transition-colors cursor-pointer ${
          isLight ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-slate-800 text-slate-300'
        }`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full border-2 border-slate-900 shadow-md">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={`absolute right-0 mt-2 w-80 rounded-2xl shadow-2xl border backdrop-blur-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
          isLight ? 'bg-white/95 border-slate-200' : 'bg-slate-900/95 border-slate-700'
        }`}>
          <div className={`p-4 border-b font-bold text-sm flex items-center justify-between ${isLight ? 'border-slate-200 text-slate-800' : 'border-slate-700 text-white'}`}>
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-teal-500" />
              Historia Zdarzeń
            </div>
            {notifications.length > 0 && !isConfirmingClear && (
              <button 
                onClick={(e) => { e.stopPropagation(); setIsConfirmingClear(true); }}
                className={`p-1.5 rounded-lg transition-colors ${isLight ? 'hover:bg-rose-100 text-rose-500' : 'hover:bg-rose-500/20 text-rose-400'}`}
                title="Wyczyść historię"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
            {isConfirmingClear ? (
              <div className={`p-6 text-center text-xs space-y-4 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                <div className="mx-auto w-10 h-10 flex items-center justify-center rounded-full bg-rose-500/10 text-rose-500 mb-2">
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                </div>
                <p>Czy na pewno chcesz usunąć całą historię powiadomień?</p>
                <div className="flex gap-2 justify-center mt-4">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsConfirmingClear(false); }}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                  >
                    Anuluj
                  </button>
                  <button 
                    onClick={handleClearHistory}
                    className="px-3 py-1.5 rounded-lg font-medium bg-rose-500 hover:bg-rose-600 text-white transition-colors"
                  >
                    Usuń wszystko
                  </button>
                </div>
              </div>
            ) : notifications.length === 0 ? (
              <div className={`p-6 text-center text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Brak powiadomień w systemie.
              </div>
            ) : (
              notifications.map((notif) => (
                <div key={notif.id} className={`p-3 border-b last:border-b-0 text-xs transition-colors ${
                  isLight ? 'border-slate-100 hover:bg-slate-50' : 'border-slate-800/50 hover:bg-slate-800/80'
                }`}>
                  <div className="flex justify-between items-start mb-1.5">
                    <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      isLight ? 'bg-slate-200 text-slate-800' : 'bg-slate-800 text-teal-400'
                    }`}>
                      {notif.workerName || 'Pracownik'}
                    </span>
                    <span className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                      {notif.timestamp ? notif.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Wysyłanie...'}
                    </span>
                  </div>
                  <p className={`leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                    {notif.message}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
