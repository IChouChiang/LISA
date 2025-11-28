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
  const [theme, setTheme] = useState<Theme>('system');
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
  // Theme Management
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (t: Theme) => {
      if (t === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.setAttribute('data-theme', systemTheme);
      } else {
        root.setAttribute('data-theme', t);
      }
    };

    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

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
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      ctx.fillStyle = isLight ? '#f8fafc' : '#1e1e1e';
      ctx.fillRect(0, 0, width, height);
      drawGrid(ctx, width, height, isLight);
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
  const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number, isLight: boolean = false) => {
    const step = 40;
    ctx.strokeStyle = isLight ? '#e2e8f0' : '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  };

  // --- RENDER ---
  const secondsSat = Math.floor(accumulatedTime / 1000);
  const isOverLimit = secondsSat >= timeLimit;
  
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 text-white relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none"></div>
      
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

      {/* Header Section */}
      <div className="z-10 flex flex-col items-center mb-8">
        <h1 className="text-6xl md:text-8xl font-thin tracking-[0.2em] mb-4 text-center" style={{ color: 'rgb(var(--foreground-rgb))' }}>
          {t.title}
        </h1>
        <div className="glass-panel px-4 py-1 rounded-full text-sm tracking-widest uppercase" style={{ color: 'rgb(var(--foreground-rgb))', opacity: 0.7 }}>
          {t.subtitle}
        </div>
      </div>

      {/* Status Pill */}
      <div className={`z-10 mb-6 px-6 py-2 rounded-full glass-panel transition-all duration-500 flex items-center gap-2 ${isOverLimit ? 'border-red-500/50 bg-red-500/10' : 'border-green-500/30'}`}>
        <div className={`w-2 h-2 rounded-full ${isOverLimit ? 'bg-red-500 animate-pulse' : (isUserPresent ? 'bg-green-400' : 'bg-yellow-400')}`}></div>
        <span className={`font-medium ${isOverLimit ? 'text-red-500' : ''}`} style={{ color: isOverLimit ? undefined : 'rgb(var(--foreground-rgb))' }}>
          {isOverLimit 
            ? `${t.statusTimeUp} (${secondsSat}s / ${timeLimit}s)`
            : `${isUserPresent ? t.statusUserDetected : t.statusUserAway} ${secondsSat}s`
          }
        </span>
      </div>

      {/* Video Container */}
      <div className={`relative z-10 w-full max-w-[640px] aspect-[4/3] rounded-3xl overflow-hidden border border-white/10 transition-all duration-500 ${isOverLimit ? 'glow-red' : 'glow-green'}`}>
        <video 
          ref={videoRef} 
          className={`absolute w-full h-full object-cover scale-x-[-1] transition-opacity duration-500 ${showVideo ? 'opacity-100' : 'opacity-0'}`} 
          playsInline 
          muted
        ></video>
        <canvas ref={canvasRef} width={640} height={480} className="absolute w-full h-full scale-x-[-1]"></canvas>
        
        {/* Overlay when paused */}
        {isPaused && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <div className="text-4xl">⏸️</div>
          </div>
        )}
      </div>

      {/* Controls Dock - Static Position */}
      <div className="mt-8 z-20 glass-panel p-2 rounded-2xl flex flex-wrap justify-center items-center gap-2 shadow-2xl">
        
        {/* Time Select */}
        <div className="relative group">
          <select 
            className="appearance-none bg-transparent text-sm font-medium px-4 py-3 rounded-xl glass-button cursor-pointer outline-none min-w-[80px] text-center"
            onChange={(e) => setTimeLimit(Number(e.target.value))}
            value={timeLimit}
          >
            <option value={10}>10s</option>
            <option value={30}>30s</option>
            <option value={1200}>20m</option>
          </select>
        </div>

        <div className="w-px h-8 bg-gray-500/30 mx-1"></div>

        {/* Play/Pause */}
        <button 
          onClick={() => {
            setIsPaused(!isPaused);
            requestNotificationPermission();
          }}
          className={`p-3 rounded-xl glass-button ${isPaused ? 'text-yellow-500' : ''}`}
          style={{ color: isPaused ? undefined : 'rgb(var(--foreground-rgb))' }}
          title={isPaused ? t.controls.resume : t.controls.pause}
        >
          {isPaused ? '▶️' : '⏸️'}
        </button>
        
        {/* Reset */}
        <button 
          onClick={() => setAccumulatedTime(0)}
          className="p-3 rounded-xl glass-button"
          style={{ color: 'rgb(var(--foreground-rgb))' }}
          title={t.controls.reset}
        >
          🔄
        </button>

        {/* Toggle Video */}
        <button 
          onClick={() => setShowVideo(!showVideo)}
          className={`p-3 rounded-xl glass-button ${showVideo ? 'text-green-500' : ''}`}
          style={{ color: showVideo ? undefined : 'rgb(var(--foreground-rgb))' }}
          title={showVideo ? t.controls.hideVideo : t.controls.showVideo}
        >
          {showVideo ? '📷' : '👁️'}
        </button>

        <div className="w-px h-8 bg-gray-500/30 mx-1"></div>

        {/* Theme Select */}
        <select 
          className="appearance-none bg-transparent text-sm font-medium px-4 py-3 rounded-xl glass-button cursor-pointer outline-none text-center"
          onChange={(e) => setTheme(e.target.value as Theme)}
          value={theme}
        >
          <option value="system">💻</option>
          <option value="light">☀️</option>
          <option value="dark">🌙</option>
        </select>

        {/* Language */}
        <button 
          onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
          className="px-4 py-3 rounded-xl glass-button text-sm font-bold"
          style={{ color: 'rgb(var(--foreground-rgb))' }}
        >
          {lang === 'en' ? 'EN' : '中'}
        </button>
      </div>
    </main>
  );
}
