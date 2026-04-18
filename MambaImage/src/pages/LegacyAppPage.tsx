import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Pagination,
  Radio,
  Select,
  Slider,
  Switch,
  Tabs,
  Upload,
  message,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import "img-comparison-slider";
import { superResolveImage, uploadImage, USE_MOCK } from "../api/imageApi";
import { InferenceHistoryChart } from "../components/InferenceHistoryChart";
import {
  clearInferenceHistory,
  generateMockInferenceHistory,
  loadInferenceHistory,
  saveInferenceHistory,
} from "../utils/inferenceHistoryStorage";
import type {
  InferenceHistoryItem,
  InferenceResult,
  ModelType,
  PerformanceTab,
  UploadResponse,
  UploadedSourceMeta,
} from "../types/image";
import "../styles/legacy-app.css";

const MODEL_OPTIONS: Array<{ label: string; value: ModelType }> = [
  { label: "DWMamba 标准版", value: "dwmamba" },
  { label: "DWMamba 轻量版", value: "dwmamba_small" },
  { label: "MambaIRv2", value: "mambairv2" },
];

const MODEL_LABELS: Record<ModelType, string> = {
  dwmamba: "DWMamba 标准版",
  dwmamba_small: "DWMamba 轻量版",
  mambairv2: "MambaIRv2",
};

type LegacyAppPageProps = {
  embedded?: boolean;
};

function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      reject(new Error("无法读取图片分辨率"));
    };
    img.src = url;
  });
}

function LegacyAppPage({ embedded = false }: LegacyAppPageProps) {
  const HISTORY_PAGE_SIZE = 10;
  const STICKY_TOP_OFFSET = 0;
  const [activePanelTab, setActivePanelTab] = useState<PerformanceTab>("processor");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("");
  const [selectedModels, setSelectedModels] = useState<ModelType[]>(["dwmamba"]);
  const [results, setResults] = useState<InferenceResult[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<UploadResponse | null>(null);
  const [uploadedSourceMeta, setUploadedSourceMeta] = useState<UploadedSourceMeta | null>(null);
  const [historyItems, setHistoryItems] = useState<InferenceHistoryItem[]>(() =>
    loadInferenceHistory(),
  );
  const [historyPage, setHistoryPage] = useState(1);
  const [tabsStuck, setTabsStuck] = useState(false);
  const [viewMode, setViewMode] = useState<"single" | "compare">("single");
  const [lensPosition, setLensPosition] = useState<{
    x: number;
    y: number;
    bgHeight: number;
    bgWidth: number;
  } | null>(null);
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 18;
  const [zoomFactor, setZoomFactor] = useState<number>(3);
  const [fullImageZoom, setFullImageZoom] = useState<boolean>(false);
  const comparisonRef = useRef<HTMLElement | null>(null);
  const tabsHostRef = useRef<HTMLDivElement | null>(null);
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

  const modelDistribution = useMemo(() => {
    return historyItems.reduce<Record<ModelType, number>>(
      (acc, item) => {
        acc[item.modelType] += 1;
        return acc;
      },
      {
        dwmamba: 0,
        dwmamba_small: 0,
        mambairv2: 0,
      },
    );
  }, [historyItems]);

  const pagedHistoryItems = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    const end = start + HISTORY_PAGE_SIZE;
    return historyItems.slice(start, end);
  }, [historyItems, historyPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(historyItems.length / HISTORY_PAGE_SIZE));
    if (historyPage > maxPage) {
      setHistoryPage(maxPage);
    }
  }, [historyItems.length, historyPage]);

  useEffect(() => {
    let frameId = 0;

    const updateStuckState = () => {
      const host = tabsHostRef.current;
      const nav = host?.querySelector(".ant-tabs-nav") as HTMLElement | null;
      if (!nav) {
        setTabsStuck(false);
        return;
      }

      const top = nav.getBoundingClientRect().top;
      setTabsStuck(top <= STICKY_TOP_OFFSET + 0.5);
    };

    const requestUpdate = () => {
      if (frameId) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateStuckState();
      });
    };

    updateStuckState();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

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

  const handleFileChange = async (files: UploadFile[]) => {
    setFileList(files.slice(-1));
    clearResults();
    setUploadedImage(null);
    setUploadedSourceMeta(null);

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
      const [imageMeta, dimensions] = await Promise.all([
        uploadImage(rawFile),
        readImageDimensions(objectUrl),
      ]);
      if (uploadRequestIdRef.current !== requestId) {
        return;
      }

      setUploadedImage(imageMeta);
      setUploadedSourceMeta({
        fileSizeBytes: rawFile.size,
        fileSizeKB: rawFile.size / 1024,
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
        pixelCount: dimensions.width * dimensions.height,
      });
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
      const skippedHistoryModels: string[] = [];
      const newHistoryEntries: InferenceHistoryItem[] = [];

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

          const nextInferenceTimeSec = Number.parseFloat(nextInferenceTime);

          if (!uploadedSourceMeta || !Number.isFinite(nextInferenceTimeSec)) {
            skippedHistoryModels.push(modelType);
            continue;
          }

          newHistoryEntries.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${modelType}`,
            createdAt: new Date().toISOString(),
            modelType,
            inferenceTimeSec: nextInferenceTimeSec,
            fileSizeBytes: uploadedSourceMeta.fileSizeBytes,
            fileSizeKB: uploadedSourceMeta.fileSizeKB,
            imageWidth: uploadedSourceMeta.imageWidth,
            imageHeight: uploadedSourceMeta.imageHeight,
            pixelCount: uploadedSourceMeta.pixelCount,
            imageId: uploadedImage.image_id,
            filename: uploadedImage.filename,
          });
        } catch (error) {
          const text = error instanceof Error ? error.message : "未知错误";
          failedModels.push(`${modelType}: ${text}`);
        }
      }

      setResults(nextResults);
      setCurrentPage(1);

      if (newHistoryEntries.length > 0) {
        setHistoryItems((previousItems) => {
          const merged = [...newHistoryEntries, ...previousItems];
          saveInferenceHistory(merged);
          return merged;
        });
      }

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

      if (skippedHistoryModels.length > 0) {
        message.warning(`以下模型结果未记录到历史（缺少有效耗时）：${skippedHistoryModels.join("，")}`);
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
    if (!img || !container) {
      return;
    }

    const rect = img.getBoundingClientRect();
    const bgX = ((e.clientX - rect.left) / rect.width) * 100;
    const bgY = ((e.clientY - rect.top) / rect.height) * 100;

    if (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    ) {
      setLensPosition({
        x: bgX,
        y: bgY,
        bgWidth: rect.width,
        bgHeight: rect.height,
      });
    } else {
      setLensPosition(null);
    }
  };

  const handleMouseLeave = () => {
    setLensPosition(null);
  };

  const handleClearHistory = () => {
    clearInferenceHistory();
    setHistoryItems([]);
    setHistoryPage(1);
    message.success("历史记录已清空");
  };

  const handleInjectMockHistory = () => {
    const mockItems = generateMockInferenceHistory(12);
    saveInferenceHistory(mockItems);
    setHistoryItems(mockItems);
    setHistoryPage(1);
    message.success(`已写入 ${mockItems.length} 条 Mock 历史记录`);
  };

  return (
    <main className={`app-shell${embedded ? " app-shell-embedded" : ""}`}>
      <header className="app-header">
        {!embedded && (
          <a className="back-link" href="/">
            返回首页
          </a>
        )}
        <p className="eyebrow">Mamba</p>
        <h1>Mamba图片超分展示</h1>
        <p className="subtext">
          {USE_MOCK
            ? "当前使用前端本地 mock，模拟图片上传与多模型超分结果切换。"
            : "当前使用真实接口，完成图片上传与多模型超分结果切换。"}
        </p>
      </header>

      <div
        ref={tabsHostRef}
        className={`panel-tabs-host${tabsStuck ? " panel-tabs-stuck" : ""}`}
      >
      <Tabs
        activeKey={activePanelTab}
        onChange={(key) => setActivePanelTab(key as PerformanceTab)}
        className="panel-tabs"
        items={[
          {
            key: "processor",
            label: "处理面板",
            children: (
              <>
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
                        viewMode === "single"
                          ? [value as ModelType]
                          : (value as ModelType[]),
                      )
                    }
                    className="model-select"
                    placeholder={viewMode === "single" ? "选择一个模型" : "选择一个或多个模型"}
                  />

                  <div className="toolbar-controls">
                    <div className="zoom-control">
                      <label>放大倍数: {zoomFactor}x</label>
                      <Slider
                        min={MIN_ZOOM}
                        max={MAX_ZOOM}
                        step={0.5}
                        value={zoomFactor}
                        onChange={(v) => {
                          const val = v as number;
                          const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, val));
                          setZoomFactor(clamped);
                        }}
                      />
                    </div>

                    <div className="full-zoom-toggle">
                      <label>全图放大</label>
                      <Switch checked={fullImageZoom} onChange={(v) => setFullImageZoom(v)} />
                    </div>

                    <Button type="primary" loading={processing} onClick={handleProcess}>
                      {viewMode === "single" ? "开始单模型超分" : "开始多图对比加载"}
                    </Button>
                  </div>
                </section>

                <section className="status-bar" aria-label="状态区">
                  <span>
                    已选模型：{selectedModels.length > 0 ? selectedModels.join(", ") : "未选择"}
                  </span>
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
                      {USE_MOCK ? "上传图片后会自动加载预设结果" : "上传图片并选择模型开始超分"}
                    </div>
                  )}

                  {canCompare && viewMode === "single" && (
                    <>
                      <img-comparison-slider ref={comparisonRef} class="comparison" value="100">
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
                          {lensPosition &&
                            (fullImageZoom ? (
                              <div
                                className="magnifier-full-zoom"
                                style={{
                                  transformOrigin: `${lensPosition.x}% ${lensPosition.y}%`,
                                  transform: `scale(${zoomFactor})`,
                                  backgroundImage: `url(${sourcePreviewUrl})`,
                                }}
                              />
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
                            ))}
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
                            {MODEL_OPTIONS.find((opt) => opt.value === res.modelType)?.label ||
                              res.modelType}
                            <span className="timing-badge">({res.inferenceTime}s)</span>
                          </h3>
                          <div className="magnifier-container">
                            <img src={res.previewUrl} alt={res.modelType} id={`img-${res.modelType}`} />
                            {lensPosition &&
                              (fullImageZoom ? (
                                <div
                                  className="magnifier-full-zoom"
                                  style={{
                                    transformOrigin: `${lensPosition.x}% ${lensPosition.y}%`,
                                    transform: `scale(${zoomFactor})`,
                                    backgroundImage: `url(${res.previewUrl})`,
                                  }}
                                />
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
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            ),
          },
          {
            key: "performance",
            label: "性能对比",
            children: (
              <section className="performance-panel" aria-label="性能对比面板">
                <div className="performance-summary">
                  <article className="performance-stat">
                    <p>总记录数</p>
                    <strong>{historyItems.length}</strong>
                  </article>
                  <article className="performance-stat">
                    <p>DWMamba 标准版</p>
                    <strong>{modelDistribution.dwmamba}</strong>
                  </article>
                  <article className="performance-stat">
                    <p>DWMamba 轻量版</p>
                    <strong>{modelDistribution.dwmamba_small}</strong>
                  </article>
                  <article className="performance-stat">
                    <p>MambaIRv2</p>
                    <strong>{modelDistribution.mambairv2}</strong>
                  </article>
                </div>

                <div className="history-actions">
                  <p>横轴：图片文件大小（KB） / 纵轴：推理耗时（秒）</p>
                  <div className="history-action-buttons">
                    <Button onClick={handleInjectMockHistory}>生成Mock数据</Button>
                    <Button danger onClick={handleClearHistory} disabled={historyItems.length === 0}>
                      清空历史
                    </Button>
                  </div>
                </div>

                <InferenceHistoryChart items={historyItems} />

                <div className="history-table-wrap">
                  <h3>最近记录</h3>
                  {historyItems.length === 0 ? (
                    <div className="history-empty">暂无历史记录。</div>
                  ) : (
                    <>
                      <table className="history-table">
                        <thead>
                          <tr>
                            <th>时间</th>
                            <th>模型</th>
                            <th>大小</th>
                            <th>分辨率</th>
                            <th>耗时</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedHistoryItems.map((item) => (
                            <tr key={item.id}>
                              <td>{new Date(item.createdAt).toLocaleString()}</td>
                              <td>{MODEL_LABELS[item.modelType]}</td>
                              <td>{item.fileSizeKB.toFixed(1)} KB</td>
                              <td>
                                {item.imageWidth} x {item.imageHeight}
                              </td>
                              <td>{item.inferenceTimeSec.toFixed(4)} s</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="history-pagination">
                        <Pagination
                          current={historyPage}
                          total={historyItems.length}
                          pageSize={HISTORY_PAGE_SIZE}
                          onChange={setHistoryPage}
                          showSizeChanger={false}
                          size="small"
                        />
                      </div>
                    </>
                  )}
                </div>
              </section>
            ),
          },
        ]}
      />
      </div>
    </main>
  );
}

export default LegacyAppPage;
