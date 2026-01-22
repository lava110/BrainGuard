import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { MetricResult } from '../types';
import { ScanFace, Loader2, AlertCircle, CheckCircle2, Sun, Moon } from 'lucide-react';
import { saveRecord, getBaseline } from '../services/db';
import { speak, stopSpeech } from '../services/ttsService';

declare global {
  interface Window {
    FaceMesh: any;
    Camera: any;
    drawConnectors: any;
    FACEMESH_TESSELATION: any;
    FACEMESH_RIGHT_EYE: any;
    FACEMESH_LEFT_EYE: any;
    FACEMESH_LIPS: any;
    FACEMESH_FACE_OVAL: any;
    FACEMESH_RIGHT_EYEBROW: any;
    FACEMESH_LEFT_EYEBROW: any;
  }
}

interface Props {
  onComplete: (data: MetricResult) => void;
  mode?: 'TEST' | 'CALIBRATION';
}

const LUMA_THRESHOLD = 40; // 0-255. Below 40 is too dark for reliable analysis.

const MirrorModule: React.FC<Props> = ({ onComplete, mode = 'TEST' }) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  
  // UI State
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  
  // Quality Control State
  const [guidance, setGuidance] = useState<{status: 'OK' | 'WARN' | 'ERROR', msg: string}>({ status: 'ERROR', msg: '正在启动相机...' });
  const [isPoseValid, setIsPoseValid] = useState(false);
  const [lightingStatus, setLightingStatus] = useState<'OK' | 'TOO_DARK'>('OK');

  const [realtimeStats, setRealtimeStats] = useState<{
      eyeSym: number; 
      mouthSym: number; 
      browSym: number;
      yaw: number; // Head rotation detection
  }>({ eyeSym: 100, mouthSym: 100, browSym: 100, yaw: 0 });
  
  // Logic Refs
  const isScanningRef = useRef(false);
  const samplesRef = useRef<{eye: number[], mouth: number[], brow: number[]}>({ eye: [], mouth: [], brow: [] });
  const faceMeshRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const isActiveRef = useRef<boolean>(true);
  const hasPromptedStartRef = useRef<boolean>(false);
  const lastFrameTimeRef = useRef<number>(0); // For throttling frame rate
  const lastLumaCheckTimeRef = useRef<number>(0); // For throttling lighting check
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null); // For lighting analysis

  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

  useEffect(() => {
    const t = setTimeout(() => {
        const text = mode === 'CALIBRATION' 
          ? "请将面部对准屏幕中央。" 
          : "请正对屏幕，调整距离，就像照镜子一样。";
        speak(text, true);
    }, 500);
    return () => {
        clearTimeout(t);
        stopSpeech();
    };
  }, [mode]);

  useEffect(() => {
      if (lightingStatus === 'TOO_DARK') {
          setGuidance({ status: 'WARN', msg: '光线太暗，请开灯' });
          setIsPoseValid(false);
          hasPromptedStartRef.current = false;
          return;
      }

      if (isPoseValid && !isScanning && !hasPromptedStartRef.current && isModelLoaded) {
          hasPromptedStartRef.current = true;
          speak("位置正好，请点击开始检测。");
      }
      if (!isPoseValid && !isScanning) {
          hasPromptedStartRef.current = false;
      }
  }, [isPoseValid, isScanning, isModelLoaded, lightingStatus]);

  // Extended Landmarks
  const LM = {
    L_EYE: [33, 160, 158, 133, 153, 144],
    R_EYE: [362, 385, 387, 263, 373, 380],
    L_BROW: [70, 63, 105, 66, 107],
    R_BROW: [336, 296, 334, 293, 300],
    LIPS_UP: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
    LIPS_DOWN: [146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
    OVAL: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
    // Key points for Yaw (Head rotation) detection: Left Cheek (234) vs Right Cheek (454)
    CHEEK_L: 234,
    CHEEK_R: 454
  };

  const checkLighting = () => {
      if (!webcamRef.current?.video) return;
      const now = Date.now();
      if (now - lastLumaCheckTimeRef.current < 500) return; // Check every 500ms
      lastLumaCheckTimeRef.current = now;

      try {
          // Initialize analysis canvas if needed
          if (!analysisCanvasRef.current) {
              analysisCanvasRef.current = document.createElement('canvas');
              analysisCanvasRef.current.width = 40; // Small size is enough for avg brightness
              analysisCanvasRef.current.height = 40;
          }

          const ctx = analysisCanvasRef.current.getContext('2d');
          if (!ctx) return;

          // Draw video frame to small canvas
          ctx.drawImage(webcamRef.current.video, 0, 0, 40, 40);
          
          const imageData = ctx.getImageData(0, 0, 40, 40);
          const data = imageData.data;
          let r, g, b, avg;
          let colorSum = 0;

          for (let x = 0, len = data.length; x < len; x += 4) {
              r = data[x];
              g = data[x + 1];
              b = data[x + 2];
              // Standard Luma formula: 0.2126*R + 0.7152*G + 0.0722*B
              // Simplified: (R+G+B)/3 is okay, but weighted is better for human perception
              avg = Math.floor((r + g + b) / 3);
              colorSum += avg;
          }

          const brightness = Math.floor(colorSum / (40 * 40));

          if (brightness < LUMA_THRESHOLD) {
              if (lightingStatus !== 'TOO_DARK') {
                  setLightingStatus('TOO_DARK');
                  setGuidance({ status: 'WARN', msg: '光线太暗，请开灯' });
              }
          } else {
              if (lightingStatus !== 'OK') {
                  setLightingStatus('OK');
                  setGuidance({ status: 'ERROR', msg: '重新定位中...' }); // Reset guidance so landmarks logic takes over
              }
          }
      } catch (e) {
          console.error("Lighting check failed", e);
      }
  };

  useEffect(() => {
    const initFaceMesh = async () => {
      const { FaceMesh } = window;
      const { Camera } = window;
      
      const faceMesh = new FaceMesh({locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      }});

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      faceMesh.onResults(onResults);
      faceMeshRef.current = faceMesh;

      if (webcamRef.current && webcamRef.current.video) {
        const camera = new Camera(webcamRef.current.video, {
          onFrame: async () => {
             // 1. Lighting Check
             checkLighting();

             // 2. Performance Throttle
             const now = Date.now();
             if (now - lastFrameTimeRef.current < 66) return;
             lastFrameTimeRef.current = now;

             if (isActiveRef.current && webcamRef.current?.video) {
                 await faceMesh.send({image: webcamRef.current.video});
             }
          },
          width: 640,
          height: 480
        });
        camera.start();
        cameraRef.current = camera;
        setIsModelLoaded(true);
      }
    };
    
    setTimeout(initFaceMesh, 1000);

    return () => {
        isActiveRef.current = false;
        if (cameraRef.current) cameraRef.current.stop();
        if (faceMeshRef.current) faceMeshRef.current.close();
    };
  }, [lightingStatus]); // Re-bind if lighting status changes? Actually, ref usage inside onFrame handles it.

  const calculateDistance = (p1: any, p2: any) => {
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  const calculateSymmetry = (leftPoints: any[], rightPoints: any[]) => {
      const getHeight = (pts: any[]) => {
          let minY = 1, maxY = 0;
          pts.forEach(p => {
              if (p.y < minY) minY = p.y;
              if (p.y > maxY) maxY = p.y;
          });
          return maxY - minY;
      };

      const lH = getHeight(leftPoints);
      const rH = getHeight(rightPoints);
      
      const ratio = Math.min(lH, rH) / Math.max(lH, rH);
      return Math.floor(ratio * 100);
  };

  const onResults = useCallback((results: any) => {
      if (!canvasRef.current || !webcamRef.current?.video) return;
      
      // If too dark, don't bother processing landmarks logic visually (save resources)
      // and ensure guidance reflects the lighting error.
      if (lightingStatus === 'TOO_DARK') return;

      const video = webcamRef.current.video;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      canvasRef.current.width = videoWidth;
      canvasRef.current.height = videoHeight;
      
      const canvasCtx = canvasRef.current.getContext('2d');
      if (!canvasCtx) return;
      
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
          const landmarks = results.multiFaceLandmarks[0];
          
          const { drawConnectors } = window;
          drawConnectors(canvasCtx, landmarks, window.FACEMESH_TESSELATION, {color: '#ffffff20', lineWidth: 0.5});
          drawConnectors(canvasCtx, landmarks, window.FACEMESH_RIGHT_EYE, {color: '#739E82', lineWidth: 2});
          drawConnectors(canvasCtx, landmarks, window.FACEMESH_LEFT_EYE, {color: '#739E82', lineWidth: 2});
          drawConnectors(canvasCtx, landmarks, window.FACEMESH_LIPS, {color: '#D68C68', lineWidth: 2});
          // Restore Eyebrow Visualization
          drawConnectors(canvasCtx, landmarks, window.FACEMESH_RIGHT_EYEBROW, {color: '#6C8BAB', lineWidth: 2});
          drawConnectors(canvasCtx, landmarks, window.FACEMESH_LEFT_EYEBROW, {color: '#6C8BAB', lineWidth: 2});
          
          const leftCheek = landmarks[234];
          const rightCheek = landmarks[454];
          const faceWidth = calculateDistance(leftCheek, rightCheek);
          
          const noseTop = landmarks[10];
          const noseBottom = landmarks[152];
          const tiltX = Math.abs(noseTop.x - noseBottom.x); // Left/Right tilt

          // ALGORITHM UPDATE: 3D Depth Check (Yaw)
          const zDiff = Math.abs(leftCheek.z - rightCheek.z);
          
          let status: 'OK' | 'WARN' | 'ERROR' = 'OK';
          let msg = '位置正好，保持不动';

          if (faceWidth < 0.25) { 
              status = 'WARN'; msg = '请靠近一点';
          } else if (faceWidth > 0.8) {
              status = 'WARN'; msg = '请离远一点';
          } else if (tiltX > 0.08) {
              status = 'WARN'; msg = '请摆正头部';
          } else if (zDiff > 0.05) { // Strict depth check
              status = 'WARN'; msg = '请勿左右转头';
          }
          
          setGuidance({ status, msg });
          setIsPoseValid(status === 'OK');

          const lEye = LM.L_EYE.map(i => landmarks[i]);
          const rEye = LM.R_EYE.map(i => landmarks[i]);
          const lBrow = LM.L_BROW.map(i => landmarks[i]);
          const rBrow = LM.R_BROW.map(i => landmarks[i]);
          
          const eyeSym = calculateSymmetry(lEye, rEye);
          const browSym = calculateSymmetry(lBrow, rBrow);
          
          const lMouthCorner = landmarks[61];
          const rMouthCorner = landmarks[291];
          const mouthCenter = landmarks[13];
          const lDist = calculateDistance(lMouthCorner, mouthCenter);
          const rDist = calculateDistance(rMouthCorner, mouthCenter);
          const mouthSym = Math.floor((Math.min(lDist, rDist) / Math.max(lDist, rDist)) * 100);

          setRealtimeStats({ eyeSym, browSym, mouthSym, yaw: Math.round(zDiff * 1000) });

          if (isScanningRef.current && status === 'OK') {
              samplesRef.current.eye.push(eyeSym);
              samplesRef.current.brow.push(browSym);
              samplesRef.current.mouth.push(mouthSym);
          }

      } else {
          setGuidance({ status: 'ERROR', msg: '未检测到面部' });
          setIsPoseValid(false);
      }
      
      canvasCtx.restore();
  }, [lightingStatus]);

  const startScan = () => {
      if (lightingStatus === 'TOO_DARK') {
          speak("光线太暗，请到亮一点的地方。", true);
          return;
      }
      if (!isPoseValid) {
          speak("请调整姿势，直到绿色边框出现。", true);
          return;
      }
      
      speak("保持微笑，不要动。", true);
      setIsScanning(true);
      samplesRef.current = { eye: [], mouth: [], brow: [] };
      setScanProgress(0);

      let p = 0;
      const interval = setInterval(() => {
          p += 2;
          setScanProgress(p);
          if (p >= 100) {
              clearInterval(interval);
              finishScan();
          }
      }, 80);
  };

  const finishScan = async () => {
      setIsScanning(false);
      speak("检测完成。", true);
      
      const calcAvg = (arr: number[]) => arr.length > 0 ? arr.reduce((a,b)=>a+b,0)/arr.length : 100;
      
      const eyeScore = calcAvg(samplesRef.current.eye);
      const browScore = calcAvg(samplesRef.current.brow);
      const mouthScore = calcAvg(samplesRef.current.mouth);

      const finalScore = Math.floor(eyeScore * 0.4 + mouthScore * 0.4 + browScore * 0.2);
      
      let details = "";
      if (mode === 'CALIBRATION') {
          onComplete({ 
              score: 100, 
              details: "基准已录入。", 
              timestamp: Date.now(), 
              raw: { eyeSym: eyeScore, mouthSym: mouthScore, browSym: browScore } 
          });
          return;
      }

      const baseline = getBaseline()?.visual;
      
      if (baseline) {
          if (finalScore < 80) details = "面部对称性低于您的基准水平，请留意。";
          else details = "面部特征与基准一致，状态良好。";
      } else {
          if (finalScore < 85) details = "检测到轻微面部不对称。";
          else details = "面部特征对称良好。";
      }

      const snapshot = webcamRef.current?.getScreenshot() || undefined;

      await saveRecord({ 
          type: 'VISUAL', 
          score: finalScore, 
          details, 
          timestamp: Date.now(),
          snapshot 
      });
      
      setTimeout(() => {
          onComplete({ score: finalScore, details, timestamp: Date.now() });
      }, 500);
  };

  return (
    <div className="flex flex-col items-center justify-between w-full h-full bg-black relative overflow-hidden">
      
      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 z-20 p-6 flex flex-col items-center animate-in slide-in-from-top duration-500">
         <div className={`px-6 py-3 rounded-full flex items-center gap-2 backdrop-blur-md shadow-lg transition-colors duration-300
             ${lightingStatus === 'TOO_DARK' 
                ? 'bg-status-danger text-white border-2 border-white' 
                : (guidance.status === 'OK' ? 'bg-face/80 text-white' : 'bg-white/80 text-warm-900')}
         `}>
             {isScanning ? (
                <Loader2 className="animate-spin" />
             ) : (
                lightingStatus === 'TOO_DARK' ? <Moon size={20} className="animate-pulse" /> :
                (guidance.status === 'OK' ? <CheckCircle2 /> : <AlertCircle />)
             )}
             
             <span className="font-bold text-lg">
                {isScanning ? `检测中 ${scanProgress}%` : (lightingStatus === 'TOO_DARK' ? '光线太暗，请开灯' : guidance.msg)}
             </span>
         </div>
      </div>

      <div className="relative w-full h-full flex items-center justify-center bg-black">
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored={false} 
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: "user" }}
            className={`absolute inset-0 w-full h-full object-contain scale-x-[-1] transition-opacity duration-500 ${lightingStatus === 'TOO_DARK' ? 'opacity-50' : 'opacity-100'}`}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
          
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-contain scale-x-[-1]"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />

          {/* Realtime Stats for Tech Validation */}
          <div className="absolute top-24 w-full px-4 flex justify-between text-[10px] text-white/70 font-mono pointer-events-none">
              <span>眼部: {realtimeStats.eyeSym}</span>
              <span>眉部: {realtimeStats.browSym}</span>
              <span>口角: {realtimeStats.mouthSym}</span>
              <span>旋转(Z): {realtimeStats.yaw}</span>
          </div>

          {/* Dark Mode Overlay */}
          {lightingStatus === 'TOO_DARK' && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <div className="bg-black/60 p-6 rounded-3xl backdrop-blur-sm text-center">
                      <Sun className="text-yellow-400 mx-auto mb-4 animate-bounce" size={48} />
                      <p className="text-white font-bold text-xl">光线太暗无法检测</p>
                      <p className="text-white/70 text-sm mt-2">请走到窗边或打开房间灯光</p>
                  </div>
              </div>
          )}

          {isScanning && (
              <div className="absolute inset-0 z-10 pointer-events-none">
                  <div 
                    className="w-full h-1 bg-face/50 shadow-[0_0_15px_rgba(115,158,130,0.8)] absolute top-0 animate-[scan_2s_ease-in-out_infinite]"
                    style={{ top: `${scanProgress}%` }}
                  ></div>
              </div>
          )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-30 p-8 pb-32 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center">
          {!isScanning && (
              <button 
                onClick={startScan}
                disabled={!isModelLoaded || lightingStatus === 'TOO_DARK'}
                className={`
                    w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all duration-300 shadow-xl
                    ${isPoseValid && lightingStatus === 'OK'
                        ? 'bg-face border-white scale-110 animate-pulse' 
                        : 'bg-white/20 border-white/50 text-white/50 grayscale'
                    }
                `}
              >
                 <ScanFace size={40} className={isPoseValid && lightingStatus === 'OK' ? 'text-white' : 'text-white/50'} />
              </button>
          )}
          
          {!isModelLoaded && (
               <p className="text-white/70 mt-4 text-sm animate-pulse">正在加载 AI 模型...</p>
          )}
      </div>
      
      <style>{`
        @keyframes scan {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default MirrorModule;