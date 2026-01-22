import React, { useState, useEffect } from 'react';
import { Download, Share, X, ShieldCheck } from 'lucide-react';

const InstallPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Detect iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // Check if already in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    if (isStandalone) {
        return; // Already installed
    }

    // Android/Desktop install event
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show prompt after a small delay to not annoy immediately
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS, show prompt anyway after delay if not standalone
    if (isIosDevice) {
        setTimeout(() => setShowPrompt(true), 3000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[100] animate-in slide-in-from-top duration-500">
        <div className="bg-white/95 backdrop-blur border border-warm-200 p-5 rounded-3xl shadow-xl flex flex-col gap-4 relative">
            <button 
                onClick={() => setShowPrompt(false)}
                className="absolute top-3 right-3 text-warm-400 p-2 bg-warm-100 rounded-full hover:bg-warm-200"
            >
                <X size={18} />
            </button>

            <div className="flex items-center gap-4">
                <div className="bg-face-light p-3 rounded-2xl text-face-dark">
                    <Download size={28} />
                </div>
                <div>
                    <h3 className="font-bold text-warm-900 text-lg">安装“脑安健康”</h3>
                    <p className="text-sm text-warm-500">安装到手机桌面，字体更大更清晰</p>
                </div>
            </div>

            {isIOS ? (
                <div className="text-sm text-warm-600 bg-warm-50 p-4 rounded-2xl border border-warm-100 leading-relaxed">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="bg-warm-200 text-warm-800 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold">1</span>
                        <span>点击浏览器底部的</span>
                        <Share size={16} className="text-voice" />
                        <span>分享按钮</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="bg-warm-200 text-warm-800 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold">2</span>
                        <span>往下滑动，选择</span>
                        <span className="font-bold text-warm-900 bg-white border border-warm-200 px-2 py-0.5 rounded-md text-xs shadow-sm">添加到主屏幕</span>
                    </div>
                </div>
            ) : (
                <button 
                    onClick={handleInstallClick}
                    className="w-full py-3 bg-face hover:bg-face-dark active:scale-95 text-white font-bold rounded-xl text-base transition-all shadow-md flex items-center justify-center gap-2"
                >
                    <ShieldCheck size={20} />
                    立即安装
                </button>
            )}
        </div>
    </div>
  );
};

export default InstallPrompt;