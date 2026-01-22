import React, { useState } from 'react';
import { UserHealthState, MetricResult, ModuleType } from './types';
import Navigation from './components/Navigation';
import Dashboard from './components/Dashboard';
import MirrorModule from './components/MirrorModule';
import VoiceModule from './components/VoiceModule';
import TouchModule from './components/TouchModule';
import CalibrationWizard from './components/CalibrationWizard';
import ProfileSetup from './components/ProfileSetup';
import InstallPrompt from './components/InstallPrompt';
import { HeartPulse, Settings } from 'lucide-react';
import { APP_NAME } from './constants';

const App: React.FC = () => {
  const [currentModule, setCurrentModule] = useState<ModuleType>('DASHBOARD');
  
  const [healthState, setHealthState] = useState<UserHealthState>({
    visual: null,
    audio: null,
    touch: null,
  });

  const handleUpdate = (type: keyof UserHealthState, data: MetricResult) => {
    setHealthState(prev => ({ ...prev, [type]: data }));
    setCurrentModule('DASHBOARD');
  };

  const renderContent = () => {
    switch(currentModule) {
      case 'DASHBOARD':
        return <Dashboard data={healthState} onNavigate={(m) => setCurrentModule(m as ModuleType)} />;
      case 'MIRROR':
        return <MirrorModule onComplete={(data) => handleUpdate('visual', data)} />;
      case 'VOICE':
        return <VoiceModule onComplete={(data) => handleUpdate('audio', data)} />;
      case 'TOUCH':
        return <TouchModule onComplete={(data) => handleUpdate('touch', data)} />;
      case 'CALIBRATION':
        return <CalibrationWizard onFinish={() => setCurrentModule('DASHBOARD')} />;
      case 'PROFILE':
        return (
            <ProfileSetup 
                onBack={() => setCurrentModule('DASHBOARD')} 
                onRecalibrate={() => setCurrentModule('CALIBRATION')}
            />
        );
      default:
        return <Dashboard data={healthState} onNavigate={(m) => setCurrentModule(m as ModuleType)} />;
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-warm-50 text-warm-900 flex flex-col font-sans overflow-hidden">
      <InstallPrompt />

      {/* Header */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-warm-200 bg-white/80 backdrop-blur z-10 shrink-0">
        <div className="flex items-center gap-2">
          <HeartPulse size={24} className="text-status-danger" />
          <span className="font-bold text-xl tracking-tight text-warm-900">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-4">
            {currentModule !== 'CALIBRATION' && currentModule !== 'PROFILE' && (
                <button 
                    onClick={() => setCurrentModule('PROFILE')} 
                    className="p-2 bg-warm-100 rounded-full text-warm-800 hover:bg-warm-200 active:scale-95 transition-all"
                >
                    <Settings size={22} />
                </button>
            )}
        </div>
      </div>

      <main className={`flex-1 relative overflow-hidden flex flex-col ${currentModule !== 'CALIBRATION' && currentModule !== 'PROFILE' ? 'pb-24' : ''}`}>
        {renderContent()}
      </main>

      {currentModule !== 'CALIBRATION' && currentModule !== 'PROFILE' && (
        <Navigation currentModule={currentModule} setModule={setCurrentModule} />
      )}
    </div>
  );
};

export default App;