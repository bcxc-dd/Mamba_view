import sys
import os
import torch
import torch.onnx
from basicsr.archs.mambairv2light_arch import MambaIRv2Light

# 从 train_MambaIRv2_lightSR_x4.yml 的 network_g 获取的参数
model = MambaIRv2Light(
    upscale=4,
    in_chans=3,
    img_size=64,
    img_range=1.,
    embed_dim=48,
    d_state=8,
    depths=[5, 5, 5, 5],      # 关键修改：从6改为5
    num_heads=[4, 4, 4, 4],   # 关键修改：从6改为4
    window_size=16,
    inner_rank=32,
    num_tokens=64,
    convffn_kernel_size=5,
    mlp_ratio=1.0,            # 关键修改：从1.5改为1.0
    upsampler='pixelshuffledirect',
    resi_connection='1conv'
)

# --- 修复代码开始 ---
checkpoint_path = "mambairv2_lightSR_x4.pth"
checkpoint = torch.load(checkpoint_path)

# 检查是否包含 'params' 键，如果有则提取，否则直接使用
if 'params' in checkpoint:
    state_dict = checkpoint['params']
else:
    state_dict = checkpoint

model.load_state_dict(state_dict, strict=True) 

# --- 修改开始：使用 GPU 并减小尺寸 ---
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Exporting on device: {device}")

model.to(device)
model.eval()

# 建议改为 64x64 (与训练配置一致)，或者 32x32，速度会快非常多
# 224x224 对导出过程来说太大了，会导致 Trace 过程极慢
dummy_input = torch.randn(1, 3, 64, 64).to(device) 

print("Start exporting...")
# 3. 导出
torch.onnx.export(
    model, 
    dummy_input, 
    "mambairv2_lightSR_x4.onnx",
    opset_version=14,      # 建议指定较高的 opset 以支持更多算子
    input_names=['input'],
    output_names=['output']
)
print("Export finished!")
# --- 修改结束 ---