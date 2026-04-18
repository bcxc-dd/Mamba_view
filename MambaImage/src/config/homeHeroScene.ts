export type TextParticleConfig = {
  samplingStep: number;
  maxSamplingStep: number;
  maxParticles: number;
  particleRadius: number;
  particleRadiusJitter: number;
  linkDistance: number;
  maxLinksPerParticle: number;
  mouseRepelRadius: number;
  mouseForce: number;
  jitterAmplitude: number;
  wanderForce: number;
  springStrength: number;
  damping: number;
  alphaThreshold: number;
  maxDevicePixelRatio: number;
};

export type RadialBackgroundConfig = {
  rayCount: number;
  emissionPerSecond: number;
  spawnRadiusRatio: number;
  spawnRadiusJitterRatio: number;
  baseSpeed: number;
  speedVariance: number;
  acceleration: number;
  minLength: number;
  maxLength: number;
  minLineWidth: number;
  maxLineWidth: number;
  trailFade: number;
};

export const HOME_HERO_SCENE = {
  content: {
    text: "MAMBA",
    eyebrow: "Mamba View / Canvas Home",
    badge: "Static Text Particle Field",
    description:
      "全屏 Canvas 场景由背景空间放射线与前景文本粒子组成，鼠标接近时局部塌陷，移开后通过弹簧阻尼回位，并持续保持混沌抖动。",
  },
  particles: {
    samplingStep: 3,
    maxSamplingStep: 7,
    maxParticles: 3200,
    particleRadius: 1.25,
    particleRadiusJitter: 0.65,
    linkDistance: 18,
    maxLinksPerParticle: 3,
    mouseRepelRadius: 10,
    mouseForce: 5.8,
    jitterAmplitude: 5,
    wanderForce: 0.34,
    springStrength: 0.072,
    damping: 0.84,
    alphaThreshold: 140,
    maxDevicePixelRatio: 1.5,
  } satisfies TextParticleConfig,
  background: {
    rayCount: 180,
    emissionPerSecond: 95,
    spawnRadiusRatio:0.24,
    spawnRadiusJitterRatio: 0.016,
    baseSpeed: 0.35,
    speedVariance: 1.05,
    acceleration: 0.018,
    minLength: 18,
    maxLength: 82,
    minLineWidth: 0.4,
    maxLineWidth: 1.8,
    trailFade: 0.16,
  } satisfies RadialBackgroundConfig,
  stats: [
    {
      label: "Text",
      value: "MAMBA",
      note: "离屏采样后固定居中，不随背景位移。",
    },
    {
      label: "Density",
      value: "3 px / adaptive",
      note: "基础采样为 3，但会按粒子预算自动降密避免卡顿。",
    },
    {
      label: "Repel Radius",
      value: "80 px",
      note: "鼠标进入局部区域时触发强排斥塌陷。",
    },
    {
      label: "Chaos",
      value: "5 px",
      note: "布朗运动式抖动让文字持续处于活态。",
    },
  ],
} as const;
