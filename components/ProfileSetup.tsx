import React, { useState, useEffect, useRef } from 'react';
import { User, Phone, Save, ChevronLeft, HeartHandshake, RefreshCcw, AlertCircle, Database, Download, Upload, CheckCircle2, Trash2 } from 'lucide-react';
import { saveContact, getContact, clearBaseline, clearAllData } from '../services/db';
import { exportData, importData } from '../services/dataTransfer.ts';
import { EmergencyContact } from '../types';

interface Props {
  onBack: () => void;
  onRecalibrate: () => void;
}

const ProfileSetup: React.FC<Props> = ({ onBack, onRecalibrate }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState(false);
  const [backupStatus, setBackupStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [restoreStatus, setRestoreStatus] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [restoreMsg, setRestoreMsg] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const current = getContact();
    if (current) {
      setName(current.name);
      setPhone(current.phone);
    }
  }, []);

  const handleSave = () => {
    if (!name || !phone) return;
    
    const contact: EmergencyContact = {
      name,
      phone,
      autoShare: true
    };
    saveContact(contact);
    setSaved(true);
    setTimeout(() => {
        setSaved(false);
    }, 2000);
  };

  const handleResetBaseline = () => {
      if (confirm("确定要重新校准吗？\n\n如果您觉得现在的操作更熟练了，或者身体状况发生了变化，重新校准可以建立更准确的健康标准。")) {
          clearBaseline();
          onRecalibrate(); 
      }
  };

  const handleBackup = async () => {
      const success = await exportData();
      if (success) {
          setBackupStatus('SUCCESS');
          setTimeout(() => setBackupStatus('IDLE'), 3000);
      } else {
          setBackupStatus('ERROR');
      }
  };

  const handleRestoreClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!confirm("恢复数据将合并备份文件中的记录到当前设备。\n\n建议在恢复前先进行备份。确定继续吗？")) {
          e.target.value = ''; // clear input
          return;
      }

      setRestoreStatus('PROCESSING');
      const result = await importData(file);
      
      if (result.success) {
          setRestoreStatus('SUCCESS');
          setRestoreMsg(result.message);
          // Reload contact fields if they were updated
          const current = getContact();
          if (current) {
            setName(current.name);
            setPhone(current.phone);
          }
      } else {
          setRestoreStatus('ERROR');
          setRestoreMsg(result.message);
      }
      
      e.target.value = ''; // reset for next use
      setTimeout(() => setRestoreStatus('IDLE'), 4000);
  };

  const handleFactoryReset = async () => {
      const confirm1 = confirm("⚠️ 警告：这将永久删除此设备上的所有 BrainGuard 数据！\n\n包括：\n- 所有历史检测记录\n- 亲情联系人设置\n- 个人基准线数据\n\n此操作无法撤销。");
      if (confirm1) {
          const confirm2 = confirm("请再次确认：您确定要抹除所有数据并重置应用吗？");
          if (confirm2) {
              await clearAllData();
              alert("数据已抹除，应用将重启。");
              window.location.reload();
          }
      }
  };

  return (
    <div className="flex flex-col items-center p-6 h-full animate-in fade-in slide-in-from-right duration-300 overflow-y-auto bg-warm-50">
      {/* Header */}
      <div className="w-full flex items-center justify-between mb-8">
        <button onClick={onBack} className="p-2 bg-white border border-warm-200 rounded-full text-warm-800">
            <ChevronLeft />
        </button>
        <h2 className="text-xl font-bold text-warm-900">设置与账户</h2>
        <div className="w-10" />
      </div>

      <div className="w-full max-w-md space-y-6 pb-20">
          
          {/* Section 1: Contact */}
          <div className="bg-white p-6 rounded-3xl border border-warm-200 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
                 <div className="p-3 bg-red-100 rounded-full text-red-500">
                    <HeartHandshake size={24} />
                 </div>
                 <h3 className="font-bold text-lg text-warm-900">亲情账号</h3>
             </div>

             <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-xs text-warm-500 ml-1 uppercase">联系人称呼</label>
                    <input 
                        type="text" 
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="如: 儿子、女儿"
                        className="w-full bg-warm-50 border border-warm-200 rounded-xl py-3 px-4 text-warm-900 focus:outline-none focus:border-warm-500 transition-colors"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs text-warm-500 ml-1 uppercase">手机号码</label>
                    <input 
                        type="tel" 
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="用于紧急联系"
                        className="w-full bg-warm-50 border border-warm-200 rounded-xl py-3 px-4 text-warm-900 focus:outline-none focus:border-warm-500 transition-colors"
                    />
                </div>

                <button 
                    onClick={handleSave}
                    disabled={!name || !phone}
                    className={`w-full py-3 mt-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all
                        ${saved 
                            ? 'bg-status-ok text-white' 
                            : (!name || !phone) ? 'bg-warm-200 text-warm-400' : 'bg-face text-white active:scale-95'
                        }`}
                >
                    {saved ? '已保存' : '保存设置'}
                    {!saved && <Save size={18} />}
                </button>
             </div>
          </div>

          {/* Section 2: Data Management */}
          <div className="bg-white p-6 rounded-3xl border border-warm-200 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
                 <div className="p-3 bg-face-light rounded-full text-face">
                    <Database size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-lg text-warm-900">数据管理</h3>
                    <p className="text-xs text-warm-500">备份到手机，或迁移至新设备</p>
                 </div>
             </div>

             <div className="flex gap-3">
                 <button 
                    onClick={handleBackup}
                    className="flex-1 py-3 rounded-xl bg-warm-50 border border-warm-200 hover:border-face flex flex-col items-center justify-center gap-1 active:scale-95 transition-all"
                 >
                     {backupStatus === 'SUCCESS' ? (
                         <CheckCircle2 className="text-face" />
                     ) : (
                         <Download className="text-warm-500" />
                     )}
                     <span className="text-xs font-bold text-warm-500">
                         {backupStatus === 'SUCCESS' ? '已下载' : '备份数据'}
                     </span>
                 </button>

                 <button 
                    onClick={handleRestoreClick}
                    className="flex-1 py-3 rounded-xl bg-warm-50 border border-warm-200 hover:border-face flex flex-col items-center justify-center gap-1 active:scale-95 transition-all"
                 >
                     {restoreStatus === 'SUCCESS' ? (
                         <CheckCircle2 className="text-face" />
                     ) : (
                         <Upload className="text-warm-500" />
                     )}
                     <span className="text-xs font-bold text-warm-500">
                         {restoreStatus === 'PROCESSING' ? '恢复中...' : '恢复数据'}
                     </span>
                 </button>
                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".json" 
                    className="hidden" 
                 />
             </div>
             
             {restoreStatus === 'SUCCESS' && (
                 <p className="text-center text-xs text-face mt-3">{restoreMsg}</p>
             )}
             {restoreStatus === 'ERROR' && (
                 <p className="text-center text-xs text-status-danger mt-3">{restoreMsg}</p>
             )}
          </div>

          {/* Section 3: Calibration */}
          <div className="bg-white p-6 rounded-3xl border border-warm-200 shadow-sm">
             <div className="flex items-center gap-3 mb-4">
                 <div className="p-3 bg-voice-light rounded-full text-voice">
                    <RefreshCcw size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-lg text-warm-900">重置基准线</h3>
                    <p className="text-xs text-warm-500">当您觉得操作更熟练或身体状态变化时使用</p>
                 </div>
             </div>
             
             <div className="bg-warm-50 p-4 rounded-xl mb-4 border border-warm-200">
                <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-status-warn mt-0.5 shrink-0" />
                    <p className="text-xs text-warm-500 leading-relaxed">
                        重新校准将清除旧数据，需要重新完成三项测试。
                    </p>
                </div>
             </div>

             <button 
                onClick={handleResetBaseline}
                className="w-full py-3 rounded-xl border border-voice text-voice font-bold hover:bg-voice hover:text-white transition-colors active:scale-95"
            >
                开始重新校准
             </button>
          </div>

          {/* Section 4: Danger Zone */}
          <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
             <div className="flex items-center gap-3 mb-4">
                 <div className="p-3 bg-red-100 rounded-full text-red-500">
                    <Trash2 size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-lg text-red-500">危险区域</h3>
                    <p className="text-xs text-red-400">抹除所有数据</p>
                 </div>
             </div>

             <button 
                onClick={handleFactoryReset}
                className="w-full py-3 rounded-xl border border-red-200 text-red-500 font-bold hover:bg-red-500 hover:text-white transition-colors active:scale-95"
            >
                恢复出厂设置
            </button>
          </div>
      </div>
    </div>
  );
};

export default ProfileSetup;