import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np

# 确保能 import 你的模型。假设文件名是 gemini_wavemambair.py
from basicsr.archs.mambairv2light_arch import MambaIRv2Light
from basicsr.archs.mambairv2_arch import MambaIRv2
from basicsr.archs.wavemambair_arch import WaveMambaIR
class ModelTester:
    def __init__(self, model_class, input_size=(1, 3, 64, 64), device='cuda'):
        self.device = device if torch.cuda.is_available() else 'cpu'
        print(f"🚀 Running tests on device: {self.device}")
        
        # 实例化模型
        self.model = model_class(
            upscale=2,
            img_size=64,
            embed_dim=96,
            d_state=16,
            depths=[6, 6, 6, 6],  # Reduced depth for quick test
            num_heads=[6, 6, 6, 6],
            window_size=16,
            inner_rank=32,
            num_tokens=64,
            convffn_kernel_size=5,
            img_range=1.,
            mlp_ratio=2.,
            upsampler='pixelshuffledirect'
            # upscale=2,
            # in_chans=3,
            # img_size=64,
            # img_range=1.,
            # embed_dim=174,
            # d_state=16,
            # depths=[6, 6, 6, 6, 6, 6],
            # num_heads=[6, 6, 6, 6, 6, 6],
            # window_size=16,
            # inner_rank=64,
            # num_tokens=128,
            # convffn_kernel_size=5,
            # mlp_ratio=2.,
            # upsampler='pixelshuffle',
            # resi_connection='1conv'
            # upscale=2,
            # in_chans=3,
            # img_size=64,
            # img_range=1.,
            # embed_dim=132,
            # d_state=16,
            # depths=[4, 4, 4, 4, 4, 4],
            # num_heads=[4, 4, 4, 4, 4, 4],
            # window_size=16,
            # inner_rank=64,
            # num_tokens=128,
            # convffn_kernel_size=5,
            # mlp_ratio=2.0,
            # upsampler='pixelshuffle',
            # resi_connection='1conv'
        ).to(self.device)
        #print(f"Model Summary: {self.model}")
        self.input_tensor = torch.randn(*input_size).to(self.device)
        # 目标张量尺寸：如果是 x2 超分，H和W都要乘2
        self.target_tensor = torch.randn(input_size[0], 3, input_size[2]*2, input_size[3]*2).to(self.device)

    def test_1_dwt_invertibility(self):
        """测试 1: DWT/IDWT 可逆性验证"""
        print("\n[Test 1] Checking DWT/IDWT Reversibility...")
        
        # --- 修复路径：进入 Group -> 进入 ASSB ---
        block_group = self.model.layers[0]
        first_block = block_group.layers[0]
        dwt = first_block.dwt
        idwt = first_block.idwt
        
        with torch.no_grad():
            x = self.input_tensor
            ll, hf = dwt(x)
            rec = idwt(ll, hf)
            
            # 检查数值差异
            diff = (x - rec).abs().max().item()
            print(f"   Original Max: {x.max().item():.4f}")
            print(f"   Reconstructed Max: {rec.max().item():.4f}")
            print(f"   Max Difference: {diff:.6f}")
            
            if diff > 1e-5:
                print("❌ DWT/IDWT reconstruction failed! Check scaling factors.")
                # 提示：IDWT 通常需要 *4 或 *2 来抵消 DWT 的 /2
                if abs(rec.max().item() * 4 - x.max().item()) < 1e-3:
                    print("   💡 Hint: Looks like you missed a factor of 4. Try return y * 4 in IDWT.")
            else:
                print("✅ DWT/IDWT is mathematically correct.")

    def test_2_shape_tracing(self):
        """测试 2: 使用 Hook 监控每一层的张量形状 (已增强鲁棒性)"""
        print("\n[Test 2] Tracing Tensor Shapes through the Network...")
        
        hooks = []
        
        # --- 路径：获取第一个 WaveletASSB 块 ---
        target_block = self.model.layers[0].layers[0]
        
        def get_printer(name):
            def printer(module, input, output):
                in_s = input[0].shape if isinstance(input, tuple) else input.shape
                if isinstance(output, tuple): 
                    out_s = str([list(o.shape) for o in output])
                else: 
                    out_s = str(list(output.shape))
                print(f"   📍 {name:20s} In: {str(list(in_s)):30s} -> Out: {out_s}")
            return printer

        # 1. 核心组件 (一定存在的)
        targets = [
            (target_block.dwt, "DWT"),
            (target_block.ll_branch, "LL_Branch (Mamba)"),
            (target_block.hf_branch, "HF_Branch (CNN)"),
            (target_block.cfi, "CFI (Interaction)"),
            (target_block.idwt, "IDWT"),
        ]

        # 2. 动态组件 (可能不存在的，先检查 hasattr)
        if hasattr(self.model, 'upsample'):
            targets.append((self.model.upsample, "Upsample"))
        
        if hasattr(self.model, 'conv_last'):
            targets.append((self.model.conv_last, "Conv_Last"))
        
        # 3. 注册 Hooks
        for module, name in targets:
            h = module.register_forward_hook(get_printer(name))
            hooks.append(h)

        # 运行一次 Forward
        with torch.no_grad():
            self.model(self.input_tensor)
        
        # 移除 Hooks
        for h in hooks: h.remove()
        print("✅ Shape tracing completed.")

    def test_3_gradient_flow(self):
        """测试 3: 梯度回传检查"""
        print("\n[Test 3] Checking Gradient Flow...")
        optimizer = optim.Adam(self.model.parameters(), lr=1e-3)
        criterion = nn.L1Loss()
        
        optimizer.zero_grad()
        output = self.model(self.input_tensor)
        loss = criterion(output, self.target_tensor)
        loss.backward()
        
        has_grad_issue = False
        print("   Checking key components gradients:")
        
        # --- 修复路径：指向正确的子模块 ---
        # model -> layers[0] (Group) -> layers[0] (ASSB)
        assb_block = self.model.layers[0].layers[0]

        check_list = [
            ('conv_first', self.model.conv_first),
            ('LL_Branch_Linear', assb_block.ll_branch.wqkv),
            ('HF_Branch_Conv', assb_block.hf_branch.conv1),
            ('CFI_Fusion', assb_block.cfi.fusion),
            ('Upsample', self.model.upsample)
        ]

        for name, module in check_list:
            # 获取第一个参数
            param = next(module.parameters())
            if param.grad is None:
                print(f"   ❌ {name}: No gradient! (Graph broken)")
                has_grad_issue = True
            else:
                grad_mean = param.grad.abs().mean().item()
                if grad_mean == 0:
                    print(f"   ⚠️ {name}: Gradient is ZERO (Vanishing gradient?)")
                else:
                    print(f"   ✅ {name}: Gradient OK (Mean abs: {grad_mean:.26f})")
        
        if not has_grad_issue:
            print("✅ Gradient flow looks healthy.")

    def test_4_sanity_overfit(self):
        """测试 4: 过拟合测试"""
        print("\n[Test 4] Overfitting Sanity Check (10 steps)...")
        optimizer = optim.Adam(self.model.parameters(), lr=1e-3)
        criterion = nn.L1Loss()
        
        initial_loss = 0
        for i in range(11):
            optimizer.zero_grad()
            output = self.model(self.input_tensor)
            loss = criterion(output, self.target_tensor)
            loss.backward()
            optimizer.step()
            
            if i == 0: initial_loss = loss.item()
            if i % 2 == 0:
                print(f"   Step {i}: Loss = {loss.item():.6f}")
        
        if loss.item() < initial_loss:
            print(f"✅ Model is learning! Loss dropped from {initial_loss:.4f} to {loss.item():.4f}")
        else:
            print("❌ Model failed to learn on a single batch. Check initialization or logic.")

    def test_5_complexity(self):
        """测试 5: 打印 Params, MACs 和 FLOPs"""
        print("\n[Test 5] Calculating Model Complexity...")
        
        try:
            from thop import profile, clever_format
        except ImportError:
            print("❌ 'thop' is not installed. Please run: pip install thop")
            return

        # 1. 准备一个固定尺寸的输入 (SR 领域常用 64x64 LR 进行统计)
        # 注意：thop 统计时 Batch Size 必须为 1
        input_size = (1, 3, 64, 64) 
        dummy_input = torch.randn(*input_size).to(self.device)
        
        # 2. 切换到 eval 模式 (避免 Dropout/BN 的随机性影响统计)
        self.model.eval()
        
        print(f"   Input Size: {input_size}")
        
        # 3. 使用 thop 进行分析
        # verbose=False 可以减少部分不支持算子的警告刷屏
        macs, params = profile(self.model, inputs=(dummy_input, ), verbose=False)
        
        # 4. 格式化输出 (自动把大数转成 M/G 单位)
        macs_str, params_str = clever_format([macs, params], "%.3f")
        
        # 5. 计算 FLOPs (通常近似为 2 * MACs)
        flops = macs * 2
        flops_str, _ = clever_format([flops, params], "%.3f")

        print("-" * 50)
        print(f"   Params (参数量):    {params_str}")
        print(f"   MACs   (计算量):    {macs_str}")
        print(f"   FLOPs  (浮点运算):  {flops_str}")
        print("-" * 50)
        
        # 恢复训练模式
        self.model.train()
if __name__ == "__main__":
    try:
        # Batch size 2 用于检查广播机制是否正确
        tester = ModelTester(WaveMambaIR, input_size=(2, 3, 64, 64))
        tester.test_1_dwt_invertibility()
        tester.test_2_shape_tracing()
        tester.test_3_gradient_flow()
        tester.test_4_sanity_overfit()
        tester.test_5_complexity()
        print("\n🎉 All tests finished!")
    except Exception as e:
        print(f"\n💥 Runtime Error: {e}")
        import traceback
        traceback.print_exc()