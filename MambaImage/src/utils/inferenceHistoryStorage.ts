import type { InferenceHistoryItem } from "../types/image";

export const INFERENCE_HISTORY_STORAGE_KEY = "mamba_inference_history_v1";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeItem(value: unknown): InferenceHistoryItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<InferenceHistoryItem>;

  if (
    typeof item.id !== "string" ||
    typeof item.createdAt !== "string" ||
    typeof item.modelType !== "string" ||
    typeof item.imageId !== "string" ||
    typeof item.filename !== "string" ||
    !isFiniteNumber(item.inferenceTimeSec) ||
    !isFiniteNumber(item.fileSizeBytes) ||
    !isFiniteNumber(item.fileSizeKB) ||
    !isFiniteNumber(item.imageWidth) ||
    !isFiniteNumber(item.imageHeight) ||
    !isFiniteNumber(item.pixelCount)
  ) {
    return null;
  }

  return {
    id: item.id,
    createdAt: item.createdAt,
    modelType: item.modelType,
    inferenceTimeSec: item.inferenceTimeSec,
    fileSizeBytes: item.fileSizeBytes,
    fileSizeKB: item.fileSizeKB,
    imageWidth: item.imageWidth,
    imageHeight: item.imageHeight,
    pixelCount: item.pixelCount,
    imageId: item.imageId,
    filename: item.filename,
  };
}

export function loadInferenceHistory(): InferenceHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(INFERENCE_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const sanitized = parsed
      .map((item) => sanitizeItem(item))
      .filter((item): item is InferenceHistoryItem => item !== null);

    return sanitized.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function saveInferenceHistory(items: InferenceHistoryItem[]) {
  try {
    window.localStorage.setItem(INFERENCE_HISTORY_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota or private mode errors
  }
}

export function clearInferenceHistory() {
  try {
    window.localStorage.removeItem(INFERENCE_HISTORY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

const MODEL_MULTIPLIER = {
  dwmamba: 1,
  dwmamba_small: 0.72,
  mambairv2: 1.25,
} as const;

export function generateMockInferenceHistory(perModelCount = 10): InferenceHistoryItem[] {
  const modelTypes = ["dwmamba", "dwmamba_small", "mambairv2"] as const;
  const now = Date.now();
  const records: InferenceHistoryItem[] = [];

  for (const modelType of modelTypes) {
    for (let index = 0; index < perModelCount; index += 1) {
      const width = 640 + index * 160;
      const height = 360 + index * 90;
      const pixelCount = width * height;
      const fileSizeKB = randomBetween(90, 340) + index * 40;
      const inferenceTimeSec =
        (fileSizeKB / 220) * MODEL_MULTIPLIER[modelType] + randomBetween(0.04, 0.22);
      const createdAt = new Date(now - (index * 3 + (modelType === "mambairv2" ? 1 : 0)) * 60000)
        .toISOString();

      records.push({
        id: `mock-${modelType}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt,
        modelType,
        inferenceTimeSec: Number(inferenceTimeSec.toFixed(4)),
        fileSizeBytes: Math.round(fileSizeKB * 1024),
        fileSizeKB: Number(fileSizeKB.toFixed(2)),
        imageWidth: width,
        imageHeight: height,
        pixelCount,
        imageId: `mock-image-${index}`,
        filename: `mock_${width}x${height}_${index}.png`,
      });
    }
  }

  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
