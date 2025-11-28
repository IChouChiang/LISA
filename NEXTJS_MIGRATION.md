# L.I.S.A. Next.js + Tailwind CSS Migration Guide

This guide details how to migrate the current HTML/JS frontend to a modern Next.js application using Tailwind CSS.

## 1. Project Initialization

Run the following commands in your terminal to create the project structure:

```bash
# 1. Create new Next.js app (Use default settings: Yes to TypeScript, ESLint, Tailwind, App Router)
npx create-next-app@latest lisa-next --typescript --tailwind --eslint

# 2. Navigate into the folder
cd lisa-next

# 3. Install MediaPipe dependencies
npm install @mediapipe/pose @mediapipe/camera_utils @mediapipe/drawing_utils
```

## 2. Project Structure

We will organize the project as follows:

```
lisa-next/
├── app/
│   ├── globals.css      # Global styles (Tailwind directives)
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Main application logic (The "Eye" & "Brain")
├── components/
│   ├── Controls.tsx     # UI Buttons and Dropdowns
│   ├── StatusCard.tsx   # Status text display
│   └── CameraView.tsx   # Video and Canvas wrapper
└── public/
    └── ...
```

## 3. Implementation Details

### A. Global Styles (`app/globals.css`)
Ensure Tailwind is active and add any custom animations if needed.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 214, 219, 220;
  --background-end-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 0, 0, 0;
    --background-end-rgb: 0, 0, 0;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
}
```

### B. Main Page Logic (`app/page.tsx`)
This file replaces `index.html`. It handles the state (timer, presence) and loads MediaPipe.

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// --- TYPES ---
type Theme = 'system' | 'light' | 'dark';
type Lang = 'en' | 'zh';

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

  // --- REFS ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastFrameTime = useRef(0);
  const lastAlertSecond = useRef(-1);
  const lastNotificationSecond = useRef(-1);

  const t = TRANSLATIONS[lang];

  // --- EFFECTS ---
  useEffect(() => {
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }

    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults(onResults);

    if (videoRef.current) {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current) await pose.send({ image: videoRef.current });
        },
        width: 640,
        height: 480,
      });
      camera.start();
    }
  }, []);

  // --- LOGIC ---
  const onResults = (results: Results) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    // 1. Draw
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    
    if (showVideo) {
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
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: 'rgba(0, 255, 118, 0.5)', lineWidth: 2 });
      drawLandmarks(ctx, results.poseLandmarks, { color: '#00e676', lineWidth: 1, radius: 3 });

      if (!isPaused) {
        setAccumulatedTime(prev => prev + dt);
      }
    } else {
      setIsUserPresent(false);
      // Auto reset logic could go here
    }

    ctx.restore();
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
          onClick={() => setIsPaused(!isPaused)}
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
        <video ref={videoRef} className="absolute w-full h-full object-cover scale-x-[-1]" playsInline></video>
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
```

## 4. Running the Project

1.  Start the development server:
    ```bash
    npm run dev
    ```
2.  Open [http://localhost:3000](http://localhost:3000) in your browser.
3.  Ensure your Go backend is running on port 8081 for the AI alerts to work (you will need to add the `sendAlertToBackend` function to the React component similar to the HTML version).
