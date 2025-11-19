"use client";

import {
  CSSProperties,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type UseOrbVisualizerParams = {
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  orbState: "listening" | "speaking" | "thinking" | "idle";
};

type UseOrbVisualizerResult = {
  orbCanvasRef: RefObject<HTMLCanvasElement>;
  poppyImageRef: RefObject<HTMLDivElement>;
  auraStyle: CSSProperties;
  innerOrbStyle: CSSProperties;
  startVisualizer: (audio: HTMLAudioElement) => Promise<void>;
  stopVisualizer: () => void;
};

const DEFAULT_LEVELS = { bass: 0, mid: 0, treble: 0 };

export default function useOrbVisualizer({
  isSpeaking,
  isListening,
  isThinking,
  orbState,
}: UseOrbVisualizerParams): UseOrbVisualizerResult {
  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const poppyImageRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const orbCanvasRafRef = useRef<number | null>(null);
  const poppyMotionRafRef = useRef<number | null>(null);
  const waveformDataRef = useRef<Float32Array | null>(null);
  const [orbAudioLevels, setOrbAudioLevels] = useState(DEFAULT_LEVELS);
  const orbAudioLevelsRef = useRef(orbAudioLevels);

  useEffect(() => {
    orbAudioLevelsRef.current = orbAudioLevels;
  }, [orbAudioLevels]);

  const stopVisualizer = useCallback(() => {
    if (typeof window !== "undefined" && analyserFrameRef.current !== null) {
      window.cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch (err) {
        console.warn("Audio source disconnect failed", err);
      }
      audioSourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch (err) {
        console.warn("Analyser disconnect failed", err);
      }
      analyserRef.current = null;
    }
    setOrbAudioLevels(DEFAULT_LEVELS);
    waveformDataRef.current = null;
  }, []);

  const startVisualizer = useCallback(
    async (audio: HTMLAudioElement) => {
      if (typeof window === "undefined") return;
      const AudioCtx = (window.AudioContext ||
        (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!AudioCtx) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      try {
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
      } catch (err) {
        console.warn("AudioContext resume failed", err);
      }

      stopVisualizer();

      try {
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyser.connect(ctx.destination);

        audioSourceRef.current = source;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const update = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          const pickAverage = (start: number, end: number) => {
            const clampedStart = Math.max(0, start);
            const clampedEnd = Math.min(dataArray.length, end);
            const length = Math.max(clampedEnd - clampedStart, 1);
            let sum = 0;
            for (let i = clampedStart; i < clampedEnd; i++) {
              sum += dataArray[i] || 0;
            }
            return sum / length / 255;
          };

          const bass = pickAverage(0, Math.floor(dataArray.length * 0.1));
          const mid = pickAverage(
            Math.floor(dataArray.length * 0.1),
            Math.floor(dataArray.length * 0.4)
          );
          const treble = pickAverage(
            Math.floor(dataArray.length * 0.4),
            Math.floor(dataArray.length * 0.8)
          );

          setOrbAudioLevels((prev) => ({
            bass: prev.bass * 0.65 + bass * 0.35,
            mid: prev.mid * 0.65 + mid * 0.35,
            treble: prev.treble * 0.65 + treble * 0.35,
          }));

          const desiredPoints = 96;
          if (
            !waveformDataRef.current ||
            waveformDataRef.current.length !== desiredPoints
          ) {
            waveformDataRef.current = new Float32Array(desiredPoints);
          }
          const stride = Math.max(
            1,
            Math.floor(dataArray.length / waveformDataRef.current.length)
          );
          for (let i = 0; i < waveformDataRef.current.length; i++) {
            const idx = Math.min(dataArray.length - 1, i * stride);
            waveformDataRef.current[i] = (dataArray[idx] || 0) / 255;
          }

          if (typeof window !== "undefined") {
            analyserFrameRef.current = window.requestAnimationFrame(update);
          }
        };

        update();
      } catch (err) {
        console.warn("Visualizer setup failed", err);
      }
    },
    [stopVisualizer]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const wrapper = poppyImageRef.current;
    if (!wrapper) return;

    const stopMotion = () => {
      if (poppyMotionRafRef.current !== null) {
        window.cancelAnimationFrame(poppyMotionRafRef.current);
        poppyMotionRafRef.current = null;
      }
    };

    const resetTransform = () => {
      wrapper.style.transform = "translate(-50%, -50%) scale(0.95)";
    };

    if (!isSpeaking) {
      stopMotion();
      resetTransform();
      return;
    }

    const animate = (timestamp: number) => {
      const t = timestamp / 1000;
      const levels = orbAudioLevelsRef.current;
      const audioEnergy =
        levels.bass * 0.4 + levels.mid * 0.45 + levels.treble * 0.25;
      const breathing = 0.95 + Math.sin(t * 1.35) * 0.045;
      const shimmer = Math.sin(t * 3.2) * 0.02;
      const audioSwing = (audioEnergy - 0.35) * 1.1;
      const responsiveScale = breathing + shimmer + audioSwing;
      const clampedScale = Math.min(Math.max(responsiveScale, 0.78), 1.32);
      wrapper.style.transform = `translate(-50%, -50%) scale(${clampedScale})`;
      poppyMotionRafRef.current = window.requestAnimationFrame(animate);
    };

    poppyMotionRafRef.current = window.requestAnimationFrame(animate);

    return () => {
      stopMotion();
      resetTransform();
    };
  }, [isSpeaking]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const draw = () => {
      const canvas = orbCanvasRef.current;
      if (!canvas) {
        orbCanvasRafRef.current = window.requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        orbCanvasRafRef.current = window.requestAnimationFrame(draw);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth * dpr;
      const height = canvas.clientHeight * dpr;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);

      const waveform = waveformDataRef.current;
      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = Math.min(width, height) / 2 - 6;

      const levels = orbAudioLevelsRef.current;
      const timeFactor = performance.now() * 0.002;
      const hueBase = 250 + levels.treble * 80;
      const strokeGradient = ctx.createLinearGradient(0, 0, width, height);
      strokeGradient.addColorStop(
        0,
        `hsla(${hueBase}, 90%, ${60 + levels.mid * 25}%, 0.95)`
      );
      strokeGradient.addColorStop(
        0.5,
        `hsla(${hueBase + 30}, 100%, ${50 + levels.bass * 30}%, 0.9)`
      );
      strokeGradient.addColorStop(
        1,
        `hsla(${hueBase + 70}, 95%, ${55 + levels.treble * 20}%, 0.85)`
      );
      const fillGradient = ctx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.4,
        cx,
        cy,
        baseRadius * 1.2
      );
      fillGradient.addColorStop(
        0,
        `hsla(${hueBase + 20}, 95%, ${65 + levels.mid * 20}%, 0.22)`
      );
      fillGradient.addColorStop(
        1,
        `hsla(${hueBase + 50}, 70%, ${40 + levels.bass * 25}%, 0.05)`
      );
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = strokeGradient;
      ctx.shadowBlur = 35 + levels.mid * 60;
      ctx.shadowColor = `hsla(${hueBase}, 90%, 65%, ${
        0.35 + levels.mid * 0.6
      })`;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.beginPath();
      const sampleCount = waveform ? waveform.length : 0;
      if (sampleCount > 0) {
        for (let i = 0; i <= sampleCount; i++) {
          const pct = i / sampleCount;
          const angle = pct * Math.PI * 2;
          const magnitude = waveform![i % sampleCount] || 0;
          const noise =
            Math.sin(pct * Math.PI * 6 + timeFactor) * 3 * levels.mid;
          const radius =
            baseRadius +
            magnitude * 38 +
            noise +
            Math.sin(pct * Math.PI * 2) * 4 * levels.bass;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = fillGradient;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.stroke();
      }

      orbCanvasRafRef.current = window.requestAnimationFrame(draw);
    };

    orbCanvasRafRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (orbCanvasRafRef.current !== null) {
        window.cancelAnimationFrame(orbCanvasRafRef.current);
        orbCanvasRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      stopVisualizer();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (typeof window !== "undefined" && poppyMotionRafRef.current !== null) {
        window.cancelAnimationFrame(poppyMotionRafRef.current);
        poppyMotionRafRef.current = null;
      }
    };
  }, [stopVisualizer]);

  const innerOrbStyle = useMemo(() => {
    const baseOrbScale = isListening
      ? 1.1
      : isSpeaking
      ? 1.05
      : isThinking
      ? 1.03
      : 1;
    const audioScale =
      isSpeaking && orbAudioLevels.bass > 0
        ? 1 + orbAudioLevels.bass * 0.08
        : 1;
    return {
      transform: `scale(${baseOrbScale * audioScale})`,
      boxShadow: `0 0 ${40 + orbAudioLevels.mid * 90}px rgba(126,132,242,${
        0.3 + orbAudioLevels.mid * 0.65
      })`,
      borderColor: `rgba(242,232,220,${0.18 + orbAudioLevels.treble * 0.7})`,
      filter: `saturate(${1 + orbAudioLevels.treble * 0.5})`,
    };
  }, [isListening, isSpeaking, isThinking, orbAudioLevels]);

  const auraStyle = useMemo(() => {
    return {
      opacity:
        orbState === "speaking"
          ? 0.55 + orbAudioLevels.mid * 0.35
          : orbState === "thinking"
          ? 0.45
          : 0.35,
      transform:
        orbState === "speaking"
          ? `scale(${1 + orbAudioLevels.bass * 0.12})`
          : undefined,
    };
  }, [orbState, orbAudioLevels]);

  return {
    orbCanvasRef,
    poppyImageRef,
    auraStyle,
    innerOrbStyle,
    startVisualizer,
    stopVisualizer,
  };
}
