import mamba1Url from "../assets/mamba1.png";
import mamba2Url from "../assets/mamba2.png";
import type {
  ModelType,
  SuperResolvePayload,
  UploadResponse,
} from "../types/image";

export const USE_MOCK = true;

const MODEL_MOCK_CONFIG: Record<
  ModelType,
  { assetUrl: string; inferenceTime: string }
> = {
  dwmamba: { assetUrl: mamba2Url, inferenceTime: "0.8421" },
  dwmamba_small: { assetUrl: mamba1Url, inferenceTime: "0.5314" },
  mambairv2: { assetUrl: mamba2Url, inferenceTime: "1.1037" },
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

export async function uploadImage(file: File): Promise<UploadResponse> {
  if (USE_MOCK) {
    return mockUploadImage(file);
  }

  return requestUploadImage(file);

  /*
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
  */
}

export async function superResolveImage(payload: SuperResolvePayload): Promise<{
  blob: Blob;
  inferenceTime: string;
}> {
  if (USE_MOCK) {
    return mockSuperResolve(payload.model_type);
  }

  return requestSuperResolveImage(payload);

  /*
  const response = await fetch("/api/super_resolve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_id: uploadedImage.image_id,
      filename: uploadedImage.filename,
      model_type: modelType,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return {
    blob: await response.blob(),
    inferenceTime: response.headers.get("X-Inference-Time-S") ?? "",
  };
  */
}

async function requestUploadImage(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}

async function requestSuperResolveImage(payload: SuperResolvePayload): Promise<{
  blob: Blob;
  inferenceTime: string;
}> {
  const response = await fetch("/api/super_resolve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return {
    blob: await response.blob(),
    inferenceTime: response.headers.get("X-Inference-Time-S") ?? "",
  };
}

async function mockUploadImage(file: File): Promise<UploadResponse> {
  await sleep(500);

  const extension = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf("."))
    : ".png";
  const imageId = crypto.randomUUID();

  return {
    image_id: imageId,
    filename: `${imageId}${extension}`,
    url: URL.createObjectURL(file),
  };
}

async function mockSuperResolve(modelType: ModelType): Promise<{
  blob: Blob;
  inferenceTime: string;
}> {
  const config = MODEL_MOCK_CONFIG[modelType];

  await sleep(700);

  const response = await fetch(config.assetUrl);
  if (!response.ok) {
    throw new Error("模拟超分结果加载失败");
  }

  return {
    blob: await response.blob(),
    inferenceTime: config.inferenceTime,
  };
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    const data = (await response.json()) as { detail?: string };
    return data.detail || "请求失败";
  }

  return (await response.text()) || "请求失败";
}

/*
export const USE_MOCK = true;

export async function uploadImage(file: File): Promise<UploadResponse> {
  return mockUploadImage(file);
}

export async function superResolveImage(payload: SuperResolvePayload): Promise<{
  blob: Blob;
  inferenceTime: string;
}> {
  return mockSuperResolve(payload.model_type);
}
*/
