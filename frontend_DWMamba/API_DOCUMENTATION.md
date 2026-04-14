# DWMamba 超分后端接口文档

## 概述

本接口基于 `FastAPI` 实现，提供图像上传、单模型超分推理以及多模型对比（包含推理时间统计）的功能。设计上采用了单例模型管理机制，保证同一时间仅加载一个模型，防止显存 OOM。

- **Base URL**: `http://127.0.0.1:8000`
- **静态资源访问**: 接口中返回的所有图片 `url` 都能够直接访问（如 `http://127.0.0.1:8000/static/uploads/xxx.png`）

---

## 1. 上传原始图片

将前端选择的图片上传并长久保存在服务器的 `static/uploads/` 目录下。

- **URL**: `/upload`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`

### 请求参数 (Body)

| 参数名 | 类型   | 必填 | 描述               |
| ------ | ------ | ---- | ------------------ |
| `file` | `File` | 是   | 用户选择的图片文件 |

### 响应示例 (JSON)

```json
{
  "image_id": "8e36cfcf-2c89-4bc7-9577-c93f0b2af481",
  "filename": "8e36cfcf-2c89-4bc7-9577-c93f0b2af481.png",
  "url": "/static/uploads/8e36cfcf-2c89-4bc7-9577-c93f0b2af481.png"
}
```

**字段说明**：

- `image_id`: 成功上传后分配的图片唯一标识 UUID。
- `filename`: 在服务器上保存的文件名。
- `url`: 前端可直接用来显示该原图的相对 URL 路径。

---

## 2. 图像超分 / 获取模型推理结果

指定图片ID和模型进行单次运算，直接返回超分处理后的图片文件。**多模型对比时，推荐前端串行（或按顺序）调用此接口**，以获取陆续渲染的效果并保护显存。

- **URL**: `/super_resolve`
- **Method**: `POST`
- **Content-Type**: `application/json`

### 请求参数 (Body)

```json
{
  "image_id": "8e36cfcf-2c89-4bc7-9577-c93f0b2af481",
  "filename": "8e36cfcf-2c89-4bc7-9577-c93f0b2af481.png",
  "model_type": "dwmamba"
}
```

**字段说明**：

- `image_id`: `/upload` 接口返回的 `image_id`。
- `filename`: `/upload` 接口返回的 `filename`。
- `model_type`: 要使用的超分模型。目前支持的值有：
  - `"dwmamba"` (标准版)
  - `"dwmamba_small"` (轻量版)
  - `"mambairv2"`

### 响应示例

**成功响应 (200 OK)**

接口将直接返回生成的图片文件流（即 `Content-Type: image/png`）。

同时，推理的耗时等信息将附加在响应头部 (Response Headers) 中：

- `X-Inference-Time-S`: 推理耗时，单位为秒（保留4位小数）。
- `X-Model-Type`: 当前请求的模型。

前端在 fetch 请求时可以使用 `response.blob()` 将结果解析为可以通过 `<img src="..." />` 显示的 Blob URL，并通过 `response.headers.get("X-Inference-Time-S")` 读取耗时。

**失败响应 (404 / 400 / 500)**

```json
{
  "detail": "Original image not found"
}
```

---

## 附：前端调用与放大镜功能建议

### 1. 串行请求确保显存安全

虽然接口可以接收并发请求，但为了避免 GPU 显存溢出，在进行“多模型对比”时，前端应采用异步串行请求：

```javascript
// 示例伪代码：
const modelsToCompare = ["dwmamba", "mambairv2"];
for (const model of modelsToCompare) {
  const res = await fetch("/super_resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_id: uploadedImageId,
      filename: uploadedFilename,
      model_type: model,
    }),
  });

  if (res.ok) {
    const timeS = res.headers.get("X-Inference-Time-S");
    const blob = await res.blob();
    const imageUrl = URL.createObjectURL(blob);
    // TODO: 渲染 imageUrl (结果图) 以及 timeS (推理时间)
  }
}
```

### 2. ROI(放大镜) 效果同步实现提示

通过接口获取完整的分辨率图后，可以在前端通过统一的交互事件实现图片局部的同步放大查看，例如：

1. 监听主图片（或底图）的 `onMouseMove` 事件，计算出鼠标相对于图片的百分比坐标 `(x%, y%)`。
2. 将得到的百分比坐标通过 `Context` 或者状态管理透传给下方各模型的对比展示卡片。
3. 利用 CSS 的 `background-position: x% y%;` 以及合适的 `background-size` 结合 `overflow: hidden` 的容器，就能在所有模型卡片中，同步且局部地展示同一块被放大的图像内容。
