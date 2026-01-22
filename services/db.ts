
import { BaselineData, EmergencyContact } from '../types';

export interface HistoryRecord {
  id?: number;
  type: 'VISUAL' | 'AUDIO' | 'TOUCH';
  score: number;
  details: string;
  timestamp: number;
  snapshot?: string; // Base64 image for visual records
}

const DB_NAME = 'BrainGuardDB';
const DB_VERSION = 1;
const STORE_NAME = 'history';
const BASELINE_KEY = 'neuro_baseline_v1';
const CONTACT_KEY = 'neuro_contact_v1';

// Initialize DB
export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
};

// Save a single record
export const saveRecord = async (record: Omit<HistoryRecord, 'id'>) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to save record:", error);
  }
};

// Get records from the last 7 days
export const getHistory7Days = async (): Promise<HistoryRecord[]> => {
  try {
    const db = await initDB();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const range = IDBKeyRange.lowerBound(sevenDaysAgo);
      const request = index.getAll(range);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return [];
  }
};

// --- BACKUP & RESTORE METHODS ---

// Get ALL records for backup
export const getAllHistory = async (): Promise<HistoryRecord[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to fetch all history:", error);
    return [];
  }
};

// Import records
export const importHistory = async (records: HistoryRecord[]) => {
    try {
        const db = await initDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // We use a promise all to wait for all adds
        const promises = records.map(record => {
            // Remove ID to let IDB auto-increment and avoid collisions
            const { id, ...data } = record; 
            return new Promise((resolve, reject) => {
                const req = store.add(data as HistoryRecord);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        });

        await Promise.all(promises);
        return true;
    } catch (error) {
        console.error("Failed to import history:", error);
        throw error;
    }
};

// Factory Reset
export const clearAllData = async (): Promise<boolean> => {
    try {
        // 1. Clear LocalStorage
        localStorage.removeItem(BASELINE_KEY);
        localStorage.removeItem(CONTACT_KEY);
        
        // 2. Delete IndexedDB
        return new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(false);
            req.onblocked = () => {
                console.warn("Delete database blocked");
                // Attempt to force close connection if possible, but usually implies open tabs
                resolve(false); 
            };
        });
    } catch (e) {
        console.error("Clear data failed", e);
        return false;
    }
};

// --- BASELINE MANAGEMENT ---

export const getBaseline = (): BaselineData | null => {
  const data = localStorage.getItem(BASELINE_KEY);
  return data ? JSON.parse(data) : null;
};

export const saveBaseline = (data: Partial<BaselineData>) => {
  const current = getBaseline() || { timestamp: Date.now() };
  const updated = { ...current, ...data, timestamp: Date.now() };
  localStorage.setItem(BASELINE_KEY, JSON.stringify(updated));
};

export const clearBaseline = () => {
  localStorage.removeItem(BASELINE_KEY);
};

// --- EMERGENCY CONTACT ---

export const getContact = (): EmergencyContact | null => {
  const data = localStorage.getItem(CONTACT_KEY);
  return data ? JSON.parse(data) : null;
};

export const saveContact = (data: EmergencyContact) => {
  localStorage.setItem(CONTACT_KEY, JSON.stringify(data));
};
