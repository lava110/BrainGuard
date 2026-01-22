import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, StopCircle, Volume2, Loader2, RefreshCw, Activity, AudioLines, CheckCircle2, AlertCircle } from 'lucide-react';
import { MetricResult } from '../types';
import { DEMO_TEXT_PROMPT } from '../constants';
import { saveRecord } from '../services/db';
import { speak, stopSpeech } from '../services/ttsService';
import { analyzeSpeechCoherence } from '../services/geminiService';

interface Props {
  onComplete: (data: MetricResult) => void;
  mode?: 'TEST' | 'CALIBRATION';
}

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// --- DSP HELPERS ---

// Downsample and Autocorrelate to find Fundamental Frequency (F0)
// Optimized for performance on mobile devices
const detectPitch = (buffer: Float32Array, sampleRate: number): { pitch: number, clarity: number } => {
    // 1. RMS Threshold (Silence Check)
    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
    const rms = Math.sqrt(sumSq / buffer.length);
    if (rms < 0.02) return { pitch: 0, clarity: 0 }; // Too quiet

    // 2. Downsample (48k/44k -> ~11k) to speed up correlation
    // Skip factor 4
    const downsampleRate = 4;
    const dsLen = Math.floor(buffer.length / downsampleRate);
    const dsBuffer = new Float32Array(dsLen);
    for (let i = 0; i < dsLen; i++) {
        dsBuffer[i] = buffer[i * downsampleRate];
    }
    const dsSampleRate = sampleRate / downsampleRate;

    // 3. Autocorrelation
    // Human voice range: 60Hz - 400Hz
    // Lag in samples = SampleRate / Frequency
    const minLag = Math.floor(dsSampleRate / 400); 
    const maxLag = Math.floor(dsSampleRate / 60);

    let maxCorr = -1;
    let bestLag = -1;

    for (let lag = minLag; lag <= maxLag; lag++) {
        let sum = 0;
        // Calculate correlation for this lag
        for (let i = 0; i < dsLen - lag; i++) {
            sum += dsBuffer[i] * dsBuffer[i + lag];
        }
        // Normalize (simplification: simple peak picking works well for single vowel)
        if (sum > maxCorr) {
            maxCorr = sum;
            bestLag = lag;
        }
    }

    // 4. Clarity check (normalized correlation would be better, but heuristic works for 'Ah')
    // If bestLag is found, return pitch
    if (bestLag > 0 && maxCorr > 0.5) { // Arbitrary threshold for "tone-like" signal
         return { pitch: dsSampleRate / bestLag, clarity: maxCorr };
    }

    return { pitch: 0, clarity: 0 };
};


// --- COMPONENT: VOWEL TEST (AHHH) ---
const VowelTest = ({ onFinish }: { onFinish: (score: number, issues: string[]) => void }) => {
    const [status, setStatus] = useState<'IDLE' | 'LISTENING' | 'RECORDING' | 'ANALYZING'>('IDLE');
    const [timeLeft, setTimeLeft] = useState(0);
    const [feedback, setFeedback] = useState("点击麦克风，深吸气，发“啊——”声");
    
    // Data Collection
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const requestRef = useRef<number>(0);
    const streamRef = useRef<MediaStream | null>(null);
    const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    const pitchDataRef = useRef<number[]>([]);
    const ampDataRef = useRef<number[]>([]);
    const recordingStartTimeRef = useRef<number>(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Using a ref to track status inside the animation frame loop to avoid closure staleness
    const statusRef = useRef(status);
    useEffect(() => { statusRef.current = status; }, [status]);

    useEffect(() => {
        speak("声音检测第一步：声带稳定性。请深吸一口气，持续发“啊”的声音，保持3秒。", true);
        return () => {
            stopAudio();
        };
    }, []);

    const stopAudio = () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        if (audioContextRef.current) audioContextRef.current.close();
        if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current);
    };

    const startTest = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            
            const source = audioContextRef.current.createMediaStreamSource(stream);
            const analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            analyserRef.current = analyser;

            setStatus('LISTENING');
            setFeedback("请开始发声...");
            
            // Timeout logic: Reset if no sound after 10s
            listeningTimeoutRef.current = setTimeout(() => {
                if (statusRef.current === 'LISTENING') {
                    stopAudio();
                    setStatus('IDLE');
                    setFeedback("未检测到声音，请检查权限或大声一点");
                }
            }, 10000);

            visualizeAndAnalyze();
        } catch (e) {
            console.error(e);
            setFeedback("无法访问麦克风");
        }
    };

    const visualizeAndAnalyze = () => {
        if (!analyserRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const bufferLength = analyserRef.current.fftSize;
        const timeData = new Float32Array(bufferLength);
        
        const draw = () => {
            requestRef.current = requestAnimationFrame(draw);
            analyserRef.current!.getFloatTimeDomainData(timeData);

            // 1. Draw Waveform
            ctx.fillStyle = '#F9F7F2'; // warm-50
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#6C8BAB'; // voice color
            ctx.beginPath();
            
            const sliceWidth = canvas.width / bufferLength;
            let x = 0;
            let sumSq = 0;

            for(let i = 0; i < bufferLength; i++) {
                const v = timeData[i] * 200 + canvas.height/2; // Scale for viz
                const y = v;
                if(i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceWidth;
                sumSq += timeData[i] * timeData[i];
            }
            ctx.stroke();

            // 2. Real-time Analysis Logic
            const rms = Math.sqrt(sumSq / bufferLength);
            const currentStatus = statusRef.current;
            
            // Auto-trigger recording if loud enough
            // Lowered threshold to 0.03 for better sensitivity
            if (currentStatus === 'LISTENING' && rms > 0.03) {
                if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current);
                setStatus('RECORDING');
                setFeedback("检测到声音，请保持...");
                recordingStartTimeRef.current = Date.now();
                pitchDataRef.current = [];
                ampDataRef.current = [];
            }

            if (currentStatus === 'RECORDING') {
                const elapsed = (Date.now() - recordingStartTimeRef.current) / 1000;
                const remaining = Math.max(0, 3 - elapsed);
                setTimeLeft(remaining);

                // Collect Data
                if (audioContextRef.current) {
                    const { pitch } = detectPitch(timeData, audioContextRef.current.sampleRate);
                    if (pitch > 0) {
                        pitchDataRef.current.push(pitch);
                        ampDataRef.current.push(rms);
                    }
                }

                if (remaining <= 0) {
                    finishRecording();
                }
            }
        };
        draw();
    };

    const finishRecording = () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        setStatus('ANALYZING');
        
        // Analyze Jitter & Shimmer
        const pitches = pitchDataRef.current;
        const amps = ampDataRef.current;

        // Lowered minimum data points requirement from 30 to 15
        if (pitches.length < 15) {
            setFeedback("声音太短，请重试");
            setTimeout(() => {
                stopAudio();
                setStatus('IDLE');
                // Don't auto-restart, let user click again
            }, 1500);
            return;
        }

        // Calculation
        let jitterSum = 0;
        let pitchSum = 0;
        for (let i = 1; i < pitches.length; i++) {
            jitterSum += Math.abs(pitches[i] - pitches[i-1]);
            pitchSum += pitches[i];
        }
        const avgPitch = pitchSum / pitches.length;
        const jitter = (jitterSum / (pitches.length - 1)) / avgPitch; // Relative Jitter

        let shimmerSum = 0;
        let ampSum = 0;
        for (let i = 1; i < amps.length; i++) {
            shimmerSum += Math.abs(amps[i] - amps[i-1]);
            ampSum += amps[i];
        }
        const avgAmp = ampSum / amps.length;
        const shimmer = (shimmerSum / (amps.length - 1)) / avgAmp; // Relative Shimmer

        console.log("Jitter:", jitter, "Shimmer:", shimmer);

        // Scoring (Medical Lite thresholds)
        // Healthy Jitter < 1% (0.01), Shimmer < 4% (0.04)
        // Poor Jitter > 2.5%, Shimmer > 10%
        
        let score = 100;
        const issues: string[] = [];

        if (jitter > 0.025) {
            score -= 30;
            issues.push("声调抖动");
        } else if (jitter > 0.015) {
            score -= 10;
        }

        if (shimmer > 0.1) {
            score -= 30;
            issues.push("气息不稳");
        } else if (shimmer > 0.06) {
            score -= 10;
        }

        score = Math.max(0, score);
        onFinish(score, issues);
    };

    const handleManualStop = () => {
        if (status === 'LISTENING') {
            stopAudio();
            setStatus('IDLE');
            setFeedback("已取消");
        } else if (status === 'RECORDING') {
            finishRecording();
        }
    };

    return (
        <div className="flex flex-col items-center justify-center w-full h-full p-6">
            <h2 className="text-2xl font-bold text-warm-900 mb-2">声带稳定性</h2>
            <p className="text-warm-500 mb-8 text-center">{feedback}</p>
            
            <div className="relative w-full h-40 bg-white rounded-2xl shadow-inner border border-warm-200 overflow-hidden mb-8">
                 <canvas ref={canvasRef} className="w-full h-full" width={300} height={160} />
                 
                 {status === 'RECORDING' && (
                     <div className="absolute bottom-0 left-0 h-1 bg-voice transition-all duration-100 ease-linear"
                          style={{ width: `${((3 - timeLeft) / 3) * 100}%` }}
                     />
                 )}
            </div>

            {status === 'IDLE' && (
                <button onClick={startTest} className="w-20 h-20 rounded-full bg-voice text-white flex items-center justify-center shadow-lg active:scale-95">
                    <Mic size={32} />
                </button>
            )}

            {(status === 'LISTENING' || status === 'RECORDING') && (
                <button onClick={handleManualStop} className="w-20 h-20 rounded-full bg-warm-200 text-warm-600 flex items-center justify-center shadow-lg active:scale-95 animate-in fade-in zoom-in">
                    <StopCircle size={32} />
                </button>
            )}
             
            {status === 'ANALYZING' && <Loader2 className="animate-spin text-voice" size={32} />}
        </div>
    );
};


// --- COMPONENT: READING TEST (Original Logic) ---
const ReadingTest = ({ onFinish }: { onFinish: (score: number, transcript: string) => void }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Logic Refs
    const recognitionRef = useRef<any>(null);
    const silenceTimerRef = useRef<any>(null);
    const lastActivityRef = useRef<number>(0);

    useEffect(() => {
        speak("第二步：朗读测试。请大声朗读屏幕上的文字。", true);
        return () => {
            if (recognitionRef.current) recognitionRef.current.stop();
            clearTimeout(silenceTimerRef.current);
        };
    }, []);

    const startRecording = () => {
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.lang = 'zh-CN';
            recognition.continuous = true;
            recognition.interimResults = true;
            
            recognition.onresult = (event: any) => {
                let t = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) t += event.results[i][0].transcript;
                if (t) {
                    setTranscript(t);
                    lastActivityRef.current = Date.now();
                }
            };

            recognition.onerror = (e: any) => console.warn(e);
            recognition.start();
            recognitionRef.current = recognition;
            setIsRecording(true);
            lastActivityRef.current = Date.now();

            // Silence Check Loop
            silenceTimerRef.current = setInterval(() => {
                if (Date.now() - lastActivityRef.current > 2500 && transcript.length > 2) {
                    stopRecording();
                }
            }, 500);
        } else {
            alert("浏览器不支持语音识别");
        }
    };

    const stopRecording = () => {
        if (!isRecording) return;
        setIsRecording(false);
        if (recognitionRef.current) recognitionRef.current.stop();
        clearInterval(silenceTimerRef.current);
        
        setIsProcessing(true);
        processResult();
    };

    const processResult = async () => {
        // Calculate basic acoustic score based on pace
        // Wait a bit for state to settle
        const text = transcript; // capture current
        const duration = (Date.now() - lastActivityRef.current + 2500) / 1000; // Rough duration estimate logic needs refinement but okay for now
        
        // Semantic Analysis
        const cleanPrompt = DEMO_TEXT_PROMPT.replace(/[^\u4e00-\u9fa5]/g, ""); 
        const cleanTranscript = text.replace(/[^\u4e00-\u9fa5]/g, "");
        
        const aiResult = await analyzeSpeechCoherence(cleanTranscript, cleanPrompt);
        onFinish(aiResult.score, text);
    };

    return (
        <div className="flex flex-col items-center justify-between w-full h-full p-6 pb-20">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-warm-200 text-center w-full mb-8">
                 <p className="text-2xl font-bold text-warm-900 leading-relaxed">{DEMO_TEXT_PROMPT}</p>
            </div>

            {transcript && (
                 <div className="w-full p-4 bg-voice-light/30 rounded-xl mb-4 text-center text-voice-dark font-medium">
                     "{transcript}"
                 </div>
            )}

            {!isRecording && !isProcessing && (
                <button onClick={startRecording} className="w-full py-4 bg-voice text-white rounded-xl text-xl font-bold shadow-lg flex items-center justify-center gap-2">
                    <Mic /> 开始朗读
                </button>
            )}

            {isRecording && (
                <div className="flex flex-col items-center gap-4">
                     <div className="flex items-center gap-2 text-voice animate-pulse">
                         <Activity /> 正在聆听...
                     </div>
                     <button onClick={stopRecording} className="px-8 py-3 border-2 border-voice text-voice rounded-full font-bold">
                         完成
                     </button>
                </div>
            )}

            {isProcessing && <Loader2 className="animate-spin text-voice" size={32} />}
        </div>
    );
};


// --- MAIN MODULE ORCHESTRATOR ---
const VoiceModule: React.FC<Props> = ({ onComplete, mode = 'TEST' }) => {
    const [step, setStep] = useState<'INTRO' | 'VOWEL' | 'READING' | 'DONE'>('INTRO');
    const [vowelResult, setVowelResult] = useState<{score: number, issues: string[]}>({ score: 0, issues: [] });

    useEffect(() => {
        if (step === 'INTRO') {
            const t = setTimeout(() => speak(mode === 'CALIBRATION' ? "语音检测。包含声带稳定性和朗读测试。" : "开始语音检测。", true), 500);
            return () => clearTimeout(t);
        }
    }, [step]);

    const handleVowelFinish = (score: number, issues: string[]) => {
        setVowelResult({ score, issues });
        speak("很好。下一步，朗读测试。", true);
        setTimeout(() => setStep('READING'), 1000);
    };

    const handleReadingFinish = async (readingScore: number, transcript: string) => {
        setStep('DONE');
        
        // Final Score Calculation
        // Vowel Test (Motor Control) accounts for 40%
        // Reading Test (Cognition & Articulation) accounts for 60%
        // BUT: If Vowel Test detects severe Jitter (score < 60), the total score is capped.
        
        let totalScore = Math.floor(vowelResult.score * 0.4 + readingScore * 0.6);
        
        if (vowelResult.issues.length > 0) {
            totalScore = Math.min(totalScore, 65); // Cap score if physiological issues detected
        }
        
        let details = "";
        if (mode === 'CALIBRATION') {
             onComplete({ score: 100, details: "基准已录入。", timestamp: Date.now() });
             return;
        }

        const issues = [...vowelResult.issues];
        if (readingScore < 70) issues.push("语义逻辑不清");

        if (issues.length > 0) {
            details = `检测到潜在问题：${issues.join("、")}。请留意说话是否费力。`;
        } else if (totalScore < 85) {
            details = "声音状态一般，建议多喝水休息。";
        } else {
            details = "您的声音洪亮，逻辑清晰，状态很好！";
        }

        await saveRecord({ type: 'AUDIO', score: totalScore, details, timestamp: Date.now() });
        setTimeout(() => onComplete({ score: totalScore, details, timestamp: Date.now() }), 1000);
    };

    if (step === 'INTRO') return (
        <div className="flex flex-col items-center justify-center w-full h-full p-6 text-center">
            <div className="w-24 h-24 bg-voice-light rounded-full flex items-center justify-center mb-8">
                <AudioLines className="text-voice" size={48} />
            </div>
            <h1 className="text-3xl font-bold text-warm-900 mb-4">声音检测</h1>
            <p className="text-warm-500 mb-10 text-xl">包含：发声稳定性 + 朗读测试</p>
            <button onClick={() => setStep('VOWEL')} className="w-full max-w-xs py-5 bg-voice text-white text-2xl font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2">
                开始
            </button>
        </div>
    );

    if (step === 'DONE') return <div className="flex flex-col items-center justify-center h-full"><Loader2 className="animate-spin text-voice" size={64} /></div>;

    return (
        <div className="w-full h-full pt-10 bg-warm-50">
            {step === 'VOWEL' ? <VowelTest onFinish={handleVowelFinish} /> : <ReadingTest onFinish={handleReadingFinish} />}
        </div>
    );
};

export default VoiceModule;