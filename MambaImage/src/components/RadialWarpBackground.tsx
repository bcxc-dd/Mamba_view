import { useEffect, useRef } from "react";
import type { RadialBackgroundConfig } from "../config/homeHeroScene";

type RadialWarpBackgroundProps = {
  config: RadialBackgroundConfig;
};

type Ray = {
  angle: number;
  radius: number;
  speed: number;
  maxLength: number;
  lineWidth: number;
  alpha: number;
  age: number;
};

const COLOR_VARIABLES = {
  background: "--scene-bg-rgb",
} as const;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function buildRay(
  config: RadialBackgroundConfig,
  maxRadius: number,
  spawnRadius: number,
  spawnJitter: number,
  distributed = false,
): Ray {
  const initialRadius = distributed
    ? randomBetween(spawnRadius, maxRadius * 0.98)
    : Math.max(0, spawnRadius + randomBetween(-spawnJitter, spawnJitter));

  return {
    angle: Math.random() * Math.PI * 2,
    radius: initialRadius,
    speed: config.baseSpeed + Math.random() * config.speedVariance,
    maxLength: randomBetween(config.minLength, config.maxLength),
    lineWidth: randomBetween(config.minLineWidth, config.maxLineWidth),
    alpha: randomBetween(0.08, 0.35),
    age: 0,
  };
}

function readCanvasPalette() {
  const styles = getComputedStyle(document.documentElement);
  const backgroundRgb =
    styles.getPropertyValue(COLOR_VARIABLES.background).trim() || "5, 10, 18";

  return { backgroundRgb };
}

function buildRayColor(ray: Ray, maxRadius: number, alpha: number, timeMs: number) {
  const angleRatio = ray.angle / (Math.PI * 2);
  const radiusRatio = Math.min(1, ray.radius / Math.max(1, maxRadius));
  const phase = timeMs * 0.34;
  const hue = (160 + angleRatio * 210 + radiusRatio * 36 + phase) % 360;

  return `hsla(${hue}, 88%, 64%, ${alpha})`;
}

export function RadialWarpBackground({ config }: RadialWarpBackgroundProps) {
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

    const rays: Ray[] = [];
    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    let maxRadius = 0;
    let spawnRadius = 0;
    let spawnJitter = 0;
    let devicePixelRatioValue = 1;
    let palette = readCanvasPalette();
    let previousTime = 0;
    let emissionCarry = 0;

    const syncPalette = () => {
      palette = readCanvasPalette();
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      maxRadius = Math.hypot(width, height) * 0.72;
      spawnRadius = Math.max(
        16,
        Math.min(width, height) * config.spawnRadiusRatio,
      );
      spawnJitter = Math.max(
        2,
        Math.min(width, height) * config.spawnRadiusJitterRatio,
      );
      devicePixelRatioValue = window.devicePixelRatio || 1;

      canvas.width = Math.floor(width * devicePixelRatioValue);
      canvas.height = Math.floor(height * devicePixelRatioValue);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.setTransform(devicePixelRatioValue, 0, 0, devicePixelRatioValue, 0, 0);
      context.fillStyle = `rgb(${palette.backgroundRgb})`;
      context.fillRect(0, 0, width, height);

      rays.length = 0;
      for (let index = 0; index < Math.floor(config.rayCount * 0.55); index += 1) {
        rays.push(buildRay(config, maxRadius, spawnRadius, spawnJitter, true));
      }
      previousTime = 0;
      emissionCarry = 0;
    };

    const drawFrame = (time: number) => {
      if (previousTime === 0) {
        previousTime = time;
      }
      const deltaSeconds = Math.min((time - previousTime) / 1000, 0.05);
      const deltaFrames = deltaSeconds * 60;
      previousTime = time;

      emissionCarry += config.emissionPerSecond * deltaSeconds;
      while (emissionCarry >= 1 && rays.length < config.rayCount) {
        rays.push(buildRay(config, maxRadius, spawnRadius, spawnJitter));
        emissionCarry -= 1;
      }

      context.fillStyle = `rgba(${palette.backgroundRgb}, ${config.trailFade})`;
      context.fillRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;

      context.save();
      context.translate(centerX, centerY);
      context.lineCap = "round";
      context.lineJoin = "round";

      for (let index = rays.length - 1; index >= 0; index -= 1) {
        const ray = rays[index];
        const previousRadius = ray.radius;
        ray.age += deltaFrames;
        ray.speed += config.acceleration * deltaFrames;
        ray.radius += ray.speed * deltaFrames;

        const outwardProgress = Math.min(1, ray.radius / Math.max(1, maxRadius));
        const growProgress = Math.min(1, ray.age / 12);
        const shrinkProgress = 1 - Math.max(0, (outwardProgress - 0.54) / 0.46);
        const currentLength = ray.maxLength * Math.max(0, growProgress * shrinkProgress);

        if (ray.radius - currentLength > maxRadius) {
          rays.splice(index, 1);
          continue;
        }

        const tailRadius = Math.max(0, ray.radius - currentLength);
        const startX = Math.cos(ray.angle) * tailRadius;
        const startY = Math.sin(ray.angle) * tailRadius * 1.1;
        const endX = Math.cos(ray.angle) * ray.radius;
        const endY = Math.sin(ray.angle) * ray.radius * 1.1;
        const motionAlpha = Math.min(0.52, ray.alpha + previousRadius / maxRadius / 4);

        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.lineWidth = ray.lineWidth;
        context.strokeStyle = buildRayColor(ray, maxRadius, motionAlpha * 0.88, time);
        context.stroke();
      }

      context.restore();
      animationFrameId = window.requestAnimationFrame(drawFrame);
    };

    const schemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    schemeMedia.addEventListener("change", syncPalette);
    window.addEventListener("resize", resize);

    resize();
    animationFrameId = window.requestAnimationFrame(drawFrame);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      schemeMedia.removeEventListener("change", syncPalette);
    };
  }, [config]);

  return <canvas ref={canvasRef} className="radial-scene-background" aria-hidden="true" />;
}
