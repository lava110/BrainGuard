import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, Hand, RotateCcw, Activity, Waves, PenTool, AlertCircle } from 'lucide-react';
import { MetricResult } from '../types';
import { saveRecord } from '../services/db';
import { speak } from '../services/ttsService';

interface Props {
  onComplete: (data: MetricResult) => void;
  mode?: 'TEST' | 'CALIBRATION';
}

const playTone = (freq: number) => {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
    osc.stop(ctx.currentTime + 0.1);
};

// --- NEW ALGORITHM: Spiral Drawing Test for Ataxia ---
const SpiralTest = ({ onFinish }: { onFinish: (score: number) => void }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [guideMsg, setGuideMsg] = useState("请按住中心圆点开始");
    
    // Config
    const CENTER = { x: 0, y: 0 }; // Will be set on mount
    const MAX_RADIUS = 140;
    const START_ZONE_RADIUS = 35; // Must start within this radius
    const LOOPS = 3;
    const B_COEFF = MAX_RADIUS / (2 * Math.PI * LOOPS);

    const pointsRef = useRef<{x: number, y: number}[]>([]);
    const errorsRef = useRef<number[]>([]);

    useEffect(() => {
        const t = setTimeout(() => {
            speak("请用食指按住中心圆点，不抬手，沿着线画到最外面。", true);
        }, 500);
        initCanvas();
        
        // Handle resize
        window.addEventListener('resize', initCanvas);
        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', initCanvas);
        };
    }, []);

    const initCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        // High DPI setup
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        
        CENTER.x = rect.width / 2;
        CENTER.y = rect.height / 2;

        drawBaseSpiral(ctx, rect.width, rect.height, false);
    };

    const drawBaseSpiral = (ctx: CanvasRenderingContext2D, w: number, h: number, isActive: boolean) => {
        ctx.clearRect(0, 0, w, h);
        
        // 1. Draw Ideal Spiral (Guide)
        ctx.beginPath();
        ctx.strokeStyle = '#E6DCCF'; // warm-200
        ctx.lineWidth = 20; // Thick guide
        ctx.lineCap = 'round';

        // Draw from center out
        for (let theta = 0; theta <= 2 * Math.PI * LOOPS; theta += 0.05) {
            const r = B_COEFF * theta;
            const x = CENTER.x + r * Math.cos(theta);
            const y = CENTER.y + r * Math.sin(theta);
            if (theta === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 2. Start Point Indicator (Center)
        ctx.beginPath();
        // If active, solid color; if idle, pulsating effect in CSS handled via re-renders? 
        // We'll stick to simple canvas drawing here.
        ctx.fillStyle = isActive ? '#D68C68' : '#D68C68'; 
        ctx.arc(CENTER.x, CENTER.y, 16, 0, Math.PI * 2);
        ctx.fill();

        // Start Zone Ring (Visual Hint)
        if (!isActive) {
            ctx.beginPath();
            ctx.strokeStyle = '#D68C68';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.arc(CENTER.x, CENTER.y, START_ZONE_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 3. Draw User Path
        if (pointsRef.current.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#D68C68'; // touch color
            ctx.lineWidth = 8;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            
            pointsRef.current.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.stroke();
        }
    };

    // ALGORITHM: Calculate Radial Deviation
    const calculateError = (x: number, y: number) => {
        const dx = x - CENTER.x;
        const dy = y - CENTER.y;
        const rUser = Math.sqrt(dx * dx + dy * dy);
        let thetaUser = Math.atan2(dy, dx); 
        
        if (thetaUser < 0) thetaUser += 2 * Math.PI;

        let minDiff = 999;
        
        for (let n = 0; n <= LOOPS; n++) {
            const angleCandidate = thetaUser + (n * 2 * Math.PI);
            if (angleCandidate > 2 * Math.PI * LOOPS + 0.5) continue;

            const rIdeal = B_COEFF * angleCandidate;
            const diff = Math.abs(rUser - rIdeal);
            
            if (diff < minDiff) minDiff = diff;
        }
        return minDiff;
    };

    const getCoordinates = (e: React.TouchEvent | React.MouseEvent, rect: DOMRect) => {
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
        e.preventDefault(); 
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const { x, y } = getCoordinates(e, rect);

        // FIX: Enforce Start Zone
        const distFromCenter = Math.sqrt(Math.pow(x - CENTER.x, 2) + Math.pow(y - CENTER.y, 2));
        
        if (distFromCenter > START_ZONE_RADIUS) {
            setGuideMsg("请从中心圆点开始！");
            // Optional: Haptic feedback if available
            if (navigator.vibrate) navigator.vibrate(200);
            return;
        }

        setIsDrawing(true);
        setGuideMsg("保持按住，画出来...");
        pointsRef.current = [{x, y}];
        errorsRef.current = [];
        playTone(440);

        // Redraw to show active state
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const dpr = window.devicePixelRatio || 1;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0); 
            drawBaseSpiral(ctx, rect.width, rect.height, true);
        }
    };

    const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!isDrawing) return;
        e.preventDefault();

        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const { x, y } = getCoordinates(e, rect);

        pointsRef.current.push({ x, y });
        errorsRef.current.push(calculateError(x, y));

        const distFromCenter = Math.sqrt(Math.pow(x - CENTER.x, 2) + Math.pow(y - CENTER.y, 2));
        const currentProg = Math.min(100, (distFromCenter / MAX_RADIUS) * 100);
        setProgress(currentProg);

        const ctx = canvas.getContext('2d');
        if (ctx) {
            const dpr = window.devicePixelRatio || 1;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0); 
            drawBaseSpiral(ctx, rect.width, rect.height, true);
        }

        if (distFromCenter >= MAX_RADIUS - 10) {
            finishTest();
        }
    };

    const handleEnd = () => {
        if (isDrawing) {
            setIsDrawing(false);
            setGuideMsg("请不要中途抬手，重新从中心开始。");
            pointsRef.current = [];
            errorsRef.current = [];
            setProgress(0);
            
            // Redraw reset state
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const dpr = window.devicePixelRatio || 1;
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); 
                    drawBaseSpiral(ctx, rect.width, rect.height, false);
                }
            }
        }
    };

    const finishTest = () => {
        setIsDrawing(false);
        playTone(880);
        
        if (errorsRef.current.length === 0) return;

        // RMSE Calculation
        const sumSquares = errorsRef.current.reduce((a, b) => a + (b * b), 0);
        const rmse = Math.sqrt(sumSquares / errorsRef.current.length);
        
        // Scoring Logic
        // RMSE < 15 is excellent. RMSE > 50 is bad.
        let score = Math.max(0, 100 - (rmse * 2));
        
        // Speed/Data Penalty: If points are too few, they moved inhumanly fast (or cheated/glitched)
        if (pointsRef.current.length < 30) score = Math.min(score, 40);

        onFinish(Math.floor(score));
    };

    return (
        <div className="flex flex-col items-center justify-start w-full h-full pt-4 px-4 overflow-hidden">
             <div className="text-center mb-4">
                <h2 className="text-2xl font-bold text-warm-900">协调性测试</h2>
                <div className={`mt-2 flex items-center justify-center gap-2 text-sm font-bold transition-colors duration-300 ${isDrawing ? 'text-touch' : 'text-warm-500'}`}>
                    {guideMsg === "请从中心圆点开始！" ? <AlertCircle size={16} className="text-status-danger" /> : null}
                    <span className={guideMsg === "请从中心圆点开始！" ? "text-status-danger animate-pulse" : ""}>{guideMsg}</span>
                </div>
            </div>

            <div className="relative select-none touch-none">
                <canvas 
                    ref={canvasRef}
                    className="w-[340px] h-[340px] bg-white rounded-full shadow-lg border-4 border-warm-100 touch-none cursor-crosshair"
                    onTouchStart={handleStart}
                    onTouchMove={handleMove}
                    onTouchEnd={handleEnd}
                    onMouseDown={handleStart}
                    onMouseMove={handleMove}
                    onMouseUp={handleEnd}
                    onMouseLeave={handleEnd}
                />
            </div>
            
            <p className="mt-6 text-xs text-warm-400 max-w-xs text-center">
                如果线条过于抖动或偏离轨道，系统将记录异常。
            </p>
        </div>
    );
};

// Enhanced Stability Test: Drift + Tremor
const StabilityTest = ({ onFinish }: { onFinish: (score: number, issues: string[]) => void }) => {
    const [status, setStatus] = useState<'IDLE' | 'PREP' | 'TESTING'>('IDLE');
    const [countdown, setCountdown] = useState(5); 
    
    // Drift (Orientation) Refs
    const maxDrift = useRef<number>(0);
    const initialBeta = useRef<number | null>(null);

    // Tremor (Motion) Refs
    const accData = useRef<number[]>([]);
    
    useEffect(() => {
        let timer: NodeJS.Timeout;

        if (status === 'PREP') {
            if (countdown > 0) {
                timer = setTimeout(() => setCountdown(c => c - 1), 1000);
            } else {
                startMeasurement();
            }
        } else if (status === 'TESTING') {
            if (countdown > 0) {
                timer = setTimeout(() => {
                    setCountdown(c => c - 1);
                    playTone(440); 
                }, 1000);
            } else {
                finishMeasurement();
            }
        }
        return () => clearTimeout(timer);
    }, [status, countdown]);

    const handleStartClick = async () => {
        if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
            try {
                await (DeviceMotionEvent as any).requestPermission();
                await (DeviceOrientationEvent as any).requestPermission();
            } catch (e) {
                console.error(e);
            }
        }
        
        speak("请调整坐姿，单手平举手机。5秒后开始。", true);
        setStatus('PREP');
        setCountdown(5);
    };

    const startMeasurement = () => {
        playTone(880);
        speak("请闭眼，保持不动。", true);
        
        // Reset Data
        maxDrift.current = 0;
        initialBeta.current = null;
        accData.current = [];
        
        setStatus('TESTING');
        setCountdown(10);
        window.addEventListener('deviceorientation', handleOrientation);
        window.addEventListener('devicemotion', handleMotion);
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
        if (event.beta === null) return;
        if (initialBeta.current === null) initialBeta.current = event.beta;
        const delta = Math.abs(event.beta - initialBeta.current);
        if (delta > maxDrift.current) maxDrift.current = delta;
    };

    const handleMotion = (event: DeviceMotionEvent) => {
        // ALGORITHM UPDATE: Prefer 'acceleration' (gravity removed via software/hardware gyroscope fusion).
        // Only fallback to 'accelerationIncludingGravity' if standard acc is unavailable.
        let x = event.acceleration?.x;
        let y = event.acceleration?.y;
        let z = event.acceleration?.z;

        if (x === null || x === undefined) {
             // Fallback for cheap sensors: use includingGravity but we need to subtract static gravity later or use variance
             x = event.accelerationIncludingGravity?.x || 0;
             y = event.accelerationIncludingGravity?.y || 0;
             z = event.accelerationIncludingGravity?.z || 0;
        }

        // Calculate Magnitude vector
        const mag = Math.sqrt(x*x + y*y + z*z);
        accData.current.push(mag);
    };

    const analyzeTremor = (magnitudes: number[]) => {
        if (magnitudes.length < 10) return { detected: false, intensity: 0 };

        // 1. High-Pass Filter Simulation (Remove DC Offset/Gravity/Drift)
        const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
        // Signal with gravity/mean removed
        const acSignal = magnitudes.map(m => m - mean);

        // 2. Calculate Intensity (RMS)
        // Normal physiological tremor is usually very low (< 0.05 m/s^2 on phone sensors after filter).
        // Parkinsonian tremor is stronger.
        const variance = acSignal.reduce((a, b) => a + (b * b), 0) / magnitudes.length;
        const rms = Math.sqrt(variance);

        // 3. Frequency Analysis (Zero-Crossing Rate)
        // Helps distinguish between slow intentional movement (0-2Hz) and tremor (3-7Hz)
        let crossings = 0;
        for (let i = 1; i < acSignal.length; i++) {
            if ((acSignal[i] >= 0 && acSignal[i-1] < 0) || (acSignal[i] < 0 && acSignal[i-1] >= 0)) {
                crossings++;
            }
        }
        
        // Duration is fixed at 10s
        const frequency = crossings / (2 * 10);

        // Criteria Update for "Medical Lite" accuracy:
        // 1. Frequency must be in the pathological range (3-12Hz).
        // 2. Intensity must be above noise floor (0.2 m/s^2).
        const isTremorFreq = frequency >= 3 && frequency <= 12;
        const isSignificant = rms > 0.2; 

        return {
            detected: isTremorFreq && isSignificant,
            intensity: rms,
            frequency: frequency
        };
    };

    const finishMeasurement = () => {
        window.removeEventListener('deviceorientation', handleOrientation);
        window.removeEventListener('devicemotion', handleMotion);
        playTone(880); 
        speak("检测结束，手可以放下了。", true);
        
        // 1. Analyze Drift
        const driftAngle = maxDrift.current;
        const isDrifting = driftAngle > 15;
        let driftScore = Math.max(0, 100 - (driftAngle * 2));

        // 2. Analyze Tremor
        const tremor = analyzeTremor(accData.current);
        let tremorPenalty = 0;
        if (tremor.detected) {
            // Heavier penalty for confirmed tremor frequency
            tremorPenalty = Math.min(50, tremor.intensity * 80); 
        }

        const finalScore = Math.max(0, Math.floor(driftScore - tremorPenalty));
        
        const issues: string[] = [];
        if (isDrifting) issues.push("手臂下沉");
        if (tremor.detected) issues.push("静止性震颤");

        onFinish(finalScore, issues);
    };

    return (
        <div className="flex flex-col items-center justify-center w-full h-full pb-20 text-center px-6">
            <h2 className="text-3xl font-bold text-warm-900 mb-2">手臂稳定性</h2>
            <p className="text-warm-500 mb-6">同时检测手臂下沉与异常震颤</p>
            
            {status === 'IDLE' ? (
                <>
                    <div className="bg-white p-6 rounded-[2rem] border-4 border-dashed border-touch-light mb-8 shadow-sm relative">
                        <Smartphone size={100} className="text-touch mx-auto mb-4" />
                        <Waves className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-touch/20 scale-150 animate-pulse" size={120} />
                        <p className="text-xl text-warm-800 font-bold leading-relaxed">
                            请像医生检查一样<br/>单手平举手机
                        </p>
                    </div>
                    <button 
                        onClick={handleStartClick} 
                        className="w-full max-w-xs py-5 bg-touch hover:bg-touch-dark active:scale-95 transition-all text-white text-2xl font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2"
                    >
                        准备好了
                    </button>
                </>
            ) : (
                <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                    <div className={`
                        w-56 h-56 rounded-full flex flex-col items-center justify-center mb-8 shadow-inner border-8 relative overflow-hidden
                        ${status === 'PREP' ? 'bg-warm-100 border-warm-200 text-warm-500' : 'bg-touch-light border-touch text-touch-dark'}
                    `}>
                        <span className="text-2xl font-bold mb-2 relative z-10">
                            {status === 'PREP' ? '准备中' : '保持不动'}
                        </span>
                        <span className="text-8xl font-bold font-mono tracking-tighter relative z-10">
                            {countdown}
                        </span>
                        
                        {/* Visualization of Tremor Scan */}
                        {status === 'TESTING' && (
                             <div className="absolute inset-0 opacity-20 flex items-center justify-center">
                                 <div className="w-full h-1 bg-touch animate-ping"></div>
                                 <div className="w-1 h-full bg-touch animate-ping delay-75"></div>
                             </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-2 text-warm-500 bg-white/50 px-4 py-2 rounded-full">
                        {status === 'PREP' ? (
                            <>
                                <Activity className="animate-pulse" />
                                <span>正在调整姿势...</span>
                            </>
                        ) : (
                            <>
                                <Waves className="animate-pulse" />
                                <span>正在分析震颤频谱...</span>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const TouchModule: React.FC<Props> = ({ onComplete, mode = 'TEST' }) => {
  const [step, setStep] = useState<'INTRO' | 'SPIRAL' | 'STABILITY' | 'DONE'>('INTRO');
  const [coordinationScore, setCoordinationScore] = useState(0);

  useEffect(() => {
    if (step === 'INTRO') {
        const t = setTimeout(() => speak(mode === 'CALIBRATION' ? "肢体校准。包含协调性和稳定性测试。" : "现在开始肢体检测。", true), 500);
        return () => clearTimeout(t);
    }
  }, [step]);

  const handleSpiralFinish = (score: number) => {
      setCoordinationScore(score);
      speak("画得不错。下一项，检测手臂稳定性。", true);
      setTimeout(() => setStep('STABILITY'), 1500);
  };

  const handleStabilityFinish = (stabilityScore: number, issues: string[]) => {
      analyze(stabilityScore, issues);
  };

  const analyze = async (stabilityScore: number, issues: string[]) => {
      setStep('DONE');
      // Weighted score: 50% Coordination (Spiral), 50% Stability (Tremor/Drift)
      let totalScore = Math.floor((coordinationScore * 0.5) + (stabilityScore * 0.5));
      
      // Critical Path: If Tremor is detected, the score MUST reflect this risk regardless of spiral accuracy.
      if (issues.includes("静止性震颤")) {
          totalScore = Math.min(totalScore, 59);
      }
      
      let details = "肢体功能正常。";
      if (mode === 'CALIBRATION') {
          onComplete({ score: 100, details: "基准已录入。", timestamp: Date.now() });
          return;
      }

      if (issues.length > 0) {
          details = `检测到异常：${issues.join("、")}。请密切关注。`;
      } else if (coordinationScore < 60) {
          details = "手部协调性稍差，建议多做手指精细活动。";
      }

      await saveRecord({ type: 'TOUCH', score: totalScore, details, timestamp: Date.now() });
      setTimeout(() => onComplete({ score: totalScore, details, timestamp: Date.now() }), 1000);
  };

  if (step === 'DONE') return <div className="flex flex-col items-center justify-center h-full"><RotateCcw className="animate-spin text-touch" size={64} /></div>;

  if (step === 'INTRO') return (
    <div className="flex flex-col items-center justify-center w-full h-full p-6 text-center">
        <div className="w-24 h-24 bg-touch-light rounded-full flex items-center justify-center mb-8">
            <Hand className="text-touch" size={48} />
        </div>
        <h1 className="text-3xl font-bold text-warm-900 mb-4">肢体检测</h1>
        <p className="text-warm-500 mb-10 text-xl">包含：螺旋线描画 + 手臂平举</p>
        <button onClick={() => setStep('SPIRAL')} className="w-full max-w-xs py-5 bg-touch text-white text-2xl font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2">
            <PenTool size={24} />
            开始
        </button>
    </div>
  );

  return (
    <div className="w-full h-full pt-10 bg-warm-50">
      {step === 'SPIRAL' ? <SpiralTest onFinish={handleSpiralFinish} /> : <StabilityTest onFinish={handleStabilityFinish} />}
    </div>
  );
};

export default TouchModule;