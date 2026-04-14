# frontend_DWMamba

## 测试推理脚本运行说明

本项目包含一个 `run_inference.py` 脚本，用于直接加载权重验证效果。

### 1. 运行环境要求

需要确认安装了如下核心包（或者之前在 Mambair / basicsr 环境内均可直接使用）：

```bash
pip install torch torchvision opencv-python numpy einops basicsr mamba_ssm
```

### 2. 通过命令行运行推理

脚本提供了参数接口来灵活调整使用的模型和输入图像：

- `--model_type`: 选择网络结构类型，如 `dwmamba`、`dwmamba_small` 或 `mambairv2`。
- `--model_path`: 选择对应模型验证权重的 .pth 文件地址。
- `--input`: 输入需要测试的低清图像路径。
- `--output`: 输出的高清或者处理后图像写入的路径。

#### 示例：使用完整的 DWMamba 模型

```bash
python run_inference.py --model_type dwmamba --model_path models/dwmamba.pth --input test_image.png --output result_dwmamba.png
```

#### 示例：使用轻量版 DWMamba-Small 模型

```bash
python run_inference.py --model_type dwmamba_small --model_path models/dwmamba_small.pth --input test_image.png --output result_dwmamba_small.png
```

#### 示例：使用 MambaIRv2 模型

```bash
python run_inference.py --model_type mambairv2 --model_path models/mambairv2.pth --input test_image.png --output result_mambairv2.png
```


## 各模型配置参数

Mambairv2

```bash
network_g:
  type: MambaIRv2
  upscale: 2
  in_chans: 3
  img_size: 64
  img_range: 1.
  embed_dim: 132
  d_state: 16
  depths: [4, 4, 4, 4, 4, 4]
  num_heads: [4, 4, 4, 4, 4, 4]
  window_size: 16
  inner_rank: 64
  num_tokens: 128
  convffn_kernel_size: 5
  mlp_ratio: 2.0
  upsampler: 'pixelshuffle'
  resi_connection: '1conv'
```

dwmamba_small

```bash
 DWMamba(
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
        resi_connection='1conv' )
```

dwmamba

```bash
network_g:
  type: DWMamba
  upscale: 2
  in_chans: 3
  img_size: 64
  img_range: 1.
  embed_dim: 132
  d_state: 16
  depths: [6, 6, 6, 6]
  num_heads: [6, 6, 6, 6]
  window_size: 16
  inner_rank: 32
  num_tokens: 64
  convffn_kernel_size: 5
  mlp_ratio: 2.0
  upsampler: 'pixelshuffle'
  resi_connection: '1conv'
```

