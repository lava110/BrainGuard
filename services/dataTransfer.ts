
import { getAllHistory, importHistory, getBaseline, saveBaseline, getContact, saveContact, clearBaseline, HistoryRecord } from './db';
import { BaselineData, EmergencyContact } from '../types';

interface BackupData {
    version: number;
    timestamp: number;
    baseline: BaselineData | null;
    contact: EmergencyContact | null;
    history: HistoryRecord[];
}

// Export Data to JSON File
export const exportData = async () => {
    try {
        const history = await getAllHistory();
        const baseline = getBaseline();
        const contact = getContact();

        const backup: BackupData = {
            version: 1,
            timestamp: Date.now(),
            baseline,
            contact,
            history
        };

        const dataStr = JSON.stringify(backup, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        
        // Trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().split('T')[0];
        a.download = `brainguard_backup_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        return true;
    } catch (e) {
        console.error("Export failed", e);
        return false;
    }
};

// Import Data from JSON File
export const importData = async (file: File): Promise<{success: boolean, message: string}> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const json = e.target?.result as string;
                if (!json) throw new Error("File is empty");
                
                const backup: BackupData = JSON.parse(json);
                
                if (!backup.version) {
                    throw new Error("Invalid backup format");
                }

                // Restore LocalStorage Data
                if (backup.baseline) saveBaseline(backup.baseline);
                if (backup.contact) saveContact(backup.contact);

                // Restore IndexedDB Data
                if (backup.history && backup.history.length > 0) {
                    await importHistory(backup.history);
                }

                resolve({ success: true, message: `成功恢复 ${backup.history.length} 条记录` });
            } catch (err) {
                console.error(err);
                resolve({ success: false, message: "文件格式错误或已损坏" });
            }
        };

        reader.onerror = () => {
            resolve({ success: false, message: "读取文件失败" });
        };

        reader.readAsText(file);
    });
};
