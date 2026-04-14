import argparse
import torch
import cv2
import numpy as np
import os
import sys

# 将当前目录加入系统路径，以便正确导入 archs 模块
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from archs.dwmamba_arch import DWMamba
from archs.mambairv2_arch import MambaIRv2

def main():
    parser = argparse.ArgumentParser(description='DWMamba 模型推理脚本')
    parser.add_argument('--model_path', type=str, required=True, help='模型权重文件路径 (.pth)')
    parser.add_argument('--input', type=str, required=True, help='输入图像路径')
    parser.add_argument('--output', type=str, default='output.png', help='输出图像保存路径')
    parser.add_argument('--model_type', type=str, choices=['dwmamba', 'dwmamba_small', 'mambairv2'], default='dwmamba', help='模型架构类型')
    
    args = parser.parse_args()

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")

    # 根据模型类型初始化模型
    if args.model_type == 'dwmamba':
        # DWMamba 默认配置 (upscale x2)
        model = DWMamba(
            upscale=2,
            in_chans=3,
            img_size=64,
            img_range=1.0,
            d_state=16,
            upsampler='pixelshuffle',
            embed_dim=132,
            depths=(6, 6, 6, 6),
            num_heads=(6, 6, 6, 6),
            window_size=16,
            inner_rank=32,
            num_tokens=64,
            convffn_kernel_size=5,
            mlp_ratio=2.0,
            resi_connection='1conv'
        )
    elif args.model_type == 'dwmamba_small':
        # DWMamba 小型配置 (upscale x4)
        model = DWMamba(
            upscale=4,
            in_chans=3,
            img_range=1.0,
            img_size=64,
            embed_dim=48,
            d_state=8,
            depths=[2, 2, 2, 2],
            num_heads=[4,4,4,4],
            window_size=16,
            inner_rank=32,
            num_tokens=64,
            convffn_kernel_size=5,
            mlp_ratio=2.0,
            upsampler='pixelshuffledirect',
            resi_connection='1conv'
        )
    elif args.model_type == 'mambairv2':
        # MambaIRv2 默认配置 (upscale x2)
        model = MambaIRv2(
            upscale=2,
            in_chans=3,
            img_size=64,
            img_range=1.0,
            embed_dim=132,
            d_state=16,
            depths=[4, 4, 4, 4, 4, 4],
            num_heads=[4, 4, 4, 4, 4, 4],
            window_size=16,
            inner_rank=64,
            num_tokens=128,
            convffn_kernel_size=5,
            mlp_ratio=2.0,
            upsampler='pixelshuffle',
            resi_connection='1conv'
        )
    else:
        raise ValueError(f"未知的 model_type: {args.model_type}")

    # 加载权重
    print(f"Loading weights from {args.model_path} ...")
    checkpoint = torch.load(args.model_path, map_location='cpu')
    if 'params_ema' in checkpoint:
        model.load_state_dict(checkpoint['params_ema'], strict=True)
    elif 'params' in checkpoint:
        model.load_state_dict(checkpoint['params'], strict=True)
    elif 'state_dict' in checkpoint:
        model.load_state_dict(checkpoint['state_dict'], strict=True)
    else:
        # 如果不是字典，可能直接就是 state_dict
        model.load_state_dict(checkpoint, strict=True)

    model.eval()
    model = model.to(device)

    # 读取并处理图像
    print(f"Loading image {args.input} ...")
    img = cv2.imread(args.input, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"无法读取输入图像 {args.input}")
    
    # BGR 转 RGB，并归一化到 [0, 1]
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_tensor = torch.from_numpy(img).float() / 255.0
    # (H, W, C) 转换为 (1, C, H, W)
    img_tensor = img_tensor.permute(2, 0, 1).unsqueeze(0).to(device)

    print("Running inference...")
    with torch.no_grad():
        output_tensor = model(img_tensor)
    
    # 将输出张量转回 numpy 数组格式
    output_tensor = output_tensor.squeeze(0).permute(1, 2, 0).cpu().numpy()
    # 限制范围在 [0, 1] 并反归一化为 0-255 的图像
    output_tensor = np.clip(output_tensor, 0.0, 1.0) * 255.0
    output_img = output_tensor.astype(np.uint8)
    
    # 转换回 BGR 以便保存
    output_img = cv2.cvtColor(output_img, cv2.COLOR_RGB2BGR)

    cv2.imwrite(args.output, output_img)
    print(f"Output saved to {args.output}")

if __name__ == '__main__':
    main()