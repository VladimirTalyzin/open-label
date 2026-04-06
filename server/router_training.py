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
    matplotlib.use("TkAgg")
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
    plt.show()
    print()
    print("Done!")
'''
    return script


def _inference_demo_block(keypoint_names, skeleton):
    """Shared matplotlib inference visualization block for COCO-based scripts."""
    return f'''
    # --- Inference demo ---
    print()
    print("[3/3] Inference demo...")

    import matplotlib
    matplotlib.use("TkAgg")
    import matplotlib.pyplot as plt

    demo_dir = val_img_dir if os.path.exists(val_img_dir) else train_img_dir
    demo_images = [f for f in os.listdir(demo_dir) if f.lower().endswith((".png", ".jpg", ".jpeg"))]

    if demo_images:
        demo_path = os.path.join(demo_dir, demo_images[0])
        demo_img = Image.open(demo_path).convert("RGB")
        orig_w, orig_h = demo_img.size

        fig, axes = plt.subplots(1, 2, figsize=(16, 8))
        axes[0].imshow(demo_img)
        axes[0].set_title("Original")
        axes[0].axis("off")

        axes[1].imshow(demo_img)
        axes[1].set_title("Prediction")
        axes[1].axis("off")

        COLORS = plt.cm.tab20(np.linspace(0, 1, max(NUM_KPTS, 1)))

        # pred_kpts should be set before this block: shape (NUM_KPTS, 3) with pixel coords
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
        plt.show()

    print("Done!")
'''


def generate_coco_mmpose_script(params):
    """Generate an MMPose training script (HRNet-W48, COCO format)."""
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
OpenLabel — COCO Keypoints Training Script (PyTorch)
=====================================================
Lightweight keypoint detector training using a ResNet + Heatmap head.
No external framework dependencies (MMPose, etc.) — pure PyTorch.

    python train.py
"""

import subprocess
import sys

def install_packages():
    packages = ["torch", "torchvision", "matplotlib", "Pillow", "numpy", "pycocotools"]
    for pkg in packages:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])
    print("All packages installed.")

{_pip_extras(device)}

if __name__ == "__main__":
    print("=" * 60)
    print("  OpenLabel — COCO Keypoints Training")
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
    from PIL import Image, ImageDraw

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

            img_tensor = self.transform(img)
            return img_tensor, torch.tensor(coords, dtype=torch.float32)

    # --- Model ---
    class PoseNet(nn.Module):
        def __init__(self, num_keypoints):
            super().__init__()
            backbone = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
            self.features = nn.Sequential(*list(backbone.children())[:-2])
            self.head = nn.Sequential(
                nn.AdaptiveAvgPool2d(1),
                nn.Flatten(),
                nn.Linear(2048, 512),
                nn.ReLU(),
                nn.Dropout(0.3),
                nn.Linear(512, num_keypoints * 3),
            )

        def forward(self, x):
            x = self.features(x)
            x = self.head(x)
            return x.view(-1, NUM_KPTS, 3)

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

    val_ds = None
    if os.path.exists(val_json) and os.path.exists(val_img_dir):
        val_ds = KeypointDataset(val_json, val_img_dir)

    model = PoseNet(NUM_KPTS).to(DEVICE)
    optimizer = optim.Adam(model.parameters(), lr=LR)
    criterion = nn.SmoothL1Loss()

    best_loss = float("inf")
    patience_counter = 0

    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0
        for imgs, targets in train_loader:
            imgs = imgs.to(DEVICE)
            targets = targets.to(DEVICE)
            preds = model(imgs)
            # Mask out invisible keypoints
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
    matplotlib.use("TkAgg")
    import matplotlib.pyplot as plt

    model.load_state_dict(torch.load("best_model.pth", map_location=DEVICE))
    model.eval()

    demo_dir = val_img_dir if os.path.exists(val_img_dir) else train_img_dir
    demo_images = [f for f in os.listdir(demo_dir) if f.lower().endswith((".png", ".jpg", ".jpeg"))]

    if demo_images:
        demo_path = os.path.join(demo_dir, demo_images[0])
        img = Image.open(demo_path).convert("RGB")
        orig_w, orig_h = img.size

        transform = transforms.Compose([
            transforms.Resize((IMG_SIZE, IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        inp = transform(img).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            pred = model(inp)[0].cpu().numpy()

        fig, axes = plt.subplots(1, 2, figsize=(16, 8))
        axes[0].imshow(img)
        axes[0].set_title("Original")
        axes[0].axis("off")

        axes[1].imshow(img)
        axes[1].set_title("Prediction")
        axes[1].axis("off")

        COLORS = plt.cm.tab20(np.linspace(0, 1, max(NUM_KPTS, 1)))

        for conn in SKELETON:
            if len(conn) >= 2:
                i1, i2 = conn[0], conn[1]
                if i1 < NUM_KPTS and i2 < NUM_KPTS:
                    if pred[i1][2] > 0.3 and pred[i2][2] > 0.3:
                        axes[1].plot(
                            [pred[i1][0]*orig_w, pred[i2][0]*orig_w],
                            [pred[i1][1]*orig_h, pred[i2][1]*orig_h],
                            "c-", linewidth=2, alpha=0.7,
                        )

        for idx, kp in enumerate(pred):
            if kp[2] > 0.3:
                px, py = kp[0]*orig_w, kp[1]*orig_h
                color = COLORS[idx % len(COLORS)]
                axes[1].plot(px, py, "o", color=color, markersize=6)
                if idx < len(KEYPOINT_NAMES):
                    axes[1].annotate(
                        KEYPOINT_NAMES[idx], (px, py),
                        fontsize=6, color="white",
                        bbox=dict(boxstyle="round,pad=0.15", fc="black", alpha=0.6),
                        ha="center", va="bottom", xytext=(0, 5),
                        textcoords="offset points",
                    )

        plt.suptitle("OpenLabel — Keypoint Inference Result", fontsize=14, fontweight="bold")
        plt.tight_layout()
        plt.savefig("inference_result.png", dpi=150, bbox_inches="tight")
        print(f"  Result saved to: inference_result.png")
        plt.show()

    print("Done!")
'''
    return script


def generate_dlc_script(params):
    """Generate a DeepLabCut training script."""
    device = params.get("device", "cpu")
    epochs = params.get("epochs", 100)
    batch_size = params.get("batch_size", 8)
    keypoint_names = params.get("keypoint_names", [])
    skeleton = params.get("skeleton", [])

    gpu_flag = "True" if device in ("gpu", "rocm") else "False"

    script = f'''#!/usr/bin/env python3
"""
OpenLabel — DeepLabCut Training Script
=======================================
    python train.py
"""

import subprocess
import sys

def install_packages():
    packages = ["deeplabcut[tf]", "matplotlib", "Pillow", "numpy"]
    for pkg in packages:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])
    print("All packages installed.")

if __name__ == "__main__":
    print("=" * 60)
    print("  OpenLabel — DeepLabCut Training")
    print("=" * 60)
    print()

    print("[1/3] Installing dependencies...")
    install_packages()

    import os
    import deeplabcut
    import matplotlib
    matplotlib.use("TkAgg")
    import matplotlib.pyplot as plt
    from PIL import Image
    import numpy as np

    config_path = os.path.abspath("config.yaml")
    print(f"  Config: {{config_path}}")

    # Step 2: Train
    print()
    print("[2/3] Training...")
    print(f"  Epochs: {epochs}")
    print(f"  GPU:    {gpu_flag}")
    print()

    deeplabcut.create_training_dataset(config_path)
    deeplabcut.train_network(
        config_path,
        maxiters={epochs * 1000},
        displayiters=100,
        saveiters=5000,
        allow_growth={gpu_flag},
    )

    # Step 3: Inference demo
    print()
    print("[3/3] Inference demo...")

    val_img_dir = "val/images"
    if not os.path.exists(val_img_dir):
        val_img_dir = "train/images"

    demo_images = [f for f in os.listdir(val_img_dir) if f.lower().endswith((".png", ".jpg", ".jpeg"))]

    if demo_images:
        demo_path = os.path.join(val_img_dir, demo_images[0])
        print(f"  Demo image: {{demo_path}}")

        deeplabcut.analyze_videos(config_path, [demo_path], save_as_csv=True)

        img = Image.open(demo_path)
        fig, axes = plt.subplots(1, 2, figsize=(16, 8))
        axes[0].imshow(img)
        axes[0].set_title("Original")
        axes[0].axis("off")

        axes[1].imshow(img)
        axes[1].set_title("DeepLabCut Prediction")
        axes[1].axis("off")

        KEYPOINT_NAMES = {repr(keypoint_names)}
        print(f"  Keypoints: {{KEYPOINT_NAMES}}")
        print("  (Full visualization available via deeplabcut.plot_trajectories)")

        plt.suptitle("OpenLabel — DeepLabCut Result", fontsize=14, fontweight="bold")
        plt.tight_layout()
        plt.savefig("inference_result.png", dpi=150, bbox_inches="tight")
        print(f"  Result saved to: inference_result.png")
        plt.show()

    print("Done!")
'''
    return script


def generate_training_script(format_name, params):
    """Generate a training script for the given format.

    Args:
        format_name: "yolo", "coco", or "dlc"
        params: dict with training parameters

    Returns:
        str: Python script content
    """
    if format_name == "yolo":
        return generate_yolo_script(params)
    elif format_name == "coco":
        return generate_mmpose_script(params)
    elif format_name == "dlc":
        return generate_dlc_script(params)
    else:
        raise ValueError(f"Unknown format: {format_name}")
