import { useEffect, useRef } from "react";
import type { TextParticleConfig } from "../config/homeHeroScene";

type TextParticleHeroProps = {
  text: string;
  config: TextParticleConfig;
};

type Particle = {
  targetX: number;
  targetY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  wanderX: number;
  wanderY: number;
  wanderVX: number;
  wanderVY: number;
  radius: number;
};

type PointerState = {
  x: number;
  y: number;
  active: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildParticleGradient(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
) {
  const phase = timeMs * 0.058;
  const hueA = (160 + phase) % 360;
  const hueB = (220 + phase * 1.08) % 360;
  const hueC = (275 + phase * 0.94) % 360;
  const hueD = (328 + phase * 1.12) % 360;
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsla(${hueA}, 86%, 60%, 0.96)`);
  gradient.addColorStop(0.35, `hsla(${hueB}, 90%, 60%, 0.96)`);
  gradient.addColorStop(0.68, `hsla(${hueC}, 85%, 62%, 0.96)`);
  gradient.addColorStop(1, `hsla(${hueD}, 88%, 64%, 0.96)`);
  return gradient;
}

function buildLinkColor(
  x: number,
  y: number,
  width: number,
  height: number,
  alpha: number,
  phase: number,
) {
  const hueFromX = (x / Math.max(1, width)) * 220;
  const hueFromY = (y / Math.max(1, height)) * 70;
  const hue = (hueFromX + hueFromY + 170 + phase) % 360;
  return `hsla(${hue}, 88%, 62%, ${alpha})`;
}

function buildFont(width: number, height: number, text: string) {
  const fontFamily =
    '"Avenir Next", "SF Pro Display", "Segoe UI", "PingFang SC", sans-serif';
  let fontSize = Math.min(width * 0.27, height * 0.28);

  const probeCanvas = document.createElement("canvas");
  const probeContext = probeCanvas.getContext("2d");

  if (!probeContext) {
    return `900 ${fontSize}px ${fontFamily}`;
  }

  probeContext.font = `900 ${fontSize}px ${fontFamily}`;
  while (probeContext.measureText(text).width > width * 0.8 && fontSize > 48) {
    fontSize -= 8;
    probeContext.font = `900 ${fontSize}px ${fontFamily}`;
  }

  return `900 ${fontSize}px ${fontFamily}`;
}

function buildParticles(
  width: number,
  height: number,
  text: string,
  config: TextParticleConfig,
): Particle[] {
  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = Math.max(1, Math.floor(width));
  offscreenCanvas.height = Math.max(1, Math.floor(height));

  const offscreenContext = offscreenCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!offscreenContext) {
    return [];
  }

  const font = buildFont(width, height, text);
  const centerX = width / 2;
  const centerY = height / 2;

  offscreenContext.clearRect(0, 0, width, height);
  offscreenContext.fillStyle = "#ffffff";
  offscreenContext.textAlign = "center";
  offscreenContext.textBaseline = "middle";
  offscreenContext.font = font;
  offscreenContext.fillText(text, centerX, centerY);

  const imageData = offscreenContext.getImageData(0, 0, width, height).data;
  const collectParticles = (step: number) => {
    const nextParticles: Particle[] = [];

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const alphaIndex = (y * width + x) * 4 + 3;
        if (imageData[alphaIndex] < config.alphaThreshold) {
          continue;
        }

        const radius =
          config.particleRadius + (Math.random() - 0.5) * config.particleRadiusJitter;

        nextParticles.push({
          targetX: x,
          targetY: y,
          x: x + (Math.random() - 0.5) * config.jitterAmplitude * 4,
          y: y + (Math.random() - 0.5) * config.jitterAmplitude * 4,
          vx: 0,
          vy: 0,
          wanderX: 0,
          wanderY: 0,
          wanderVX: 0,
          wanderVY: 0,
          radius: clamp(radius, 0.8, 2.2),
        });
      }
    }

    return nextParticles;
  };

  let step = config.samplingStep;
  let particles = collectParticles(step);

  while (particles.length > config.maxParticles && step < config.maxSamplingStep) {
    step += 1;
    particles = collectParticles(step);
  }

  return particles;
}

export function TextParticleHero({ text, config }: TextParticleHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const pointer: PointerState = {
      x: -9999,
      y: -9999,
      active: false,
    };

    let particles: Particle[] = [];
    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    let devicePixelRatioValue = 1;
    let particleGradient: CanvasGradient | string = "rgba(59, 130, 246, 0.96)";
    let previousTime = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      devicePixelRatioValue = Math.min(
        window.devicePixelRatio || 1,
        config.maxDevicePixelRatio,
      );

      canvas.width = Math.floor(width * devicePixelRatioValue);
      canvas.height = Math.floor(height * devicePixelRatioValue);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.setTransform(devicePixelRatioValue, 0, 0, devicePixelRatioValue, 0, 0);
      particles = buildParticles(width, height, text, config);
      particleGradient = buildParticleGradient(context, width, height, performance.now());
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
      pointer.x = -9999;
      pointer.y = -9999;
    };

    const drawFrame = (time: number) => {
      if (previousTime === 0) {
        previousTime = time;
      }
      const delta = Math.min((time - previousTime) / 16.6667, 1.8);
      previousTime = time;
      const colorPhase = time * 0.012;
      particleGradient = buildParticleGradient(context, width, height, time);

      context.clearRect(0, 0, width, height);

      const spatialGrid = new Map<string, number[]>();
      const cellSize = config.linkDistance;

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];

        particle.wanderVX += (Math.random() - 0.5) * config.wanderForce * delta;
        particle.wanderVY += (Math.random() - 0.5) * config.wanderForce * delta;
        particle.wanderVX *= 0.92;
        particle.wanderVY *= 0.92;

        particle.wanderX = clamp(
          particle.wanderX + particle.wanderVX,
          -config.jitterAmplitude,
          config.jitterAmplitude,
        );
        particle.wanderY = clamp(
          particle.wanderY + particle.wanderVY,
          -config.jitterAmplitude,
          config.jitterAmplitude,
        );

        let forceX =
          (particle.targetX + particle.wanderX - particle.x) *
          config.springStrength *
          delta;
        let forceY =
          (particle.targetY + particle.wanderY - particle.y) *
          config.springStrength *
          delta;

        if (pointer.active) {
          const deltaX = particle.x - pointer.x;
          const deltaY = particle.y - pointer.y;
          const distance = Math.hypot(deltaX, deltaY) || 0.0001;

          if (distance < config.mouseRepelRadius) {
            const influence = 1 - distance / config.mouseRepelRadius;
            const repelForce = influence * influence * config.mouseForce;
            forceX += (deltaX / distance) * repelForce * 10 * delta;
            forceY += (deltaY / distance) * repelForce * 10 * delta;
          }
        }

        particle.vx = (particle.vx + forceX) * config.damping;
        particle.vy = (particle.vy + forceY) * config.damping;
        particle.x += particle.vx;
        particle.y += particle.vy;

        const column = Math.floor(particle.x / cellSize);
        const row = Math.floor(particle.y / cellSize);
        const key = `${column}:${row}`;
        const bucket = spatialGrid.get(key);

        if (bucket) {
          bucket.push(index);
        } else {
          spatialGrid.set(key, [index]);
        }
      }

      context.lineWidth = 0.6;

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const column = Math.floor(particle.x / cellSize);
        const row = Math.floor(particle.y / cellSize);
        let linkCount = 0;

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const neighborKey = `${column + offsetX}:${row + offsetY}`;
            const bucket = spatialGrid.get(neighborKey);

            if (!bucket) {
              continue;
            }

            for (let bucketIndex = 0; bucketIndex < bucket.length; bucketIndex += 1) {
              const neighborIndex = bucket[bucketIndex];
              if (neighborIndex <= index) {
                continue;
              }

              const neighbor = particles[neighborIndex];
              const deltaX = neighbor.x - particle.x;
              const deltaY = neighbor.y - particle.y;
              const distance = Math.hypot(deltaX, deltaY);

              if (distance >= config.linkDistance) {
                continue;
              }

              const alpha = (1 - distance / config.linkDistance) * 0.3;
              context.strokeStyle = buildLinkColor(
                (particle.x + neighbor.x) / 2,
                (particle.y + neighbor.y) / 2,
                width,
                height,
                alpha * 0.78,
                colorPhase,
              );
              context.beginPath();
              context.moveTo(particle.x, particle.y);
              context.lineTo(neighbor.x, neighbor.y);
              context.stroke();
              linkCount += 1;

              if (linkCount >= config.maxLinksPerParticle) {
                break;
              }
            }

            if (linkCount >= config.maxLinksPerParticle) {
              break;
            }
          }

          if (linkCount >= config.maxLinksPerParticle) {
            break;
          }
        }
      }

      context.fillStyle = particleGradient;
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const size = particle.radius * 2;
        context.fillRect(particle.x - particle.radius, particle.y - particle.radius, size, size);
      }

      animationFrameId = window.requestAnimationFrame(drawFrame);
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("blur", handlePointerLeave);

    resize();
    animationFrameId = window.requestAnimationFrame(drawFrame);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("blur", handlePointerLeave);
    };
  }, [config, text]);

  return (
    <div className="particle-hero" aria-hidden="true">
      <canvas ref={canvasRef} className="particle-hero-canvas" />
    </div>
  );
}
