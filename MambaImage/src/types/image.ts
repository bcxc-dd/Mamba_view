export type ModelType = "dwmamba" | "dwmamba_small" | "mambairv2";

export type UploadResponse = {
  image_id: string;
  filename: string;
  url: string;
};

export type SuperResolvePayload = {
  image_id: string;
  filename: string;
  model_type: ModelType;
};

export type InferenceResult = {
  modelType: ModelType;
  previewUrl: string;
  inferenceTime: string | null;
};

export type PerformanceTab = "processor" | "performance";

export type UploadedSourceMeta = {
  fileSizeBytes: number;
  fileSizeKB: number;
  imageWidth: number;
  imageHeight: number;
  pixelCount: number;
};

export type InferenceHistoryItem = {
  id: string;
  createdAt: string;
  modelType: ModelType;
  inferenceTimeSec: number;
  fileSizeBytes: number;
  fileSizeKB: number;
  imageWidth: number;
  imageHeight: number;
  pixelCount: number;
  imageId: string;
  filename: string;
};
