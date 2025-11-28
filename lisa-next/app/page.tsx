'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

// --- TYPES ---
type Theme = 'system' | 'light' | 'dark';
type Lang = 'en' | 'zh';

// Declare global types for MediaPipe to avoid TS errors
declare global {
  interface Window {
    Pose: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    POSE_CONNECTIONS: any;
  }
}

const TRANSLATIONS = {
  en: {
    title: "L.I.S.A.",
    subtitle: "Long Interval Sitting Alert",
    statusInit: "Initializing Camera...",
    statusUserDetected: "User Detected. Sitting:",
    statusUserAway: "User Away. Timer Paused:",
    statusTimeUp: "⚠️ TIME UP!",
    controls: {
      pause: "⏸️ Pause",
      resume: "▶️ Resume",
      reset: "🔄 Reset",
      showVideo: "📷 Show Video",
      hideVideo: "👁️ Hide Video",
    }
  },
  zh: {
    title: "L.I.S.A.",
    subtitle: "久坐提醒助手",
    statusInit: "正在初始化摄像头...",
    statusUserDetected: "检测到用户。久坐时长:",
    statusUserAway: "用户离开。计时器暂停:",
    statusTimeUp: "⚠️ 时间到!",
    controls: {
      pause: "⏸️ 暂停",
      resume: "▶️ 继续",
      reset: "🔄 重置",
      showVideo: "📷 显示视频",
      hideVideo: "👁️ 隐藏视频",
    }
  }
};

export default function Home() {
  // --- STATE ---
  const [lang, setLang] = useState<Lang>('en');
  const [timeLimit, setTimeLimit] = useState(30);
  const [accumulatedTime, setAccumulatedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [status, setStatus] = useState(TRANSLATIONS['en'].statusInit);
  const [isUserPresent, setIsUserPresent] = useState(false);
  const [isPoseLoaded, setIsPoseLoaded] = useState(false);
  const [isCameraLoaded, setIsCameraLoaded] = useState(false);
  const [isDrawingLoaded, setIsDrawingLoaded] = useState(false);

  // --- REFS ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastFrameTime = useRef(0);
  const lastAlertSecond = useRef(-1);
  const lastNotificationSecond = useRef(-1);

  // Refs for state accessed inside MediaPipe loop
  const accumulatedTimeRef = useRef(0);
  const timeLimitRef = useRef(timeLimit);
  const showVideoRef = useRef(showVideo);
  const isPausedRef = useRef(isPaused);
  const langRef = useRef(lang);

  const t = TRANSLATIONS[lang];

  // --- EFFECTS ---
  // Sync state to refs
  useEffect(() => { timeLimitRef.current = timeLimit; }, [timeLimit]);
  useEffect(() => { showVideoRef.current = showVideo; }, [showVideo]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { langRef.current = lang; }, [lang]);
  
  // Sync accumulatedTime state changes (e.g. reset) to ref
  useEffect(() => { 
    // Only sync if the state is 0 (reset), otherwise the loop drives the ref
    if (accumulatedTime === 0) accumulatedTimeRef.current = 0;
  }, [accumulatedTime]);

  useEffect(() => {
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  const requestNotificationPermission = () => {
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  };

  useEffect(() => {
    if (isPoseLoaded && isCameraLoaded && isDrawingLoaded && videoRef.current && window.Pose && window.Camera) {
      const pose = new window.Pose({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      pose.onResults(onResults);

      const camera = new window.Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current) await pose.send({ image: videoRef.current });
        },
        width: 640,
        height: 480,
      });
      camera.start();
    }
  }, [isPoseLoaded, isCameraLoaded, isDrawingLoaded]);

  // --- LOGIC ---
  const onResults = (results: any) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    // 1. Draw
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    
    // Use Ref for current video state
    if (showVideoRef.current) {
      ctx.drawImage(results.image, 0, 0, width, height);
    } else {
      // Privacy Grid
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, width, height);
    }

    // 2. Logic
    const now = Date.now();
    let dt = 0;
    if (lastFrameTime.current !== 0) {
      dt = now - lastFrameTime.current;
    }
    lastFrameTime.current = now;

    if (results.poseLandmarks) {
      setIsUserPresent(true);
      window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: 'rgba(0, 255, 118, 0.5)', lineWidth: 2 });
      window.drawLandmarks(ctx, results.poseLandmarks, { color: '#00e676', lineWidth: 1, radius: 3 });

      if (!isPausedRef.current) {
        accumulatedTimeRef.current += dt;
        // Throttle state updates to avoid excessive re-renders? 
        // Actually React batches well, but let's just set it.
        setAccumulatedTime(accumulatedTimeRef.current);
      }
    } else {
      setIsUserPresent(false);
      // Auto reset logic: If user leaves AFTER time limit was reached, reset.
      if (accumulatedTimeRef.current >= timeLimitRef.current * 1000) {
         accumulatedTimeRef.current = 0;
         setAccumulatedTime(0);
         lastAlertSecond.current = -1;
         lastNotificationSecond.current = -1;
      }
    }

    // 3. Alert Logic
    const secondsSat = Math.floor(accumulatedTimeRef.current / 1000);
    const limit = timeLimitRef.current;
    
    if (secondsSat >= limit) {
        // A. Browser Notification (Every 10s)
        if ((secondsSat - limit) % 10 === 0) {
            if (lastNotificationSecond.current !== secondsSat) {
                if (Notification.permission === "granted") {
                    const currentT = TRANSLATIONS[langRef.current];
                    new Notification(currentT.title, { body: currentT.statusTimeUp });
                }
                lastNotificationSecond.current = secondsSat;
            }
        }

        // B. Backend Alert (Every 60s)
        if ((secondsSat - limit) % 60 === 0) {
            if (lastAlertSecond.current !== secondsSat) {
                sendAlertToBackend(secondsSat);
                lastAlertSecond.current = secondsSat;
            }
        }
    }

    ctx.restore();
  };

  // --- API ---
  const sendAlertToBackend = async (duration: number) => {
    try {
      const response = await fetch('http://127.0.0.1:8081/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: "user_001",
          event: "long_sitting",
          duration_seconds: duration,
          timestamp: Date.now()
        })
      });

      if (response.ok) {
        const data = await response.json();
        // TTS
        if (window.speechSynthesis) {
            const speech = new SpeechSynthesisUtterance(data.message);
            // Try to match language
            if (lang === 'zh') speech.lang = 'zh-CN';
            window.speechSynthesis.speak(speech);
        }
      }
    } catch (error) {
      console.error("Backend connection failed", error);
    }
  };

  // Helper to draw grid
  const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const step = 40;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  };

  // --- RENDER ---
  const secondsSat = Math.floor(accumulatedTime / 1000);
  
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-900 text-white">
      <Script 
        src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js" 
        strategy="lazyOnload" 
        onLoad={() => setIsPoseLoaded(true)} 
      />
      <Script 
        src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" 
        strategy="lazyOnload" 
        onLoad={() => setIsCameraLoaded(true)} 
      />
      <Script 
        src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js" 
        strategy="lazyOnload" 
        onLoad={() => setIsDrawingLoaded(true)} 
      />

      <h1 className="text-4xl font-thin tracking-widest mb-2 text-green-400">
        {t.title} <span className="text-sm text-gray-400">{t.subtitle}</span>
      </h1>


      {/* Controls */}
      <div className="bg-gray-800 p-4 rounded-xl shadow-lg flex gap-4 items-center mb-6">
        <select 
          className="bg-gray-700 border border-gray-600 rounded px-3 py-2"
          onChange={(e) => setTimeLimit(Number(e.target.value))}
          value={timeLimit}
        >
          <option value={10}>10s (Test)</option>
          <option value={30}>30s (Demo)</option>
          <option value={1200}>20m</option>
        </select>

        <div className="w-px h-6 bg-gray-600 mx-2"></div>

        <button 
          onClick={() => {
            setIsPaused(!isPaused);
            requestNotificationPermission();
          }}
          className={`px-4 py-2 rounded border ${isPaused ? 'border-green-500 text-green-400' : 'border-gray-600 hover:bg-gray-700'}`}
        >
          {isPaused ? t.controls.resume : t.controls.pause}
        </button>
        
        <button 
          onClick={() => setAccumulatedTime(0)}
          className="px-4 py-2 rounded border border-gray-600 hover:bg-gray-700"
        >
          {t.controls.reset}
        </button>

        <button 
          onClick={() => setShowVideo(!showVideo)}
          className="px-4 py-2 rounded border border-gray-600 hover:bg-gray-700"
        >
          {showVideo ? t.controls.hideVideo : t.controls.showVideo}
        </button>

        <div className="w-px h-6 bg-gray-600 mx-2"></div>

        <select 
          className="bg-gray-700 border border-gray-600 rounded px-3 py-2"
          onChange={(e) => setLang(e.target.value as Lang)}
          value={lang}
        >
          <option value="en">🇺🇸 EN</option>
          <option value="zh">🇨🇳 ZH</option>
        </select>
      </div>

      {/* Video Container */}
      <div className="relative w-[640px] h-[480px] rounded-2xl overflow-hidden border-2 border-gray-700 shadow-2xl shadow-green-900/20">
        <video 
          ref={videoRef} 
          className={`absolute w-full h-full object-cover scale-x-[-1] ${showVideo ? 'opacity-100' : 'opacity-0'}`} 
          playsInline 
          muted
        ></video>
        <canvas ref={canvasRef} width={640} height={480} className="absolute w-full h-full scale-x-[-1]"></canvas>
      </div>

      {/* Status */}
      <div className={`mt-6 text-xl font-medium px-6 py-3 rounded-lg bg-gray-800 transition-colors ${secondsSat >= timeLimit ? 'text-red-500' : 'text-green-400'}`}>
        {secondsSat >= timeLimit 
          ? `${t.statusTimeUp} (${secondsSat}s / ${timeLimit}s)`
          : `${isUserPresent ? t.statusUserDetected : t.statusUserAway} ${secondsSat}s`
        }
      </div>
    </main>
  );
}
