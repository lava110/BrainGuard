import React, { useState } from 'react';
import { ModuleType, MetricResult } from '../types';
import MirrorModule from './MirrorModule';
import VoiceModule from './VoiceModule';
import TouchModule from './TouchModule';
import { saveBaseline } from '../services/db';
import { CheckCircle2, ChevronRight, Scale } from 'lucide-react';

interface Props {
  onFinish: () => void;
}

type Step = 'INTRO' | 'MIRROR' | 'VOICE' | 'TOUCH' | 'DONE';

const CalibrationWizard: React.FC<Props> = ({ onFinish }) => {
  const [step, setStep] = useState<Step>('INTRO');
  
  const handleNext = (data?: MetricResult, type?: 'visual' | 'audio' | 'touch') => {
    if (data && type) {
        if (data.raw) {
            saveBaseline({ [type]: data.raw });
        }
    }

    if (step === 'INTRO') setStep('MIRROR');
    else if (step === 'MIRROR') setStep('VOICE');
    else if (step === 'VOICE') setStep('TOUCH');
    else if (step === 'TOUCH') setStep('DONE');
  };

  if (step === 'INTRO') {
    return (
        <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-warm-50">
            <div className="w-24 h-24 bg-white border-2 border-face rounded-full flex items-center justify-center mb-6 shadow-sm">
                <Scale className="text-face" size={48} />
            </div>
            <h1 className="text-3xl font-bold text-warm-900 mb-4">首次校准</h1>
            <p className="text-warm-500 mb-10 text-xl leading-relaxed">
                为了测得更准，我们需要记录您平时的健康状态。
            </p>
            <button 
                onClick={() => setStep('MIRROR')}
                className="w-full max-w-sm py-5 bg-face hover:bg-face-dark text-white text-xl font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg"
            >
                开始校准 <ChevronRight size={24} />
            </button>
        </div>
    );
  }

  if (step === 'DONE') {
     return (
        <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-warm-50">
            <CheckCircle2 className="text-status-ok mb-6" size={80} />
            <h1 className="text-3xl font-bold text-warm-900 mb-4">设置完成</h1>
            <p className="text-warm-500 mb-10 text-xl">
                基准线已建立，您可以开始日常检测了。
            </p>
            <button 
                onClick={onFinish}
                className="w-full max-w-sm py-5 bg-status-ok hover:bg-face-dark text-white text-xl font-bold rounded-2xl shadow-lg"
            >
                进入首页
            </button>
        </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-warm-50">
        <div className="h-2 w-full bg-warm-200 flex">
            <div className={`h-full bg-face transition-all duration-500 ${step === 'MIRROR' ? 'w-1/3' : step === 'VOICE' ? 'w-2/3' : 'w-full'}`} />
        </div>

        <div className="flex-1 relative">
            {step === 'MIRROR' && <MirrorModule mode="CALIBRATION" onComplete={(data) => handleNext(data, 'visual')} />}
            {step === 'VOICE' && <VoiceModule mode="CALIBRATION" onComplete={(data) => handleNext(data, 'audio')} />}
            {step === 'TOUCH' && <TouchModule mode="CALIBRATION" onComplete={(data) => handleNext(data, 'touch')} />}
        </div>
    </div>
  );
};

export default CalibrationWizard;