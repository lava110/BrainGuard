import React from 'react';
import { Home, ScanFace, Mic, Hand } from 'lucide-react';
import { ModuleType } from '../types';

interface Props {
  currentModule: ModuleType;
  setModule: (m: ModuleType) => void;
}

const Navigation: React.FC<Props> = ({ currentModule, setModule }) => {
  const navItems = [
    { id: 'DASHBOARD', icon: Home, label: '首页', color: 'text-warm-800' },
    { id: 'MIRROR', icon: ScanFace, label: '面部', color: 'text-face' },
    { id: 'VOICE', icon: Mic, label: '声音', color: 'text-voice' },
    { id: 'TOUCH', icon: Hand, label: '指尖', color: 'text-touch' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-warm-200 pb-safe pt-2 px-4 flex justify-around items-center z-50 h-20 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
      {navItems.map((item) => {
        const isActive = currentModule === item.id;
        // Use specific color if active, otherwise warm grey
        const activeColorClass = item.color; 
        
        return (
            <button
            key={item.id}
            onClick={() => setModule(item.id as ModuleType)}
            className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all duration-300 w-16
                ${isActive ? 'bg-warm-50' : 'hover:bg-warm-50'}
            `}
            >
            <div className={`
                p-2 rounded-2xl transition-all
                ${isActive ? `${activeColorClass.replace('text-', 'bg-')} text-white shadow-md` : 'text-warm-500'}
            `}>
                <item.icon size={26} strokeWidth={2.5} />
            </div>
            <span className={`text-[13px] font-bold ${isActive ? 'text-warm-900' : 'text-warm-400'}`}>
                {item.label}
            </span>
            </button>
        );
      })}
    </div>
  );
};

export default Navigation;