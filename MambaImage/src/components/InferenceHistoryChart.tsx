import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  InferenceHistoryItem,
  ModelType,
} from "../types/image";

const MODEL_COLORS: Record<ModelType, string> = {
  dwmamba: "#3b82f6",
  dwmamba_small: "#10b981",
  mambairv2: "#a855f7",
};

const MODEL_LABELS: Record<ModelType, string> = {
  dwmamba: "DWMamba 标准版",
  dwmamba_small: "DWMamba 轻量版",
  mambairv2: "MambaIRv2",
};

type ChartRow = {
  id: string;
  fileSizeKB: number;
  label: string;
  modelType: ModelType;
  inferenceTimeSec: number;
  resolution: string;
  pixelCount: number;
  dwmamba: number | null;
  dwmamba_small: number | null;
  mambairv2: number | null;
};

type InferenceHistoryChartProps = {
  items: InferenceHistoryItem[];
};

function buildChartData(items: InferenceHistoryItem[]): ChartRow[] {
  return [...items]
    .sort((a, b) => a.fileSizeKB - b.fileSizeKB || a.createdAt.localeCompare(b.createdAt))
    .map((item) => ({
      id: item.id,
      fileSizeKB: item.fileSizeKB,
      label: `${item.fileSizeKB.toFixed(1)} KB`,
      modelType: item.modelType,
      inferenceTimeSec: item.inferenceTimeSec,
      resolution: `${item.imageWidth} x ${item.imageHeight}`,
      pixelCount: item.pixelCount,
      dwmamba: item.modelType === "dwmamba" ? item.inferenceTimeSec : null,
      dwmamba_small: item.modelType === "dwmamba_small" ? item.inferenceTimeSec : null,
      mambairv2: item.modelType === "mambairv2" ? item.inferenceTimeSec : null,
    }));
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartRow }> }) {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0]?.payload;
  if (!row) {
    return null;
  }

  return (
    <div className="history-tooltip">
      <p>{MODEL_LABELS[row.modelType]}</p>
      <p>大小：{row.fileSizeKB.toFixed(1)} KB</p>
      <p>分辨率：{row.resolution}</p>
      <p>像素：{row.pixelCount.toLocaleString()}</p>
      <p>耗时：{row.inferenceTimeSec.toFixed(4)} s</p>
    </div>
  );
}

export function InferenceHistoryChart({ items }: InferenceHistoryChartProps) {
  const chartData = buildChartData(items);

  if (chartData.length === 0) {
    return <div className="history-empty">暂无历史数据，先运行一次推理。</div>;
  }

  return (
    <div className="history-chart-wrap">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="rgba(15, 23, 42, 0.14)" strokeDasharray="4 4" />
          <XAxis
            dataKey="fileSizeKB"
            type="number"
            tickFormatter={(value: number) => `${value.toFixed(0)}KB`}
            domain={["dataMin", "dataMax"]}
            stroke="rgba(var(--scene-ink-rgb), 0.72)"
          />
          <YAxis
            tickFormatter={(value: number) => `${value.toFixed(2)}s`}
            stroke="rgba(var(--scene-ink-rgb), 0.72)"
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="dwmamba"
            connectNulls
            name={MODEL_LABELS.dwmamba}
            stroke={MODEL_COLORS.dwmamba}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="dwmamba_small"
            connectNulls
            name={MODEL_LABELS.dwmamba_small}
            stroke={MODEL_COLORS.dwmamba_small}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="mambairv2"
            connectNulls
            name={MODEL_LABELS.mambairv2}
            stroke={MODEL_COLORS.mambairv2}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
