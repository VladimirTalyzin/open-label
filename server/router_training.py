"""
Training script generator for OpenLabel export.

Generates ready-to-run Python training scripts for each export format.
Each script:
  1. Installs required dependencies
  2. Trains the model on the exported dataset
  3. Runs inference on a validation image
  4. Displays the result with skeleton overlay in a popup window
"""


def _device_arg(device):
    """Map UI device name to framework-specific device string."""
    mapping = {
        "cpu": "cpu",
        "gpu": "0",           # CUDA device 0
        "mps": "mps",         # Apple Metal
        "rocm": "0",          # AMD ROCm uses same CUDA-style index
    }
    return mapping.get(device, "cpu")


def _torch_device(device):
    """Map UI device name to PyTorch device string."""
    mapping = {
        "cpu": "cpu",
        "gpu": "cuda",
        "mps": "mps",
        "rocm": "cuda",       # ROCm exposes as cuda via HIP
    }
    return mapping.get(device, "cpu")


def _pip_extras(device):
    """Extra pip install instructions for the given device."""
    if device == "rocm":
        return (
            "# AMD ROCm: install PyTorch with ROCm support\n"
            "# pip install torch torchvision --index-url https://download.pytorch.org/whl/rocm6.0\n"
        )
    if device == "mps":
        return "# Apple Metal: make sure you have macOS 12.3+ and PyTorch 2.0+\n"
    return ""


def _detect_swap(name, all_names):
    """Detect symmetric counterpart for L/R keypoint names."""
    pairs = [
        ('_L', '_R'), ('_R', '_L'),
        ('_l', '_r'), ('_r', '_l'),
        ('_Left', '_Right'), ('_Right', '_Left'),
        ('_left', '_right'), ('_right', '_left'),
        ('Left', 'Right'), ('Right', 'Left'),
    ]
    for suffix, replacement in pairs:
        if name.endswith(suffix):
            swap_name = name[:-len(suffix)] + replacement
            if swap_name in all_names:
                return swap_name
    return ''


def generate_yolo_script(params):
    """Generate a YOLOv8-pose training script."""
    device = params.get("device", "cpu")
    epochs = params.get("epochs", 100)
    batch_size = params.get("batch_size", 16)
    imgsz = params.get("imgsz", 640)
    lr = params.get("lr", 0.01)
    patience = params.get("patience", 50)
    kpt_shape = params.get("kpt_shape", [17, 3])
    keypoint_names = params.get("keypoint_names", [])
    skeleton = params.get("skeleton", [])

    device_val = _device_arg(device)

    script = f'''#!/usr/bin/env python3
"""
OpenLabel — YOLOv8-Pose Training Script
========================================
Auto-generated training script. Just run:
    python train.py

Requirements will be installed automatically.
"""

import subprocess
import sys

def install_packages():
    """Install required packages."""
    packages = ["ultralytics>=8.0.0", "matplotlib", "Pillow", "numpy"]
    for pkg in packages:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])
    print("All packages installed successfully.")

{_pip_extras(device)}

if __name__ == "__main__":
    print("=" * 60)
    print("  OpenLabel — YOLOv8-Pose Training")
    print("=" * 60)
    print()

    # Step 1: Install dependencies
    print("[1/3] Installing dependencies...")
    install_packages()

    from ultralytics import YOLO
    import os

    # Step 2: Train the model
    print()
    print("[2/3] Starting training...")
    print(f"  Device:     {device}")
    print(f"  Epochs:     {epochs}")
    print(f"  Batch size: {batch_size}")
    print(f"  Image size: {imgsz}")
    print(f"  LR:         {lr}")
    print(f"  Patience:   {patience}")
    print()

    model = YOLO("yolov8n-pose.pt")

    results = model.train(
        data="data.yaml",
        epochs={epochs},
        batch={batch_size},
        imgsz={imgsz},
        lr0={lr},
        patience={patience},
        device="{device_val}",
        project="runs",
        name="pose_train",
        exist_ok=True,
        verbose=True,
    )

    best_model_path = os.path.join("runs", "pose_train", "weights", "best.pt")
    if not os.path.exists(best_model_path):
        best_model_path = os.path.join("runs", "pose_train", "weights", "last.pt")

    print()
    print(f"Training complete! Best model: {{best_model_path}}")

    # Step 3: Inference demo
    print()
    print("[3/3] Running inference demo...")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches
    from PIL import Image
    import numpy as np

    trained_model = YOLO(best_model_path)

    # Find a validation image
    val_dir = os.path.join("images", "val")
    if not os.path.exists(val_dir):
        val_dir = os.path.join("images", "train")

    val_images = [f for f in os.listdir(val_dir) if f.lower().endswith((".png", ".jpg", ".jpeg"))]

    if not val_images:
        print("No images found for demo.")
        sys.exit(0)

    demo_image_path = os.path.join(val_dir, val_images[0])
    print(f"  Demo image: {{demo_image_path}}")

    results = trained_model(demo_image_path, verbose=False)
    result = results[0]

    # Draw the result
    img = Image.open(demo_image_path)
    fig, axes = plt.subplots(1, 2, figsize=(16, 8))

    # Left: original image
    axes[0].imshow(img)
    axes[0].set_title("Original")
    axes[0].axis("off")

    # Right: image with predictions
    axes[1].imshow(img)
    axes[1].set_title("Prediction")
    axes[1].axis("off")

    KEYPOINT_NAMES = {repr(keypoint_names)}
    SKELETON = {repr(skeleton)}
    COLORS = plt.cm.tab20(np.linspace(0, 1, max(len(KEYPOINT_NAMES), 1)))

    if result.keypoints is not None and len(result.keypoints) > 0:
        for person_kpts in result.keypoints.data:
            kpts = person_kpts.cpu().numpy()

            # Draw skeleton connections
            for conn in SKELETON:
                if len(conn) >= 2:
                    i1, i2 = conn[0], conn[1]
                    if i1 < len(kpts) and i2 < len(kpts):
                        if kpts[i1][2] > 0.3 and kpts[i2][2] > 0.3:
                            axes[1].plot(
                                [kpts[i1][0], kpts[i2][0]],
                                [kpts[i1][1], kpts[i2][1]],
                                "c-", linewidth=2, alpha=0.7,
                            )

            # Draw keypoints
            for idx, kp in enumerate(kpts):
                if kp[2] > 0.3:
                    color = COLORS[idx % len(COLORS)]
                    axes[1].plot(kp[0], kp[1], "o", color=color, markersize=6)
                    if idx < len(KEYPOINT_NAMES):
                        axes[1].annotate(
                            KEYPOINT_NAMES[idx], (kp[0], kp[1]),
                            fontsize=6, color="white",
                            bbox=dict(boxstyle="round,pad=0.15", fc="black", alpha=0.6),
                            ha="center", va="bottom", xytext=(0, 5),
                            textcoords="offset points",
                        )

    # Draw bounding boxes
    if result.boxes is not None:
        for box in result.boxes.xyxy:
            bx = box.cpu().numpy()
            rect = patches.Rectangle(
                (bx[0], bx[1]), bx[2] - bx[0], bx[3] - bx[1],
                linewidth=2, edgecolor="lime", facecolor="none",
            )
            axes[1].add_patch(rect)

    plt.suptitle("OpenLabel — YOLOv8-Pose Inference Result", fontsize=14, fontweight="bold")
    plt.tight_layout()

    output_path = "inference_result.png"
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    print(f"  Result saved to: {{output_path}}")
    print("  (Open the saved image to view the result)")
    print()
    print("Done!")
'''
    return script


def _visualization_block(keypoint_names, skeleton):
    """Matplotlib visualization block (plot only).

    Assumes these variables are already set in the calling scope:
      demo_img, pred_kpts (NUM_KPTS, 3), NUM_KPTS, KEYPOINT_NAMES,
      SKELETON, plt, np.
    Must be placed inside an ``if demo_images:`` guard at 8-space indent.
    """
    return f'''        fig, axes = plt.subplots(1, 2, figsize=(16, 8))
        axes[0].imshow(demo_img)
        axes[0].set_title("Original")
        axes[0].axis("off")

        axes[1].imshow(demo_img)
        axes[1].set_title("Prediction")
        axes[1].axis("off")

        COLORS = plt.cm.tab20(np.linspace(0, 1, max(NUM_KPTS, 1)))

        for conn in SKELETON:
            if len(conn) >= 2:
                i1, i2 = conn[0], conn[1]
                if i1 < NUM_KPTS and i2 < NUM_KPTS:
                    if pred_kpts[i1][2] > 0.3 and pred_kpts[i2][2] > 0.3:
                        axes[1].plot(
                            [pred_kpts[i1][0], pred_kpts[i2][0]],
                            [pred_kpts[i1][1], pred_kpts[i2][1]],
                            "c-", linewidth=2, alpha=0.7,
                        )

        for idx, kp in enumerate(pred_kpts):
            if kp[2] > 0.3:
                color = COLORS[idx % len(COLORS)]
                axes[1].plot(kp[0], kp[1], "o", color=color, markersize=6)
                if idx < len(KEYPOINT_NAMES):
                    axes[1].annotate(
                        KEYPOINT_NAMES[idx], (kp[0], kp[1]),
                        fontsize=6, color="white",
                        bbox=dict(boxstyle="round,pad=0.15", fc="black", alpha=0.6),
                        ha="center", va="bottom", xytext=(0, 5),
                        textcoords="offset points",
                    )

        plt.suptitle("OpenLabel \u2014 Keypoint Inference Result", fontsize=14, fontweight="bold")
        plt.tight_layout()
        plt.savefig("inference_result.png", dpi=150, bbox_inches="tight")
        print(f"  Result saved to: inference_result.png")
        print("  (Open the saved image to view the result)")

    print("Done!")'''


def generate_coco_mmpose_script(params):
    """Generate an MMPose training script (HRNet-W48, COCO format)."""
    device = params.get("device", "cpu")
    epochs = params.get("epochs", 100)
    batch_size = params.get("batch_size", 16)
    imgsz = params.get("imgsz", 640)
    lr = params.get("lr", 0.001)
    keypoint_names = params.get("keypoint_names", [])
    skeleton = params.get("skeleton", [])
    category_file = params.get("category_file", "train/object.json")
    num_kpts = len(keypoint_names)

    heatmap_size = imgsz // 4  # HRNet stride = 4

    # Build skeleton links with integer keys (dict, not set)
    skeleton_links = []
    for i, conn in enumerate(skeleton):
        if len(conn) >= 2 and conn[0] < num_kpts and conn[1] < num_kpts:
            skeleton_links.append(
                f"            {i}: dict(link=({repr(keypoint_names[conn[0]])}, {repr(keypoint_names[conn[1]])}), "
                f"id={i}, color=[0, 255, 0]),"
            )
    skeleton_links_str = "\n".join(skeleton_links)

    # Build keypoint info with swap for symmetric L/R pairs
    kpt_info = []
    for i, name in enumerate(keypoint_names):
        swap = _detect_swap(name, keypoint_names)
        kpt_info.append(
            f"            {i}: dict(name={repr(name)}, id={i}, color=[255, 128, 0], "
            f"type='', swap={repr(swap)}),"
        )
    kpt_info_str = "\n".join(kpt_info)

    # joint_weights and sigmas — required by MMPose metainfo
    joint_weights_str = repr([1.0] * num_kpts)
    sigmas_str = repr([0.05] * num_kpts)

    # MPS float64 workaround (#6)
    mps_block = ""
    if device == "mps":
        mps_block = '''
    # --- MPS float64 workaround ---
    # MMPose uses float64 in accuracy computation which MPS doesn't support.
    # Force CPU to avoid: "TypeError: Cannot convert a MPS Tensor to float64"
    import torch
    torch.backends.mps.is_available = lambda: False
    print("  Note: MPS disabled (float64 incompatibility), using CPU instead.")
'''

    # Memory warning for large configs (#7)
    mem_warning = ""
    est_gb = (batch_size * (imgsz ** 2) * 3 * 4) / (1024 ** 3) * 15
    if est_gb > 16:
        mem_warning = f'''
    # --- Memory warning ---
    print("  WARNING: Estimated memory usage ~{est_gb:.0f} GB.")
    print("  If training crashes (OOM), reduce batch_size or imgsz.")
    print("  Recommended for Mac (24 GB): imgsz=384, batch_size=8")
    print()
'''

    script = f'''#!/usr/bin/env python3
"""
OpenLabel \u2014 MMPose Training Script (HRNet-W48)
=================================================
Uses MMPose with a HRNet-W48 backbone for keypoint detection.

    python train.py
"""

import subprocess
import sys

def install_packages():
    # Pin setuptools to avoid pkg_resources removal (setuptools >= 78)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q",
                           "setuptools>=67,<78"])
    # Cython required to build xtcocotools (mmpose dependency)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "Cython"])

    packages = [
        "torch", "torchvision",
        "mmengine",
        "mmcv>=2.0.0,<2.2.0",    # mmdet requires mmcv < 2.2.0
        "mmdet>=3.0.0",
        "mmpose>=1.0.0",
        "matplotlib", "Pillow", "numpy",
    ]
    for pkg in packages:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])
    print("All packages installed.")

{_pip_extras(device)}

if __name__ == "__main__":
    print("=" * 60)
    print("  OpenLabel \u2014 MMPose HRNet-W48 Training")
    print("=" * 60)
    print()

    print("[1/3] Installing dependencies...")
    install_packages()
{mps_block}
    # --- PyTorch 2.6+ compatibility (#8) ---
    # mmengine checkpoints contain numpy objects; torch.load now defaults to
    # weights_only=True which rejects them.
    import torch
    _orig_torch_load = torch.load
    def _patched_torch_load(*args, **kwargs):
        kwargs.setdefault("weights_only", False)
        return _orig_torch_load(*args, **kwargs)
    torch.load = _patched_torch_load

    import os
    import json
    import numpy as np
    from PIL import Image
    from mmengine.config import Config
    from mmengine.runner import Runner

    KEYPOINT_NAMES = {repr(keypoint_names)}
    SKELETON = {repr(skeleton)}
    NUM_KPTS = {num_kpts}

    # --- Build MMPose config programmatically ---
    print()
    print("[2/3] Training...")
    print(f"  Device:     {device}")
    print(f"  Epochs:     {epochs}")
    print(f"  Batch size: {batch_size}")
    print(f"  Image size: {imgsz}")
    print(f"  LR:         {lr}")
    print()
{mem_warning}
    cat_file = "{category_file}"
    train_json = os.path.abspath(cat_file)
    val_json = os.path.abspath(cat_file.replace("train/", "val/"))
    train_img_dir = os.path.abspath("train/images")
    val_img_dir = os.path.abspath("val/images")

    dataset_info = dict(
        dataset_name="openlabel",
        joint_weights={joint_weights_str},
        sigmas={sigmas_str},
        keypoint_info={{
{kpt_info_str}
        }},
        skeleton_info={{
{skeleton_links_str}
        }},
    )

    # Shared val/test pipeline
    val_pipeline = [
        dict(type="LoadImage"),
        dict(type="GetBBoxCenterScale"),
        dict(type="TopdownAffine", input_size=({imgsz}, {imgsz})),
        dict(type="PackPoseInputs"),
    ]

    cfg_dict = dict(
        default_scope="mmpose",
        model=dict(
            type="TopdownPoseEstimator",
            data_preprocessor=dict(
                type="PoseDataPreprocessor",
                mean=[123.675, 116.28, 103.53],
                std=[58.395, 57.12, 57.375],
                bgr_to_rgb=True,
            ),
            backbone=dict(
                type="HRNet",
                in_channels=3,
                extra=dict(
                    stage1=dict(num_modules=1, num_branches=1, block="BOTTLENECK", num_blocks=(4,), num_channels=(64,)),
                    stage2=dict(num_modules=1, num_branches=2, block="BASIC", num_blocks=(4, 4), num_channels=(48, 96)),
                    stage3=dict(num_modules=4, num_branches=3, block="BASIC", num_blocks=(4, 4, 4), num_channels=(48, 96, 192)),
                    stage4=dict(num_modules=3, num_branches=4, block="BASIC", num_blocks=(4, 4, 4, 4), num_channels=(48, 96, 192, 384)),
                ),
                init_cfg=dict(type="Pretrained", checkpoint="https://download.openmmlab.com/mmpose/pretrain_models/hrnet_w48-8ef0771d.pth"),
            ),
            head=dict(
                type="HeatmapHead",
                in_channels=48,
                out_channels={num_kpts},
                deconv_out_channels=[],     # HRNet already outputs stride-4 features (#5)
                deconv_kernel_sizes=[],     # no extra upsampling needed
                loss=dict(type="KeypointMSELoss", use_target_weight=True),
                decoder=dict(type="MSRAHeatmap", input_size=({imgsz}, {imgsz}), heatmap_size=({heatmap_size}, {heatmap_size}), sigma=2),
            ),
        ),
        train_dataloader=dict(
            batch_size={batch_size},
            num_workers=2,
            dataset=dict(
                type="CocoDataset",
                data_root=".",
                ann_file=train_json,
                data_prefix=dict(img="train/images"),
                metainfo=dataset_info,
                pipeline=[
                    dict(type="LoadImage"),
                    dict(type="GetBBoxCenterScale"),
                    dict(type="TopdownAffine", input_size=({imgsz}, {imgsz})),
                    dict(type="GenerateTarget", encoder=dict(type="MSRAHeatmap", input_size=({imgsz}, {imgsz}), heatmap_size=({heatmap_size}, {heatmap_size}), sigma=2)),
                    dict(type="PackPoseInputs"),
                ],
            ),
        ),
        val_dataloader=dict(
            batch_size={batch_size},
            num_workers=2,
            dataset=dict(
                type="CocoDataset",
                data_root=".",
                ann_file=val_json,
                data_prefix=dict(img="val/images"),
                metainfo=dataset_info,
                pipeline=val_pipeline,
            ),
        ),
        test_dataloader=dict(
            batch_size=1,
            num_workers=2,
            dataset=dict(
                type="CocoDataset",
                data_root=".",
                ann_file=val_json,
                data_prefix=dict(img="val/images"),
                metainfo=dataset_info,
                pipeline=val_pipeline,
            ),
        ),
        val_evaluator=dict(type="CocoMetric", ann_file=val_json),
        test_evaluator=dict(type="CocoMetric", ann_file=val_json),
        train_cfg=dict(by_epoch=True, max_epochs={epochs}, val_interval=10),
        val_cfg=dict(),
        test_cfg=dict(),
        optim_wrapper=dict(optimizer=dict(type="Adam", lr={lr})),
        default_hooks=dict(
            checkpoint=dict(type="CheckpointHook", interval=10, save_best="coco/AP", rule="greater"),
            logger=dict(type="LoggerHook", interval=50),
        ),
        work_dir="work_dirs/hrnet_w48",
        launcher="none",
    )

    cfg = Config(cfg_dict)
    runner = Runner.from_cfg(cfg)
    runner.train()

    print("Training complete!")

    # --- Inference demo ---
    print()
    print("[3/3] Inference demo...")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mmpose.apis import init_model, inference_topdown
    from mmpose.structures import merge_data_samples

    # Find best checkpoint
    work_dir = "work_dirs/hrnet_w48"
    ckpt_path = None
    if os.path.exists(os.path.join(work_dir, "best_coco")):
        best_dir = os.path.join(work_dir, "best_coco")
        ckpts = [f for f in os.listdir(best_dir) if f.endswith(".pth")]
        if ckpts:
            ckpt_path = os.path.join(best_dir, ckpts[0])
    if not ckpt_path:
        ckpt_path = os.path.join(work_dir, "epoch_{epochs}.pth")

    print(f"  Using checkpoint: {{ckpt_path}}")

    demo_dir = val_img_dir if os.path.exists(val_img_dir) else train_img_dir
    demo_images = [f for f in os.listdir(demo_dir) if f.lower().endswith((".png", ".jpg", ".jpeg"))]

    if demo_images:
        demo_path = os.path.join(demo_dir, demo_images[0])
        demo_img = Image.open(demo_path).convert("RGB")
        orig_w, orig_h = demo_img.size

        bboxes = [[0, 0, orig_w, orig_h]]

        pose_model = init_model(cfg, ckpt_path, device="cpu")
        results = inference_topdown(pose_model, demo_path, bboxes)
        result = merge_data_samples(results)

        pred_kpts = result.pred_instances.keypoints[0]
        pred_scores = result.pred_instances.keypoint_scores[0]
        pred_kpts = np.column_stack([pred_kpts, pred_scores])

{_visualization_block(keypoint_names, skeleton)}
'''
    return script


def generate_coco_vitpose_script(params):
    """Generate a ViTPose training script (ViT-B, COCO format)."""
    device = params.get("device", "cpu")
    epochs = params.get("epochs", 100)
    batch_size = params.get("batch_size", 16)
    imgsz = params.get("imgsz", 256)
    lr = params.get("lr", 0.0005)
    keypoint_names = params.get("keypoint_names", [])
    skeleton = params.get("skeleton", [])
    category_file = params.get("category_file", "train/object.json")
    num_kpts = len(keypoint_names)

    # ViT-B uses patch_size=16; HeatmapHead has 2 deconv layers (each 2x upscale).
    # feature_map = imgsz // 16,  heatmap = feature_map * 4 = (imgsz // 16) * 4
    # Round imgsz down to a multiple of 16 so the patch grid divides evenly.
    if imgsz % 16 != 0:
        imgsz = (imgsz // 16) * 16
    heatmap_size = (imgsz // 16) * 4

    # Build keypoint info with swap for symmetric L/R pairs
    kpt_info = []
    for i, name in enumerate(keypoint_names):
        swap = _detect_swap(name, keypoint_names)
        kpt_info.append(
            f"            {i}: dict(name={repr(name)}, id={i}, color=[255, 128, 0], "
            f"type='', swap={repr(swap)}),"
        )
    kpt_info_str = "\n".join(kpt_info)

    # Build skeleton links with integer keys (dict, not set)
    skeleton_links = []
    for i, conn in enumerate(skeleton):
        if len(conn) >= 2 and conn[0] < num_kpts and conn[1] < num_kpts:
            skeleton_links.append(
                f"            {i}: dict(link=({repr(keypoint_names[conn[0]])}, {repr(keypoint_names[conn[1]])}), "
                f"id={i}, color=[0, 255, 0]),"
            )
    skeleton_links_str = "\n".join(skeleton_links)

    # joint_weights and sigmas — required by MMPose metainfo
    joint_weights_str = repr([1.0] * num_kpts)
    sigmas_str = repr([0.05] * num_kpts)

    # MPS float64 workaround
    mps_block = ""
    if device == "mps":
        mps_block = '''
    # --- MPS float64 workaround ---
    import torch
    torch.backends.mps.is_available = lambda: False
    print("  Note: MPS disabled (float64 incompatibility), using CPU instead.")
'''

    # Memory warning — ViT attention scales O(N^2) with token count (N = (imgsz/16)^2 + 1)
    mem_warning = ""
    num_tokens = (imgsz // 16) ** 2 + 1
    if imgsz > 256 or num_tokens > 257:
        mem_warning = f'''
    print("  WARNING: imgsz={imgsz} produces {num_tokens} ViT tokens.")
    print("  ViT attention is O(N^2) — memory grows quickly above 256x256.")
    print("  Reference ViTPose-B is trained at 256x192. Consider imgsz=256.")
    print("  If training crashes (OOM), reduce batch_size or imgsz.")
    print()
'''

    script = f'''#!/usr/bin/env python3
"""
OpenLabel \u2014 ViTPose Training Script (ViT-Base)
==================================================
Uses MMPose with a ViT-Base (Vision Transformer) backbone for
state-of-the-art keypoint detection.

    python train.py
"""

import subprocess
import sys

def install_packages():
    # Pin setuptools to avoid pkg_resources removal (setuptools >= 78)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q",
                           "setuptools>=67,<78"])
    # Cython required to build xtcocotools (mmpose dependency)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "Cython"])

    packages = [
        "torch", "torchvision",
        "mmengine",
        "mmcv>=2.0.0,<2.2.0",
        "mmdet>=3.0.0",
        "mmpose>=1.0.0",
        "mmpretrain>=1.0.0",   # provides VisionTransformer backbone (mmpose has no ViT)
        "timm",
        "matplotlib", "Pillow", "numpy",
    ]
    for pkg in packages:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])
    print("All packages installed.")

{_pip_extras(device)}

if __name__ == "__main__":
    print("=" * 60)
    print("  OpenLabel \u2014 ViTPose (ViT-Base) Training")
    print("=" * 60)
    print()

    print("[1/3] Installing dependencies...")
    install_packages()
{mps_block}
    # --- PyTorch 2.6+ compatibility ---
    import torch
    _orig_torch_load = torch.load
    def _patched_torch_load(*args, **kwargs):
        kwargs.setdefault("weights_only", False)
        return _orig_torch_load(*args, **kwargs)
    torch.load = _patched_torch_load

    import os
    import json
    import numpy as np
    from PIL import Image
    from mmengine.config import Config
    from mmengine.runner import Runner

    KEYPOINT_NAMES = {repr(keypoint_names)}
    SKELETON = {repr(skeleton)}
    NUM_KPTS = {num_kpts}

    print()
    print("[2/3] Training...")
    print(f"  Device:     {device}")
    print(f"  Epochs:     {epochs}")
    print(f"  Batch size: {batch_size}")
    print(f"  Image size: {imgsz}")
    print(f"  LR:         {lr}")
    print()
{mem_warning}
    cat_file = "{category_file}"
    train_json = os.path.abspath(cat_file)
    val_json = os.path.abspath(cat_file.replace("train/", "val/"))
    train_img_dir = os.path.abspath("train/images")
    val_img_dir = os.path.abspath("val/images")

    dataset_info = dict(
        dataset_name="openlabel",
        joint_weights={joint_weights_str},
        sigmas={sigmas_str},
        keypoint_info={{
{kpt_info_str}
        }},
        skeleton_info={{
{skeleton_links_str}
        }},
    )

    # Shared val/test pipeline
    val_pipeline = [
        dict(type="LoadImage"),
        dict(type="GetBBoxCenterScale"),
        dict(type="TopdownAffine", input_size=({imgsz}, {imgsz})),
        dict(type="PackPoseInputs"),
    ]

    cfg_dict = dict(
        default_scope="mmpose",
        model=dict(
            type="TopdownPoseEstimator",
            data_preprocessor=dict(
                type="PoseDataPreprocessor",
                mean=[123.675, 116.28, 103.53],
                std=[58.395, 57.12, 57.375],
                bgr_to_rgb=True,
            ),
            backbone=dict(
                # mmpose has no ViT class — use VisionTransformer from mmpretrain.
                # arch="base" sets the ViT-B hyperparameters internally.
                type="mmpretrain.VisionTransformer",
                arch="base",
                img_size=({imgsz}, {imgsz}),
                patch_size=16,
                drop_path_rate=0.3,
                with_cls_token=True,    # required so MAE pretrained pos_embed loads
                out_type="featmap",     # head needs feature map, not cls token
                out_indices=-1,
                init_cfg=dict(
                    type="Pretrained",
                    # MAE-pretrained ViT-B; mmengine resizes pos_embed to our img_size.
                    checkpoint="https://download.openmmlab.com/mmpose/v1/pretrained_models/mae_pretrain_vit_base.pth",
                ),
            ),
            head=dict(
                type="HeatmapHead",
                in_channels=768,
                out_channels={num_kpts},
                deconv_out_channels=(256, 256),
                deconv_kernel_sizes=(4, 4),
                loss=dict(type="KeypointMSELoss", use_target_weight=True),
                decoder=dict(type="MSRAHeatmap", input_size=({imgsz}, {imgsz}), heatmap_size=({heatmap_size}, {heatmap_size}), sigma=2),
            ),
        ),
        train_dataloader=dict(
            batch_size={batch_size},
            num_workers=2,
            dataset=dict(
                type="CocoDataset",
                data_root=".",
                ann_file=train_json,
                data_prefix=dict(img="train/images"),
                metainfo=dataset_info,
                pipeline=[
                    dict(type="LoadImage"),
                    dict(type="GetBBoxCenterScale"),
                    dict(type="TopdownAffine", input_size=({imgsz}, {imgsz})),
                    dict(type="GenerateTarget", encoder=dict(type="MSRAHeatmap", input_size=({imgsz}, {imgsz}), heatmap_size=({heatmap_size}, {heatmap_size}), sigma=2)),
                    dict(type="PackPoseInputs"),
                ],
            ),
        ),
        val_dataloader=dict(
            batch_size={batch_size},
            num_workers=2,
            dataset=dict(
                type="CocoDataset",
                data_root=".",
                ann_file=val_json,
                data_prefix=dict(img="val/images"),
                metainfo=dataset_info,
                pipeline=val_pipeline,
            ),
        ),
        test_dataloader=dict(
            batch_size=1,
            num_workers=2,
            dataset=dict(
                type="CocoDataset",
                data_root=".",
                ann_file=val_json,
                data_prefix=dict(img="val/images"),
                metainfo=dataset_info,
                pipeline=val_pipeline,
            ),
        ),
        val_evaluator=dict(type="CocoMetric", ann_file=val_json),
        test_evaluator=dict(type="CocoMetric", ann_file=val_json),
        train_cfg=dict(by_epoch=True, max_epochs={epochs}, val_interval=10),
        val_cfg=dict(),
        test_cfg=dict(),
        optim_wrapper=dict(
            optimizer=dict(type="AdamW", lr={lr}, weight_decay=0.1),
            paramwise_cfg=dict(
                custom_keys=dict(
                    backbone=dict(lr_mult=0.1),
                ),
            ),
        ),
        default_hooks=dict(
            checkpoint=dict(type="CheckpointHook", interval=10, save_best="coco/AP", rule="greater"),
            logger=dict(type="LoggerHook", interval=50),
        ),
        work_dir="work_dirs/vitpose_b",
        launcher="none",
    )

    cfg = Config(cfg_dict)
    runner = Runner.from_cfg(cfg)
    runner.train()

    print("Training complete!")

    # --- Inference demo ---
    print()
    print("[3/3] Inference demo...")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mmpose.apis import init_model, inference_topdown
    from mmpose.structures import merge_data_samples

    work_dir = "work_dirs/vitpose_b"
    ckpt_path = None
    if os.path.exists(os.path.join(work_dir, "best_coco")):
        best_dir = os.path.join(work_dir, "best_coco")
        ckpts = [f for f in os.listdir(best_dir) if f.endswith(".pth")]
        if ckpts:
            ckpt_path = os.path.join(best_dir, ckpts[0])
    if not ckpt_path:
        ckpt_path = os.path.join(work_dir, "epoch_{epochs}.pth")

    print(f"  Using checkpoint: {{ckpt_path}}")

    demo_dir = val_img_dir if os.path.exists(val_img_dir) else train_img_dir
    demo_images = [f for f in os.listdir(demo_dir) if f.lower().endswith((".png", ".jpg", ".jpeg"))]

    if demo_images:
        demo_path = os.path.join(demo_dir, demo_images[0])
        demo_img = Image.open(demo_path).convert("RGB")
        orig_w, orig_h = demo_img.size

        bboxes = [[0, 0, orig_w, orig_h]]

        pose_model = init_model(cfg, ckpt_path, device="cpu")
        results = inference_topdown(pose_model, demo_path, bboxes)
        result = merge_data_samples(results)

        pred_kpts = result.pred_instances.keypoints[0]
        pred_scores = result.pred_instances.keypoint_scores[0]
        pred_kpts = np.column_stack([pred_kpts, pred_scores])

{_visualization_block(keypoint_names, skeleton)}
'''
    return script


def generate_coco_resnet_script(params):
    """Generate a pure PyTorch ResNet50 + regression head training script (COCO format)."""
    device = params.get("device", "cpu")
    epochs = params.get("epochs", 100)
    batch_size = params.get("batch_size", 16)
    imgsz = params.get("imgsz", 640)
    lr = params.get("lr", 0.001)
    patience = params.get("patience", 50)
    keypoint_names = params.get("keypoint_names", [])
    skeleton = params.get("skeleton", [])
    category_file = params.get("category_file", "train/object.json")

    torch_device = _torch_device(device)

    script = f'''#!/usr/bin/env python3
"""
OpenLabel \u2014 COCO Keypoints Training Script (PyTorch)
======================================================
Lightweight keypoint detector: ResNet50 + regression head.
No external framework dependencies \u2014 pure PyTorch.

    python train.py
"""

import subprocess
import sys

def install_packages():
    packages = ["torch", "torchvision", "matplotlib", "Pillow", "numpy"]
    for pkg in packages:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])
    print("All packages installed.")

{_pip_extras(device)}

if __name__ == "__main__":
    print("=" * 60)
    print("  OpenLabel \u2014 PyTorch ResNet50 Keypoint Training")
    print("=" * 60)
    print()

    print("[1/3] Installing dependencies...")
    install_packages()

    import os
    import json
    import numpy as np
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import Dataset, DataLoader
    from torchvision import transforms, models
    from PIL import Image

    _dev = "{torch_device}"
    if _dev == "cuda" and torch.cuda.is_available():
        DEVICE = torch.device("cuda")
    elif _dev == "mps" and hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        DEVICE = torch.device("mps")
    else:
        DEVICE = torch.device("cpu")
    print(f"  Device: {{DEVICE}}")

    EPOCHS = {epochs}
    BATCH_SIZE = {batch_size}
    LR = {lr}
    IMG_SIZE = {imgsz}
    KEYPOINT_NAMES = {repr(keypoint_names)}
    SKELETON = {repr(skeleton)}
    NUM_KPTS = len(KEYPOINT_NAMES)

    # --- Dataset ---
    class KeypointDataset(Dataset):
        def __init__(self, json_path, img_dir, img_size=IMG_SIZE):
            with open(json_path) as f:
                coco = json.load(f)
            self.img_dir = img_dir
            self.img_size = img_size
            self.img_map = {{img["id"]: img for img in coco["images"]}}
            self.annotations = coco["annotations"]
            self.transform = transforms.Compose([
                transforms.Resize((img_size, img_size)),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ])

        def __len__(self):
            return len(self.annotations)

        def __getitem__(self, idx):
            ann = self.annotations[idx]
            img_info = self.img_map[ann["image_id"]]
            img_path = os.path.join(self.img_dir, img_info["file_name"])
            img = Image.open(img_path).convert("RGB")
            orig_w, orig_h = img.size
            kpts = ann["keypoints"]
            coords = np.zeros((NUM_KPTS, 3), dtype=np.float32)
            for i in range(NUM_KPTS):
                x, y, v = kpts[i*3], kpts[i*3+1], kpts[i*3+2]
                coords[i] = [x / orig_w, y / orig_h, v]
            return self.transform(img), torch.tensor(coords, dtype=torch.float32)

    # --- Model ---
    class PoseNet(nn.Module):
        def __init__(self, num_keypoints):
            super().__init__()
            backbone = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
            self.features = nn.Sequential(*list(backbone.children())[:-2])
            self.head = nn.Sequential(
                nn.AdaptiveAvgPool2d(1), nn.Flatten(),
                nn.Linear(2048, 512), nn.ReLU(), nn.Dropout(0.3),
                nn.Linear(512, num_keypoints * 3),
            )
        def forward(self, x):
            return self.head(self.features(x)).view(-1, NUM_KPTS, 3)

    # --- Training ---
    print()
    print("[2/3] Training...")

    cat_file = "{category_file}"
    train_json = cat_file
    val_json = cat_file.replace("train/", "val/")
    train_img_dir = "train/images"
    val_img_dir = "val/images"

    train_ds = KeypointDataset(train_json, train_img_dir)
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)

    model = PoseNet(NUM_KPTS).to(DEVICE)
    optimizer = optim.Adam(model.parameters(), lr=LR)
    criterion = nn.SmoothL1Loss()

    best_loss = float("inf")
    patience_counter = 0

    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0
        for imgs, targets in train_loader:
            imgs, targets = imgs.to(DEVICE), targets.to(DEVICE)
            preds = model(imgs)
            vis_mask = (targets[:, :, 2] > 0).unsqueeze(-1).expand_as(preds)
            loss = criterion(preds[vis_mask], targets[vis_mask])
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        avg_loss = total_loss / len(train_loader)
        print(f"  Epoch {{epoch+1}}/{{EPOCHS}}  loss={{avg_loss:.4f}}")

        if avg_loss < best_loss:
            best_loss = avg_loss
            torch.save(model.state_dict(), "best_model.pth")
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= {patience}:
                print(f"  Early stopping at epoch {{epoch+1}}")
                break

    print(f"  Best loss: {{best_loss:.4f}}")

    # --- Inference demo ---
    print()
    print("[3/3] Inference demo...")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    model.load_state_dict(torch.load("best_model.pth", map_location=DEVICE))
    model.eval()

    demo_dir = val_img_dir if os.path.exists(val_img_dir) else train_img_dir
    demo_images = [f for f in os.listdir(demo_dir) if f.lower().endswith((".png", ".jpg", ".jpeg"))]

    if demo_images:
        demo_path = os.path.join(demo_dir, demo_images[0])
        demo_img = Image.open(demo_path).convert("RGB")
        orig_w, orig_h = demo_img.size

        transform = transforms.Compose([
            transforms.Resize((IMG_SIZE, IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        inp = transform(demo_img).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            pred = model(inp)[0].cpu().numpy()

        # Convert normalized coords to pixel coords
        pred_kpts = np.zeros((NUM_KPTS, 3))
        for i in range(NUM_KPTS):
            pred_kpts[i] = [pred[i][0] * orig_w, pred[i][1] * orig_h, pred[i][2]]

{_visualization_block(keypoint_names, skeleton)}
'''
    return script


def generate_dlc_script(params):
    """Generate a DeepLabCut 3.x (PyTorch) training script."""
    epochs = params.get("epochs", 100)
    batch_size = params.get("batch_size", 8)
    keypoint_names = params.get("keypoint_names", [])
    skeleton = params.get("skeleton", [])

    # Skeleton: convert index pairs to bodypart-name pairs (DLC config format)
    skeleton_pairs = []
    for conn in skeleton:
        if len(conn) >= 2 and conn[0] < len(keypoint_names) and conn[1] < len(keypoint_names):
            skeleton_pairs.append([keypoint_names[conn[0]], keypoint_names[conn[1]]])

    script = f'''#!/usr/bin/env python3
"""
OpenLabel \u2014 DeepLabCut Training Script (DLC 3.x / PyTorch)
===========================================================
Builds a real DLC project from the OpenLabel raw export
(train/, val/, CollectedData_*.csv) and trains a PyTorch model.

    python train.py

Override device with the DLC_DEVICE env var:
    DLC_DEVICE=cuda python train.py
    DLC_DEVICE=mps  python train.py
    DLC_DEVICE=cpu  python train.py
"""
from __future__ import annotations

import subprocess
import sys


def install_packages():
    # DLC 3.x runs on PyTorch (no TF). Don't pull tables 3.8 / blosc2 2.0.x.
    pkgs = [
        "numpy<2",                      # DLC 3.0 still requires numpy < 2
        "torch", "torchvision",
        "deeplabcut>=3.0.0rc14,<4.0",   # PyTorch backend, no [tf] extras
        "imageio", "imageio-ffmpeg",    # synthetic anchor video
        "tables>=3.9",
        "pyyaml", "pandas",
        "matplotlib", "Pillow",
    ]
    for pkg in pkgs:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])
    print("All packages installed.")


def autodetect_device() -> str:
    """cuda \u2192 mps \u2192 cpu (override via DLC_DEVICE env var)."""
    import os as _os
    override = _os.environ.get("DLC_DEVICE", "").strip().lower()
    if override in ("cuda", "mps", "cpu"):
        return override
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def make_synthetic_video(out_path: str, frame_path: str, num_frames: int = 2) -> str:
    """Tiny mp4 from a single frame \u2014 needed only as an anchor for create_new_project()."""
    import imageio.v2 as imageio
    import numpy as np
    from PIL import Image
    arr = np.array(Image.open(frame_path).convert("RGB"))
    writer = imageio.get_writer(out_path, fps=1, codec="libx264")
    for _ in range(num_frames):
        writer.append_data(arr)
    writer.close()
    return out_path


def csv_has_individuals(csv_path: str) -> bool:
    """True iff the CSV's first cell is 'individuals' (multi-animal layout)."""
    with open(csv_path) as f:
        first = f.readline().split(",")[0].strip().strip('"')
    return first.lower() == "individuals"


def import_labeled_frames(csv_path, image_dir, labeled_dir, scorer, bodyparts, prefix):
    """Read OpenLabel CSV, copy images into labeled_dir with a prefix to avoid
    train/val name collisions, and return a DLC-style MultiIndex DataFrame."""
    import os as _os
    import shutil
    import numpy as np
    import pandas as pd

    # OpenLabel writes 3 header rows: scorer / bodyparts / coords.
    df_raw = pd.read_csv(csv_path, header=[0, 1, 2], index_col=0)

    csv_scorer = df_raw.columns[0][0]
    csv_bodyparts = []
    for col in df_raw.columns:
        if col[1] not in csv_bodyparts:
            csv_bodyparts.append(col[1])

    n_rows = len(df_raw)
    n_bp = len(bodyparts)
    data = np.full((n_rows, n_bp * 2), np.nan)

    # Re-sort columns into the order requested by the project config (critical
    # \u2014 if we don't, DLC trains "the wrong points").
    for i, bp in enumerate(bodyparts):
        if bp not in csv_bodyparts:
            continue
        x_col = (csv_scorer, bp, "x")
        y_col = (csv_scorer, bp, "y")
        if x_col in df_raw.columns:
            data[:, i * 2]     = pd.to_numeric(df_raw[x_col], errors="coerce").values
        if y_col in df_raw.columns:
            data[:, i * 2 + 1] = pd.to_numeric(df_raw[y_col], errors="coerce").values

    # Copy images and build deduplicated MultiIndex (labeled-data, video, file)
    video_name = _os.path.basename(labeled_dir)
    new_tuples = []
    for src_path in df_raw.index:
        basename = _os.path.basename(str(src_path))
        new_basename = prefix + basename
        src_full = _os.path.join(image_dir, basename)
        dst_full = _os.path.join(labeled_dir, new_basename)
        if _os.path.exists(src_full) and not _os.path.exists(dst_full):
            shutil.copy2(src_full, dst_full)
        new_tuples.append(("labeled-data", video_name, new_basename))

    columns = pd.MultiIndex.from_product(
        [[scorer], bodyparts, ["x", "y"]],
        names=["scorer", "bodyparts", "coords"],
    )
    index = pd.MultiIndex.from_tuples(new_tuples)
    return pd.DataFrame(data, index=index, columns=columns)


if __name__ == "__main__":
    print("=" * 60)
    print("  OpenLabel \u2014 DeepLabCut Training (DLC 3.x / PyTorch)")
    print("=" * 60)
    print()

    print("[1/3] Installing dependencies...")
    install_packages()

    import os
    import glob
    import yaml
    import numpy as np
    import pandas as pd
    from PIL import Image

    import deeplabcut
    from deeplabcut.core.engine import Engine

    BODYPARTS = {repr(keypoint_names)}
    SKELETON_PAIRS = {repr(skeleton_pairs)}
    EPOCHS = {epochs}
    BATCH_SIZE = {batch_size}

    device = autodetect_device()
    print(f"  Device: {{device}}")

    project_root = os.path.abspath(".")
    train_csvs = sorted(glob.glob("train/CollectedData_*.csv"))
    val_csvs   = sorted(glob.glob("val/CollectedData_*.csv"))

    if not train_csvs:
        print("ERROR: no CollectedData_*.csv found in train/")
        sys.exit(1)

    # multianimal only when CSV actually has an 'individuals' header level
    multianimal = any(csv_has_individuals(p) for p in train_csvs + val_csvs)

    train_imgs = sorted(
        glob.glob("train/images/*.png")
        + glob.glob("train/images/*.jpg")
        + glob.glob("train/images/*.jpeg")
    )
    if not train_imgs:
        print("ERROR: no training images found in train/images/")
        sys.exit(1)

    # --- Build a real DLC project ---
    video_dir = os.path.join(project_root, "dlc_anchor_videos")
    os.makedirs(video_dir, exist_ok=True)
    anchor_video = os.path.join(video_dir, "openlabel_anchor.mp4")
    make_synthetic_video(anchor_video, train_imgs[0])
    print(f"  Anchor video: {{anchor_video}}")

    project_name = "OpenLabel_DLC"
    experimenter = "OpenLabel"
    config_path = deeplabcut.create_new_project(
        project_name, experimenter, [anchor_video],
        working_directory=project_root, copy_videos=True,
        multianimal=multianimal,
    )
    print(f"  Config: {{config_path}}")

    scorer = experimenter
    project_dir = os.path.dirname(config_path)
    video_name = os.path.splitext(os.path.basename(anchor_video))[0]
    labeled_dir = os.path.join(project_dir, "labeled-data", video_name)
    os.makedirs(labeled_dir, exist_ok=True)

    train_dfs, val_dfs = [], []
    for csv_path in train_csvs:
        train_dfs.append(import_labeled_frames(
            csv_path, "train/images", labeled_dir, scorer, BODYPARTS, prefix="train_"
        ))
    for csv_path in val_csvs:
        val_dfs.append(import_labeled_frames(
            csv_path, "val/images", labeled_dir, scorer, BODYPARTS, prefix="val_"
        ))

    all_dfs = train_dfs + val_dfs
    if not all_dfs:
        print("ERROR: no annotations imported")
        sys.exit(1)

    combined = pd.concat(all_dfs, axis=0)
    combined = combined[~combined.index.duplicated(keep="first")]

    h5_path = os.path.join(labeled_dir, f"CollectedData_{{scorer}}.h5")
    csv_out = os.path.join(labeled_dir, f"CollectedData_{{scorer}}.csv")
    combined.to_hdf(h5_path, key="df_with_missing", mode="w")
    combined.to_csv(csv_out)
    print(f"  Imported {{len(combined)}} labeled frames")

    n_train = sum(len(df) for df in train_dfs)
    n_val   = sum(len(df) for df in val_dfs)
    n_total = n_train + n_val
    train_indices = list(range(n_train))
    test_indices  = list(range(n_train, n_total))
    training_fraction = round(n_train / n_total, 2) if n_total > 0 else 0.95

    # Patch the project config (bodyparts/skeleton/split/etc.)
    with open(config_path) as f:
        cfg = yaml.safe_load(f)
    cfg["bodyparts"] = list(BODYPARTS)
    cfg["skeleton"] = SKELETON_PAIRS
    cfg["TrainingFraction"] = [training_fraction]
    cfg["pcutoff"] = 0.4
    cfg["multianimalproject"] = bool(multianimal)
    with open(config_path, "w") as f:
        yaml.safe_dump(cfg, f, sort_keys=False)

    # --- Train ---
    print()
    print("[2/3] Training...")
    print(f"  Epochs:     {{EPOCHS}}")
    print(f"  Batch size: {{BATCH_SIZE}}")
    print(f"  Train/Val:  {{n_train}} / {{n_val}}  (fraction={{training_fraction}})")
    print(f"  Device:     {{device}}")
    print()

    deeplabcut.create_training_dataset(
        config_path,
        num_shuffles=1,
        trainIndices=[train_indices],
        testIndices=[test_indices],
        userfeedback=False,
        net_type="resnet_50",
        engine=Engine.PYTORCH,
    )

    deeplabcut.train_network(
        config_path,
        shuffle=1,
        trainingsetindex=0,
        epochs=EPOCHS,
        save_epochs=max(1, EPOCHS // 10),
        batch_size=BATCH_SIZE,
        device=device,
        engine=Engine.PYTORCH,
    )

    print("Training complete!")

    # --- Inference demo ---
    print()
    print("[3/3] Inference demo...")

    demo_imgs = sorted(
        glob.glob("val/images/*.png")
        + glob.glob("val/images/*.jpg")
        + glob.glob("val/images/*.jpeg")
    )
    if not demo_imgs:
        demo_imgs = train_imgs

    if demo_imgs:
        demo_img_path = demo_imgs[0]
        demo_video = os.path.join(video_dir, "demo_video.mp4")
        make_synthetic_video(demo_video, demo_img_path, num_frames=2)

        deeplabcut.analyze_videos(
            config_path, [demo_video],
            shuffle=1, save_as_csv=True,
            engine=Engine.PYTORCH, device=device,
        )

        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        demo_img = Image.open(demo_img_path).convert("RGB")
        fig, axes = plt.subplots(1, 2, figsize=(16, 8))
        axes[0].imshow(demo_img); axes[0].set_title("Original");   axes[0].axis("off")
        axes[1].imshow(demo_img); axes[1].set_title("Prediction"); axes[1].axis("off")

        results_csvs = sorted(glob.glob(os.path.join(video_dir, "demo_video*.csv")))
        if results_csvs:
            try:
                res = pd.read_csv(results_csvs[0], header=[0, 1, 2], index_col=0)
                row = res.iloc[0]
                colors = plt.cm.tab20(np.linspace(0, 1, max(len(BODYPARTS), 1)))
                for i, bp in enumerate(BODYPARTS):
                    try:
                        x  = float(row[(scorer, bp, "x")])
                        y  = float(row[(scorer, bp, "y")])
                        lk = float(row[(scorer, bp, "likelihood")])
                    except (KeyError, ValueError):
                        continue
                    if lk > 0.3:
                        axes[1].plot(x, y, "o", color=colors[i], markersize=6)
                        axes[1].annotate(
                            bp, (x, y), fontsize=6, color="white",
                            bbox=dict(boxstyle="round,pad=0.15", fc="black", alpha=0.6),
                            ha="center", va="bottom", xytext=(0, 5),
                            textcoords="offset points",
                        )
                for pair in SKELETON_PAIRS:
                    if len(pair) >= 2:
                        try:
                            x1 = float(row[(scorer, pair[0], "x")])
                            y1 = float(row[(scorer, pair[0], "y")])
                            x2 = float(row[(scorer, pair[1], "x")])
                            y2 = float(row[(scorer, pair[1], "y")])
                            axes[1].plot([x1, x2], [y1, y2], "c-", linewidth=2, alpha=0.7)
                        except (KeyError, ValueError):
                            pass
            except Exception as e:
                print(f"  Could not parse predictions: {{e}}")

        plt.suptitle("OpenLabel \u2014 DeepLabCut Result", fontsize=14, fontweight="bold")
        plt.tight_layout()
        plt.savefig("inference_result.png", dpi=150, bbox_inches="tight")
        print(f"  Result saved to: inference_result.png")
        print("  (Open the saved image to view the result)")

    print("Done!")
'''
    return script


def generate_training_script(format_name, params):
    """Generate a training script for the given format.

    Args:
        format_name: "yolo", "coco", or "dlc"
        params: dict with training parameters
            For COCO: params["model_variant"] can be "mmpose", "vitpose", or "resnet"

    Returns:
        str: Python script content
    """
    if format_name == "yolo":
        return generate_yolo_script(params)
    elif format_name == "coco":
        variant = params.get("model_variant", "mmpose")
        if variant == "vitpose":
            return generate_coco_vitpose_script(params)
        elif variant == "resnet":
            return generate_coco_resnet_script(params)
        else:  # "mmpose" (default)
            return generate_coco_mmpose_script(params)
    elif format_name == "dlc":
        return generate_dlc_script(params)
    else:
        raise ValueError(f"Unknown format: {format_name}")
