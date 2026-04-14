import os
import time
import uuid
import torch
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

# 导入模型架构
from archs.dwmamba_arch import DWMamba
from archs.mambairv2_arch import MambaIRv2

app = FastAPI(title="DWMamba 超分后端接口", description="提供图像超分及多模型对比功能", version="1.0.0")

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 确保图片存储目录存在
UPLOAD_DIR = "static/uploads"
OUTPUT_DIR = "static/outputs"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 挂载静态文件目录供前端直接访问图片
app.mount("/static", StaticFiles(directory="static"), name="static")

# 当前加载在显存中的模型信息，用于避免重复加载以及防止显存溢出
current_model_type = None
model_instance = None
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

def load_model(model_type: str):
    global current_model_type, model_instance
    if current_model_type == model_type and model_instance is not None:
        return model_instance

    # 释放旧模型显存
    if model_instance is not None:
        del model_instance
        torch.cuda.empty_cache()
    
    # 路径配置(目前硬编码，可调整为从配置文件读取)
    model_paths = {
        "dwmamba": "models/dwmamba.pth",
        "dwmamba_small": "models/dwmamba_small.pth",
        "mambairv2": "models/mambairv2.pth"
    }

    if model_type not in model_paths:
        raise ValueError(f"不支持的模型类型: {model_type}")
    
    model_path = model_paths[model_type]
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"找不到模型权重文件: {model_path}")

    # 初始化模型结构
    if model_type == 'dwmamba':
        model = DWMamba(upscale=2, in_chans=3, img_size=64, img_range=1.0, d_state=16, upsampler='pixelshuffle', embed_dim=132, depths=(6, 6, 6, 6), num_heads=(6, 6, 6, 6), window_size=16, inner_rank=32, num_tokens=64, convffn_kernel_size=5, mlp_ratio=2.0, resi_connection='1conv')
    elif model_type == 'dwmamba_small':
        model = DWMamba(upscale=4, in_chans=3, img_range=1.0, img_size=64, embed_dim=48, d_state=8, depths=[2, 2, 2, 2], num_heads=[4,4,4,4], window_size=16, inner_rank=32, num_tokens=64, convffn_kernel_size=5, mlp_ratio=2.0, upsampler='pixelshuffledirect', resi_connection='1conv')
    elif model_type == 'mambairv2':
        model = MambaIRv2(upscale=2, in_chans=3, img_size=64, img_range=1.0, embed_dim=132, d_state=16, depths=[4, 4, 4, 4, 4, 4], num_heads=[4, 4, 4, 4, 4, 4], window_size=16, inner_rank=64, num_tokens=128, convffn_kernel_size=5, mlp_ratio=2.0, upsampler='pixelshuffle', resi_connection='1conv')

    # 加载权重
    checkpoint = torch.load(model_path, map_location='cpu')
    if 'params_ema' in checkpoint:
        model.load_state_dict(checkpoint['params_ema'], strict=True)
    elif 'params' in checkpoint:
        model.load_state_dict(checkpoint['params'], strict=True)
    elif 'state_dict' in checkpoint:
        model.load_state_dict(checkpoint['state_dict'], strict=True)
    else:
        model.load_state_dict(checkpoint, strict=True)

    model.eval()
    model = model.to(device)

    current_model_type = model_type
    model_instance = model
    return model_instance


@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    """上传原图并永久保存到服务器，返回图片ID和访问URL"""
    img_id = str(uuid.uuid4())
    ext = file.filename.split('.')[-1]
    filename = f"{img_id}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    with open(filepath, "wb") as f:
        f.write(await file.read())
        
    return {
        "image_id": img_id,
        "filename": filename,
        "url": f"/static/uploads/{filename}"
    }

class InferenceRequest(BaseModel):
    image_id: str
    filename: str
    model_type: str

@app.post("/super_resolve")
async def super_resolve(req: InferenceRequest):
    """
    指定图片ID和模型进行单次超分推理，返回超分图片URL和推理时间。
    前端如果做多模型对比，可以循环调用甚至排队调用这个接口进行串行处理，避免一次性加载多模型导致显存溢出。
    """
    filepath = os.path.join(UPLOAD_DIR, req.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Original image not found")

    try:
        model = load_model(req.model_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # 加载图片
    img = cv2.imread(filepath, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Cannot read image")
    
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_tensor = torch.from_numpy(img).float() / 255.0
    img_tensor = img_tensor.permute(2, 0, 1).unsqueeze(0).to(device)

    # 推理
    start_time = time.time()
    with torch.no_grad():
        output_tensor = model(img_tensor)
    if device.type == 'cuda':
        torch.cuda.synchronize()  # 确保 GPU 执行完毕
    end_time = time.time()
    inference_time = end_time - start_time

    # 后处理
    output_tensor = output_tensor.squeeze(0).permute(1, 2, 0).cpu().numpy()
    output_tensor = np.clip(output_tensor, 0.0, 1.0) * 255.0
    output_img = output_tensor.astype(np.uint8)
    output_img = cv2.cvtColor(output_img, cv2.COLOR_RGB2BGR)

    out_filename = f"{req.image_id}_{req.model_type}.png"
    out_filepath = os.path.join(OUTPUT_DIR, out_filename)
    cv2.imwrite(out_filepath, output_img)

    return FileResponse(
        path=out_filepath,
        headers={
            "X-Inference-Time-S": str(round(inference_time, 4)),
            "X-Model-Type": req.model_type,
            "Access-Control-Expose-Headers": "X-Inference-Time-S, X-Model-Type"
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)