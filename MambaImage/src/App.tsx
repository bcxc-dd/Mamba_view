import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Pagination, Select, Upload, message, Radio, Slider, Switch } from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import "./App.css";
import "img-comparison-slider";
import { superResolveImage, uploadImage, USE_MOCK } from "./api/imageApi";
import type {
  InferenceResult,
  ModelType,
  UploadResponse,
} from "./types/image";

const MODEL_OPTIONS: Array<{ label: string; value: ModelType }> = [
  { label: "DWMamba 标准版", value: "dwmamba" },
  { label: "DWMamba 轻量版", value: "dwmamba_small" },
  { label: "MambaIRv2", value: "mambairv2" },
];

function App() {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("");
  const [selectedModels, setSelectedModels] = useState<ModelType[]>(["dwmamba"]);
  const [results, setResults] = useState<InferenceResult[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<UploadResponse | null>(null);
  const [viewMode, setViewMode] = useState<"single" | "compare">("single");
  const [lensPosition, setLensPosition] = useState<{ x: number; y: number; bgHeight: number; bgWidth: number } | null>(null);
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 18;
  const [zoomFactor, setZoomFactor] = useState<number>(3);
  const [fullImageZoom, setFullImageZoom] = useState<boolean>(false);
  const comparisonRef = useRef<HTMLElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sourceObjectUrlRef = useRef<string | null>(null);
  const uploadRequestIdRef = useRef(0);

  const currentResult = results[currentPage - 1] ?? null;
  const resultPreviewUrl = currentResult?.previewUrl ?? "";
  const inferenceTime = currentResult?.inferenceTime ?? null;

  const canCompare = useMemo(
    () => sourcePreviewUrl.length > 0 && resultPreviewUrl.length > 0,
    [sourcePreviewUrl, resultPreviewUrl],
  );

  useEffect(() => {
    if (!resultPreviewUrl || !comparisonRef.current) {
      return;
    }

    const slider = comparisonRef.current as HTMLElement & { value?: number };

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const setSliderValue = (value: number) => {
      slider.value = value;
      slider.setAttribute("value", String(value));
    };

    const animatePhase = (
      from: number,
      to: number,
      duration: number,
      onComplete?: () => void,
    ) => {
      let startTime: number | null = null;

      const step = (time: number) => {
        if (startTime === null) {
          startTime = time;
        }

        const progress = Math.min((time - startTime) / duration, 1);
        const nextValue = from + (to - from) * progress;
        setSliderValue(nextValue);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(step);
          return;
        }

        if (onComplete) {
          onComplete();
        }
      };

      animationFrameRef.current = requestAnimationFrame(step);
    };

    setSliderValue(100);
    animatePhase(100, 0, 1200, () => {
      animatePhase(0, 50, 1000);
    });

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [resultPreviewUrl]);

  useEffect(() => {
    return () => {
      if (sourceObjectUrlRef.current) {
        URL.revokeObjectURL(sourceObjectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      results.forEach((result) => {
        URL.revokeObjectURL(result.previewUrl);
      });
    };
  }, [results]);

  const clearResults = () => {
    setResults((previousResults) => {
      previousResults.forEach((result) => {
        URL.revokeObjectURL(result.previewUrl);
      });
      return [];
    });
    setCurrentPage(1);
  };

  /*
  const uploadImage = async (file: File): Promise<UploadResponse> => {
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
  };
  */

  const handleFileChange = async (files: UploadFile[]) => {
    setFileList(files.slice(-1));
    clearResults();
    setUploadedImage(null);

    const rawFile = files[0]?.originFileObj;
    if (!rawFile) {
      uploadRequestIdRef.current += 1;
      setUploading(false);

      if (sourceObjectUrlRef.current) {
        URL.revokeObjectURL(sourceObjectUrlRef.current);
        sourceObjectUrlRef.current = null;
      }
      setSourcePreviewUrl("");
      return;
    }

    if (sourceObjectUrlRef.current) {
      URL.revokeObjectURL(sourceObjectUrlRef.current);
    }

    const objectUrl = URL.createObjectURL(rawFile);
    sourceObjectUrlRef.current = objectUrl;
    setSourcePreviewUrl(objectUrl);

    const requestId = uploadRequestIdRef.current + 1;
    uploadRequestIdRef.current = requestId;
    setUploading(true);

    try {
      const imageMeta = await uploadImage(rawFile);
      if (uploadRequestIdRef.current !== requestId) {
        return;
      }

      setUploadedImage(imageMeta);
      message.success(
        USE_MOCK
          ? "图片已完成本地 mock 上传，可选择多个模型开始超分"
          : "图片已上传到后端，可选择多个模型开始超分",
      );
    } catch (error) {
      if (uploadRequestIdRef.current !== requestId) {
        return;
      }

      const text = error instanceof Error ? error.message : "未知错误";
      message.error(`上传失败: ${text}`);
    } finally {
      if (uploadRequestIdRef.current === requestId) {
        setUploading(false);
      }
    }
  };

  const handleProcess = async () => {
    if (!fileList[0]?.originFileObj) {
      message.warning("请先上传一张图片");
      return;
    }

    if (!uploadedImage) {
      message.warning("图片仍在上传中，请稍后再试");
      return;
    }

    if (selectedModels.length === 0) {
      message.warning("请至少选择一个模型");
      return;
    }

    setProcessing(true);
    clearResults();

    try {
      const nextResults: InferenceResult[] = [];
      const failedModels: string[] = [];

      for (const modelType of selectedModels) {
        try {
          const { blob, inferenceTime: nextInferenceTime } =
            await superResolveImage({
              image_id: uploadedImage.image_id,
              filename: uploadedImage.filename,
              model_type: modelType,
            });
          const imageBlob = blob;
          const imageUrl = URL.createObjectURL(imageBlob);

          nextResults.push({
            modelType,
            previewUrl: imageUrl,
            inferenceTime: nextInferenceTime,
          });
        } catch (error) {
          const text = error instanceof Error ? error.message : "未知错误";
          failedModels.push(`${modelType}: ${text}`);
        }
      }

      setResults(nextResults);
      setCurrentPage(1);

      if (nextResults.length > 0) {
        const successText =
          nextResults.length === 1
            ? "超分完成，可拖动滑块查看对比"
            : `已完成 ${nextResults.length} 个模型的超分结果`;
        message.success(successText);
      }

      if (failedModels.length > 0) {
        message.warning(`部分模型处理失败：${failedModels.join("；")}`);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "未知错误";
      message.error(`处理失败: ${text}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const container = target.querySelector(".magnifier-container") as HTMLElement;
    const img = container?.querySelector("img");
    if (!img || !container) return;

    const rect = img.getBoundingClientRect();
    const bgX = ((e.clientX - rect.left) / rect.width) * 100;
    const bgY = ((e.clientY - rect.top) / rect.height) * 100;

    if (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    ) {
      setLensPosition({ x: bgX, y: bgY, bgWidth: rect.width, bgHeight: rect.height });
    } else {
      setLensPosition(null);
    }
  };

  const handleMouseLeave = () => {
    setLensPosition(null);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Mamba</p>
        <h1>Mamba图片超分展示</h1>
        <p className="subtext">
          {USE_MOCK
            ? "当前使用前端本地 mock，模拟图片上传与多模型超分结果切换。"
            : "当前使用真实接口，完成图片上传与多模型超分结果切换。"}
        </p>
      </header>

      <section className="toolbar" aria-label="操作区">
        <Radio.Group
          value={viewMode}
          onChange={(e) => {
            setViewMode(e.target.value as "single" | "compare");
            if (e.target.value === "single" && selectedModels.length > 1) {
              setSelectedModels([selectedModels[0] as ModelType]);
            }
            setLensPosition(null);
          }}
          className="view-mode-switch"
        >
          <Radio.Button value="single">单模型体验</Radio.Button>
          <Radio.Button value="compare">多模型联动放大镜对比</Radio.Button>
        </Radio.Group>

        <Upload
          accept="image/*"
          maxCount={1}
          fileList={fileList}
          beforeUpload={() => false}
          onChange={(info) => {
            void handleFileChange(info.fileList);
          }}
        >
          <Button loading={uploading}>上传图片</Button>
        </Upload>

        <Select
          mode={viewMode === "single" ? undefined : "multiple"}
          value={viewMode === "single" ? selectedModels[0] : selectedModels}
          options={MODEL_OPTIONS}
          onChange={(value) =>
            setSelectedModels(
              viewMode === "single" ? [value as ModelType] : (value as ModelType[])
            )
          }
          className="model-select"
          placeholder={viewMode === "single" ? "选择一个模型" : "选择一个或多个模型"}
        />

        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
          <div style={{display: 'flex', flexDirection: 'column', minWidth: 140}}>
            <label style={{fontSize:12, color:'#6b7280'}}>放大倍数: {zoomFactor}x</label>
            <Slider
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.5}
              value={zoomFactor}
              onChange={(v) => {
                const val = v as number;
                // clamp to allowed range to avoid unexpected values
                const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, val));
                setZoomFactor(clamped);
              }}
              style={{width:160}}
            />
          </div>

          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <label style={{fontSize:12, color:'#6b7280'}}>全图放大</label>
            <Switch checked={fullImageZoom} onChange={(v) => setFullImageZoom(v)} />
          </div>

          <Button type="primary" loading={processing} onClick={handleProcess}>
            {viewMode === "single" ? "开始单模型超分" : "开始多图对比加载"}
          </Button>
        </div>
      </section>

      <section className="status-bar" aria-label="状态区">
        <span>已选模型：{selectedModels.length > 0 ? selectedModels.join(", ") : "未选择"}</span>
        <span>
          上传状态：
          {uploading
            ? "上传中"
            : uploadedImage
              ? USE_MOCK
                ? "已完成本地 mock 上传"
                : "已上传到后端"
              : "未上传"}
        </span>
        <span>当前结果：{currentResult ? currentResult.modelType : "--"}</span>
        <span>推理耗时：{inferenceTime ? `${inferenceTime}s` : "--"}</span>
      </section>

      <section className="viewer" aria-label="对比区">
        {!canCompare && (
          <div className="empty-state">
            {USE_MOCK
              ? "上传图片后会自动加载预设结果"
              : "上传图片并选择模型开始超分"}
          </div>
        )}

        {canCompare && viewMode === "single" && (
          <>
            <img-comparison-slider
              ref={comparisonRef}
              class="comparison"
              value="100"
            >
              <img slot="first" src={sourcePreviewUrl} alt="原图" />
              <img
                slot="second"
                src={resultPreviewUrl}
                alt={currentResult ? `${currentResult.modelType} 处理后图片` : "处理后图片"}
              />
            </img-comparison-slider>

            <div className="result-footer">
              <div className="result-meta">
                <span>模型：{currentResult?.modelType}</span>
                <span>耗时：{inferenceTime ? `${inferenceTime}s` : "--"}</span>
              </div>
              <Pagination
                current={currentPage}
                total={results.length}
                pageSize={1}
                onChange={setCurrentPage}
                size="small"
                showSizeChanger={false}
              />
            </div>
          </>
        )}

        {canCompare && viewMode === "compare" && (
          <div className="compare-grid" onMouseLeave={handleMouseLeave}>
            <div
              className="compare-card"
              onMouseMove={handleMouseMove}
              onMouseEnter={() => setLensPosition(null)}
            >
              <h3>原图</h3>
              <div className="magnifier-container">
                <img src={sourcePreviewUrl} alt="原图" id="source-img-for-lens" />
                {lensPosition && (
                  fullImageZoom ? (
                    <div className="magnifier-full-zoom" style={{transformOrigin: `${lensPosition.x}% ${lensPosition.y}%`, transform: `scale(${zoomFactor})`}} />
                  ) : (
                    <div
                      className="magnifier-lens"
                      style={{
                        left: `${lensPosition.x}%`,
                        top: `${lensPosition.y}%`,
                        backgroundImage: `url(${sourcePreviewUrl})`,
                        backgroundPosition: `${lensPosition.x}% ${lensPosition.y}%`,
                        backgroundSize: `${lensPosition.bgWidth * zoomFactor}px ${lensPosition.bgHeight * zoomFactor}px`,
                      }}
                    />
                  )
                )}
              </div>
            </div>
            {results.map((res) => (
              <div
                key={res.modelType}
                className="compare-card"
                onMouseMove={handleMouseMove}
                onMouseEnter={() => setLensPosition(null)}
              >
                <h3>
                  {MODEL_OPTIONS.find((opt) => opt.value === res.modelType)?.label || res.modelType}
                  <span className="timing-badge">({res.inferenceTime}s)</span>
                </h3>
                <div className="magnifier-container">
                  <img src={res.previewUrl} alt={res.modelType} id={`img-${res.modelType}`} />
                  {lensPosition && (
                    fullImageZoom ? (
                      <div className="magnifier-full-zoom" style={{transformOrigin: `${lensPosition.x}% ${lensPosition.y}%`, transform: `scale(${zoomFactor})`, backgroundImage: `url(${res.previewUrl})`}} />
                    ) : (
                      <div
                        className="magnifier-lens"
                        style={{
                          left: `${lensPosition.x}%`,
                          top: `${lensPosition.y}%`,
                          backgroundImage: `url(${res.previewUrl})`,
                          backgroundPosition: `${lensPosition.x}% ${lensPosition.y}%`,
                          backgroundSize: `${lensPosition.bgWidth * zoomFactor}px ${lensPosition.bgHeight * zoomFactor}px`,
                        }}
                      />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
