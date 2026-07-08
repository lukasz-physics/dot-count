import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Sliders,
  Sparkles,
  Layers,
  Activity,
  Maximize2,
  RefreshCw,
  Compass,
  MapPin
} from 'lucide-react';

// Total dimensions defined by the user
const COLS = 200;
const ROWS = 46;
const TOTAL_DOTS = 9131;

// Web Audio API Sonification Engine
let audioCtx: AudioContext | null = null;

function playBeep(index: number) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Map column index (0-199) to frequency (220Hz - 880Hz)
    const col = index % COLS;
    const minFreq = 180;
    const maxFreq = 720;
    const freq = minFreq + (col / (COLS - 1)) * (maxFreq - minFreq);

    // Add visual harmonics for row coordinate (higher rows are slightly brighter)
    const row = Math.floor(index / COLS);
    osc.type = row % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    // Ultra-soft transient click/pluck envelope
    gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (err) {
    console.warn('AudioContext not allowed or not supported:', err);
  }
}

export default function App() {
  // App States
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [speedMs, setSpeedMs] = useState<number>(100); // default speed 100ms as requested
  const [mode, setMode] = useState<'scan' | 'trail'>('trail'); // 'scan' = single dot, 'trail' = cumulative filling
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [loopEnabled, setLoopEnabled] = useState<boolean>(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lastChangeTime, setLastChangeTime] = useState<number>(performance.now());

  // References
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  // Track size of the canvas container
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      if (entries && entries[0]) {
        // Limit width to keep layout beautiful, default fallback to 800px
        const rectWidth = entries[0].contentRect.width;
        if (rectWidth > 0) {
          setContainerWidth(rectWidth);
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute Grid coordinate spacing
  const paddingX = 12;
  const paddingY = 12;

  const canvasWidth = containerWidth;
  const stepX = useMemo(() => {
    return (canvasWidth - paddingX * 2) / (COLS - 1);
  }, [canvasWidth]);

  // Keep spacing perfectly square! stepY matches stepX exactly.
  const stepY = stepX;
  const canvasHeight = useMemo(() => {
    return stepY * (ROWS - 1) + paddingY * 2;
  }, [stepY]);

  const dotRadius = useMemo(() => {
    return Math.max(1, Math.min(2.5, stepX * 0.35));
  }, [stepX]);

  // Track when activeIndex changes to drive the fade-in interpolation
  useEffect(() => {
    setLastChangeTime(performance.now());
  }, [activeIndex]);

  // Automatic Index Timer Progression
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setActiveIndex((prev) => {
        if (prev >= TOTAL_DOTS - 1) {
          if (loopEnabled) {
            return 0;
          } else {
            setIsPlaying(false);
            return prev;
          }
        }
        return prev + 1;
      });
    }, speedMs);

    return () => clearInterval(interval);
  }, [isPlaying, speedMs, loopEnabled]);

  // Handle Sonification on update
  useEffect(() => {
    if (audioEnabled && isPlaying) {
      playBeep(activeIndex);
    }
  }, [activeIndex, audioEnabled, isPlaying]);

  // Draw the Dot Grid to Canvas with smooth linear fade-in
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);

    let animationId: number;

    const draw = () => {
      // Clear Canvas
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      const now = performance.now();
      const elapsed = now - lastChangeTime;
      // Calculate progress from 0 to 1 over speedMs duration
      const progress = speedMs > 0 ? Math.min(1, elapsed / speedMs) : 1;

      // Render 9,131 Dots
      for (let i = 0; i < TOTAL_DOTS; i++) {
        const colIndex = i % COLS;
        const rowIndex = Math.floor(i / COLS);
        const x = paddingX + colIndex * stepX;
        const y = paddingY + rowIndex * stepY;

        const isCurrent = i === activeIndex;
        const isHovered = i === hoveredIndex;

        let isHighlighted = false;
        if (mode === 'trail') {
          isHighlighted = i <= activeIndex;
        } else {
          isHighlighted = i === activeIndex;
        }

        ctx.beginPath();

        if (isCurrent) {
          // Active green dot fades in from grey-tan (#D1D1CB) to custom green (#21FBAC)
          // same size as standard dots (dotRadius), with absolutely no glow
          const r = Math.round(209 + (33 - 209) * progress);
          const g = Math.round(209 + (251 - 209) * progress);
          const b = Math.round(203 + (172 - 203) * progress);

          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fill();
        } else if (isHighlighted) {
          // Part of the active highlighted trail: vibrant green at same size as standard dots, no glow
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = '#21FBAC';
          ctx.fill();
        } else if (isHovered) {
          // Under mouse cursor
          ctx.arc(x, y, dotRadius * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = '#2D2D2A';
          ctx.fill();
        } else {
          // Standard background dots: muted grey-tan (#D1D1CB)
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = '#D1D1CB';
          ctx.fill();
        }
      }
    };

    // Continuous loop to ensure smooth fade interpolation while playing
    if (isPlaying) {
      const loop = () => {
        draw();
        animationId = requestAnimationFrame(loop);
      };
      animationId = requestAnimationFrame(loop);
    } else {
      draw();
    }

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [activeIndex, mode, hoveredIndex, canvasWidth, canvasHeight, stepX, stepY, dotRadius, lastChangeTime, speedMs, isPlaying]);

  // Parse Coordinates for Active dot
  const activeCol = activeIndex % COLS;
  const activeRow = Math.floor(activeIndex / COLS);
  const activeHex = `0x${activeIndex.toString(16).toUpperCase().padStart(3, '0')}`;
  const activePercent = ((activeIndex + 1) / TOTAL_DOTS * 100).toFixed(1);

  // Hover Coordinates Information
  const hoveredInfo = useMemo(() => {
    if (hoveredIndex === null) return null;
    const col = hoveredIndex % COLS;
    const row = Math.floor(hoveredIndex / COLS);
    const hex = `0x${hoveredIndex.toString(16).toUpperCase().padStart(3, '0')}`;
    const percent = ((hoveredIndex + 1) / TOTAL_DOTS * 100).toFixed(1);
    const isLit = mode === 'trail' ? hoveredIndex <= activeIndex : hoveredIndex === activeIndex;
    return { index: hoveredIndex, col, row, hex, percent, isLit };
  }, [hoveredIndex, activeIndex, mode]);

  // Canvas Mouse Move Coordinate Tracking
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX / (window.devicePixelRatio || 1);
    const mouseY = (e.clientY - rect.top) * scaleY / (window.devicePixelRatio || 1);

    // Reverse mathematical formulas
    const colIndex = Math.round((mouseX - paddingX) / stepX);
    const rowIndex = Math.round((mouseY - paddingY) / stepY);

    if (
      colIndex >= 0 &&
      colIndex < COLS &&
      rowIndex >= 0 &&
      rowIndex < ROWS
    ) {
      const calculatedIndex = rowIndex * COLS + colIndex;
      if (calculatedIndex >= 0 && calculatedIndex < TOTAL_DOTS) {
        setHoveredIndex(calculatedIndex);
        return;
      }
    }
    setHoveredIndex(null);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  const handleCanvasClick = () => {
    if (hoveredIndex !== null) {
      setActiveIndex(hoveredIndex);
      if (audioEnabled) {
        playBeep(hoveredIndex);
      }
    }
  };

  // Playback Control Handlers
  const handlePrev = () => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : TOTAL_DOTS - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev < TOTAL_DOTS - 1 ? prev + 1 : 0));
  };

  const jumpTo = (index: number) => {
    const clamped = Math.max(0, Math.min(TOTAL_DOTS - 1, index));
    setActiveIndex(clamped);
    if (audioEnabled) {
      playBeep(clamped);
    }
  };

  return (
    <div className="min-h-screen bg-[#EFEFE7] text-[#2D2D2A] font-sans flex flex-col p-4 md:p-12 overflow-x-hidden antialiased selection:bg-[#21FBAC]/30">
      {/* Outer container restricting extreme stretching */}
      <div className="w-full max-w-6xl mx-auto flex flex-col flex-1 gap-6 md:gap-10">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-black/10">
          <div className="space-y-2">
            <div className="flex items-baseline gap-4">
              <h1 className="text-6xl md:text-8xl font-light tracking-tighter italic serif leading-none select-none">
                9,131
              </h1>
              <span className="text-xl md:text-2xl font-mono text-black/40">/ dots</span>
            </div>
            <p className="text-xs uppercase tracking-[0.25em] font-semibold opacity-60 px-1">
              Sequential Index Visualization
            </p>
          </div>
          
          <div className="text-left md:text-right flex md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-4">
            <div>
              <div className="text-xs font-mono bg-[#21FBAC] px-3 py-1.5 inline-block font-bold rounded-sm uppercase tracking-wider shadow-[0_2px_8px_rgba(33,251,172,0.25)]">
                active_index: {activeHex}
              </div>
              <p className="text-[10px] uppercase tracking-widest opacity-50 mt-1.5 font-mono">
                Refresh Rate: {(speedMs / 1000).toFixed(2)}s / {mode === 'scan' ? 'raster_scan' : 'trail_fill'}
              </p>
            </div>
          </div>
        </header>

        {/* Main Interface */}
        <main className="flex-1 flex flex-col gap-8">
          
          {/* Top Info Banner - coordinate path */}
          <div className="flex flex-wrap items-center justify-between gap-4 text-[11px] font-mono uppercase font-bold tracking-widest opacity-40 px-1">
            <div className="flex items-center gap-2">
              <Compass className="w-3.5 h-3.5" />
              <span>X_AXIS: 000 — 199 (Cols)</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" />
              <span>Y_AXIS: 000 — 045 (Rows)</span>
            </div>
          </div>

          {/* Canvas Wrapper Card */}
          <div className="bg-white/40 border border-black/5 p-4 rounded-md shadow-[inset_0_1px_4px_rgba(0,0,0,0.03)] backdrop-blur-sm relative transition-all hover:border-black/10">
            
            {/* Interactive Canvas container */}
            <div ref={containerRef} className="w-full relative overflow-hidden">
              <canvas
                ref={canvasRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onClick={handleCanvasClick}
                className="w-full h-auto cursor-crosshair block transition-opacity duration-300"
                title="Click to place scanning pointer"
              />
            </div>

            {/* Float Tooltip Inside Grid area */}
            {hoveredInfo && (
              <div className="absolute top-2 right-2 bg-[#2D2D2A] text-[#EFEFE7] font-mono text-[10px] px-3 py-2 rounded shadow-lg border border-white/10 z-10 space-y-1 select-none pointer-events-none">
                <div className="flex justify-between gap-6 border-b border-white/10 pb-1">
                  <span className="opacity-50">INDEX:</span>
                  <span className="font-bold text-[#21FBAC]">{hoveredInfo.index.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="opacity-50">COORD:</span>
                  <span>({hoveredInfo.col}, {hoveredInfo.row})</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="opacity-50">HEX:</span>
                  <span>{hoveredInfo.hex}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="opacity-50">STATUS:</span>
                  <span className={hoveredInfo.isLit ? "text-[#21FBAC]" : "opacity-40"}>
                    {hoveredInfo.isLit ? "HIGHLIGHTED" : "OFF"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Main Control Panel and Settings Dashboard */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left side: Playback & Settings Controls */}
            <div className="lg:col-span-7 bg-white/30 border border-black/5 rounded-md p-6 space-y-6">
              <div className="flex items-center gap-2 pb-3 border-b border-black/10">
                <Sliders className="w-4 h-4 opacity-70" />
                <h2 className="text-xs uppercase tracking-widest font-bold">Operational Controls</h2>
              </div>

              {/* Progress Scrubbing Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono font-medium">
                  <span className="opacity-60 uppercase tracking-wider">Sequential Scrubber</span>
                  <span className="text-[#2D2D2A] bg-white border border-black/10 px-2 py-0.5 rounded text-[10px]">
                    {activeIndex.toLocaleString()} / 9,130
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={TOTAL_DOTS - 1}
                  value={activeIndex}
                  onChange={(e) => setActiveIndex(parseInt(e.target.value, 10))}
                  className="w-full accent-[#2D2D2A] cursor-pointer h-1 bg-black/10 rounded-lg appearance-none"
                />
                <div className="flex justify-between text-[10px] font-mono opacity-50 px-1">
                  <span>0</span>
                  <span>2k</span>
                  <span>4k</span>
                  <span>6k</span>
                  <span>8k</span>
                  <span>9,131</span>
                </div>
              </div>

              {/* Main Playback Controls Button Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 bg-white border border-black/10 p-1 rounded-md shadow-sm">
                  <button
                    onClick={handlePrev}
                    title="Previous Dot"
                    className="p-2 hover:bg-black/5 active:bg-black/10 rounded transition-colors text-[#2D2D2A]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    title={isPlaying ? "Pause Stream" : "Start Stream"}
                    className="px-4 py-2 bg-[#2D2D2A] text-[#EFEFE7] hover:bg-black hover:scale-102 active:scale-98 transition-all font-mono text-xs font-bold rounded flex items-center gap-2 shadow-sm"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5 text-[#21FBAC]" />
                        <span>PAUSE</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-[#21FBAC] text-[#21FBAC]" />
                        <span>PLAY</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleNext}
                    title="Next Dot"
                    className="p-2 hover:bg-black/5 active:bg-black/10 rounded transition-colors text-[#2D2D2A]"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <div className="w-px h-6 bg-black/10 mx-1" />

                  <button
                    onClick={() => setActiveIndex(0)}
                    title="Reset to 0"
                    className="p-2 hover:bg-black/5 active:bg-black/10 rounded transition-colors text-black/60 hover:text-black"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                {/* Mode Selectors */}
                <div className="flex items-center bg-white border border-black/10 p-1 rounded-md shadow-sm text-xs font-mono">
                  <button
                    onClick={() => setMode('scan')}
                    className={`px-3 py-1.5 rounded transition-all ${
                      mode === 'scan'
                        ? 'bg-[#2D2D2A] text-[#EFEFE7] font-semibold'
                        : 'text-black/60 hover:text-black hover:bg-black/5'
                    }`}
                  >
                    Single Cursor
                  </button>
                  <button
                    onClick={() => setMode('trail')}
                    className={`px-3 py-1.5 rounded transition-all ${
                      mode === 'trail'
                        ? 'bg-[#2D2D2A] text-[#EFEFE7] font-semibold'
                        : 'text-black/60 hover:text-black hover:bg-black/5'
                    }`}
                  >
                    Progressive Trail
                  </button>
                </div>
              </div>

              {/* Speed Settings & audio sonification */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                
                {/* Speed Controls */}
                <div className="space-y-2.5">
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-black/50" />
                    <span>Progression Speed</span>
                  </label>
                  <div className="space-y-1.5">
                    <input
                      type="range"
                      min="10"
                      max="2000"
                      step="10"
                      value={speedMs}
                      onChange={(e) => setSpeedMs(parseInt(e.target.value, 10))}
                      className="w-full accent-[#2D2D2A] cursor-pointer h-1 bg-black/10 rounded-lg appearance-none"
                    />
                    <div className="flex justify-between text-[10px] font-mono opacity-50">
                      <span>10ms (Fast)</span>
                      <span>1.0s (Default)</span>
                      <span>2.0s</span>
                    </div>
                  </div>
                  {/* Speed presets */}
                  <div className="flex gap-1">
                    {[1000, 500, 100, 10].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setSpeedMs(preset)}
                        className={`flex-1 py-1 text-[9px] font-mono border rounded-sm transition-all ${
                          speedMs === preset
                            ? 'bg-[#2D2D2A] text-[#21FBAC] border-black/30 font-bold'
                            : 'bg-white border-black/10 text-black/60 hover:text-black hover:bg-black/5'
                        }`}
                      >
                        {preset === 10 ? 'Turbo' : `${preset}ms`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Extra Features / Auditory Feedback */}
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-widest font-bold opacity-60 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-black/50" />
                    <span>Auditory Feedback</span>
                  </label>
                  
                  <button
                    onClick={() => {
                      setAudioEnabled(!audioEnabled);
                      // Trigger audio activation beep
                      if (!audioEnabled) {
                        setTimeout(() => playBeep(activeIndex), 50);
                      }
                    }}
                    className={`w-full py-2 px-3 border rounded-md text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all ${
                      audioEnabled
                        ? 'bg-[#21FBAC]/20 border-[#21FBAC] text-[#2D2D2A] shadow-sm'
                        : 'bg-white border-black/10 text-black/60 hover:text-black hover:bg-black/5'
                    }`}
                  >
                    {audioEnabled ? (
                      <>
                        <Volume2 className="w-3.5 h-3.5 animate-bounce" />
                        <span>SONIFICATION: ON</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>SONIFICATION: OFF</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-[10px] font-mono bg-white/50 px-2 py-1.5 border border-black/5 rounded">
                    <span className="opacity-60">Auto-Loop Playlist</span>
                    <button
                      onClick={() => setLoopEnabled(!loopEnabled)}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        loopEnabled ? 'bg-[#21FBAC] text-black' : 'bg-black/10 text-black/50'
                      }`}
                    >
                      {loopEnabled ? 'LOOPING' : 'ONCE'}
                    </button>
                  </div>
                </div>

              </div>

            </div>

            {/* Right side: Realtime Telemetry Grid & Shortcuts */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Telemetry card */}
              <div className="bg-white/30 border border-black/5 rounded-md p-6 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-black/10">
                  <Activity className="w-4 h-4 opacity-70" />
                  <h2 className="text-xs uppercase tracking-widest font-bold">Realtime Telemetry</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/40 p-3 border border-black/5 rounded">
                    <p className="text-[10px] uppercase opacity-50 mb-0.5 font-semibold">Active Coordinates</p>
                    <p className="text-xl font-mono font-bold tracking-tight">
                      X: {activeCol} <span className="opacity-30">/</span> Y: {activeRow}
                    </p>
                  </div>
                  <div className="bg-white/40 p-3 border border-black/5 rounded">
                    <p className="text-[10px] uppercase opacity-50 mb-0.5 font-semibold">Index Value</p>
                    <p className="text-xl font-mono font-bold tracking-tight">
                      {activeIndex.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-white/40 p-3 border border-black/5 rounded">
                    <p className="text-[10px] uppercase opacity-50 mb-0.5 font-semibold">Row Completion</p>
                    <p className="text-xl font-mono font-bold tracking-tight">
                      {activePercent}%
                    </p>
                  </div>
                  <div className="bg-white/40 p-3 border border-black/5 rounded">
                    <p className="text-[10px] uppercase opacity-50 mb-0.5 font-semibold">Remaining Nodes</p>
                    <p className="text-xl font-mono font-bold tracking-tight">
                      {(TOTAL_DOTS - 1 - activeIndex).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Clean percentage status bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[10px] font-mono opacity-60">
                    <span>GRID COMPLETION</span>
                    <span>{activeIndex + 1} / {TOTAL_DOTS} DOTS</span>
                  </div>
                  <div className="w-full bg-black/10 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#21FBAC] h-full rounded-full transition-all duration-300 shadow-[0_0_8px_#21FBAC]"
                      style={{ width: `${activePercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Grid Jump / Teleport Shortcuts */}
              <div className="bg-white/30 border border-black/5 rounded-md p-6 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-black/10">
                  <Sparkles className="w-4 h-4 opacity-70" />
                  <h2 className="text-xs uppercase tracking-widest font-bold">Teleport Shortcuts</h2>
                </div>
                
                <p className="text-[10px] opacity-60 font-mono">
                  Instantly snap the visual scanning loop to specific benchmark indices:
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <button
                    onClick={() => jumpTo(0)}
                    className="p-2.5 bg-white border border-black/5 rounded hover:bg-black/5 hover:border-black/20 text-left transition-all"
                  >
                    <span className="block text-[9px] opacity-40 font-bold">STARTING POINT</span>
                    <span className="font-bold">Index 0 (Col 0, Row 0)</span>
                  </button>
                  <button
                    onClick={() => jumpTo(2000)}
                    className="p-2.5 bg-white border border-black/5 rounded hover:bg-black/5 hover:border-black/20 text-left transition-all"
                  >
                    <span className="block text-[9px] opacity-40 font-bold">MILESTONE 1</span>
                    <span className="font-bold">Index 2,000 (Row 10)</span>
                  </button>
                  <button
                    onClick={() => jumpTo(4000)}
                    className="p-2.5 bg-white border border-black/5 rounded hover:bg-black/5 hover:border-black/20 text-left transition-all"
                  >
                    <span className="block text-[9px] opacity-40 font-bold">MILESTONE 2</span>
                    <span className="font-bold">Index 4,000 (Row 20)</span>
                  </button>
                  <button
                    onClick={() => jumpTo(6000)}
                    className="p-2.5 bg-white border border-black/5 rounded hover:bg-black/5 hover:border-black/20 text-left transition-all"
                  >
                    <span className="block text-[9px] opacity-40 font-bold">MILESTONE 3</span>
                    <span className="font-bold">Index 6,000 (Row 30)</span>
                  </button>
                  <button
                    onClick={() => jumpTo(8000)}
                    className="p-2.5 bg-white border border-black/5 rounded hover:bg-black/5 hover:border-black/20 text-left transition-all"
                  >
                    <span className="block text-[9px] opacity-40 font-bold">MILESTONE 4</span>
                    <span className="font-bold">Index 8,000 (Row 40)</span>
                  </button>
                  <button
                    onClick={() => jumpTo(TOTAL_DOTS - 1)}
                    className="p-2.5 bg-white border border-[#21FBAC]/50 rounded hover:bg-[#21FBAC]/10 hover:border-[#21FBAC] text-left transition-all"
                  >
                    <span className="block text-[9px] text-[#2D2D2A]/60 font-bold">TERMINAL NODE</span>
                    <span className="font-bold text-[#2D2D2A]">Index 9,130 (Row 45)</span>
                  </button>
                </div>
              </div>

            </div>

          </section>

          {/* Operational Logic Description Section */}
          <section className="bg-white/20 border border-black/5 p-6 rounded-md">
            <h3 className="text-[10px] uppercase tracking-widest font-bold mb-3 border-b border-black/10 pb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-black/50" />
              <span>Operational Logic & Technical Architecture</span>
            </h3>
            <p className="text-xs leading-relaxed opacity-70">
              This sequential index visualization maps a discrete array of 9,131 data points across a uniform 200-column layout. 
              The 46 rows are filled sequentially from left to right, top to bottom. Because 9,131 is not a perfect multiple of 200, 
              the 46th row is populated with exactly 131 dots, leaving the final 69 spaces unrendered to visually enforce the 9,131 boundary logic.
              Use the Scrubber or Play/Pause controls to interact with the progressive scanning loop. Hover over any node to inspect real-time column, row, and hexadecimal coordinate telemetry.
            </p>
          </section>

        </main>

        {/* Footer */}
        <footer className="mt-auto flex flex-col sm:flex-row justify-between items-center py-6 border-t border-black/10 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#21FBAC] animate-pulse shadow-[0_0_6px_#21FBAC]" />
            <span className="text-[10px] uppercase tracking-widest font-bold font-mono">
              System Calibrated // Monitoring Port 9131 // Online
            </span>
          </div>
          <div className="text-[10px] font-mono opacity-40 uppercase tracking-wider">
            Grid_W_200 // Row_Limit_46 // Val_9131
          </div>
        </footer>

      </div>

      {/* Styled inline styling for serif fonts if Georgia fallback is not loaded */}
      <style>{`
        .serif {
          font-family: 'Georgia', 'Times New Roman', serif;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
