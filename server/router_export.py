import io
import csv
import math
import random
import shutil
import tempfile
import zipfile
from os import path, makedirs, remove
from json import load, dumps
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image

from utility import join_path
from helpers import get_script_directory, require_user, user_can_access_project
from augmentation import apply_mask_blur, generate_augmented

router = APIRouter()

_export_files = {}  # token -> {"path": str, "name": str}


def _load_project(id_project):
    """Load project settings and return (project_path, settings)."""
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    settings_file = join_path(project_path, "project_settings.json")
    if not path.exists(settings_file):
        raise HTTPException(status_code=404, detail="Project settings not found")

    with open(settings_file, "r") as f:
        settings = load(f)

    return project_path, settings


def _collect_annotated_images(project_path, settings):
    """Collect images that have skeleton annotations."""
    images = settings.get("images", [])
    skeletons_dir = join_path(project_path, "skeletons")
    result = []

    for img_data in images:
        image_name = img_data["image"]
        skeleton_file = join_path(skeletons_dir, f"{image_name}.json")
        if path.exists(skeleton_file):
            with open(skeleton_file, "r") as f:
                skeletons = load(f)
            if skeletons:
                result.append((image_name, skeletons))

    return result


def _get_image_dimensions(project_path, image_name):
    """Get image width and height."""
    image_path = join_path(project_path, "images", image_name)
    with Image.open(image_path) as img:
        return img.width, img.height


def _process_image(project_path, image_name):
    """Load image and apply skeleton mask blur if mask exists."""
    image_path = join_path(project_path, "images", image_name)
    image = Image.open(image_path).convert("RGB")

    mask_path = join_path(project_path, "skeleton_masks", f"{image_name}.png")
    if path.exists(mask_path):
        mask = Image.open(mask_path).convert("L")
        if mask.size != image.size:
            mask = mask.resize(image.size, Image.NEAREST)
        image = apply_mask_blur(image, mask)

    return image


def _compute_bbox(points, bbox_pad, img_width, img_height):
    """Compute bounding box from visible keypoints + padding."""
    visible_x = [p["x"] for p in points if p.get("visible", 2) > 0]
    visible_y = [p["y"] for p in points if p.get("visible", 2) > 0]

    if not visible_x:
        return None

    pad_left = bbox_pad.get("left", 0) if bbox_pad else 0
    pad_right = bbox_pad.get("right", 0) if bbox_pad else 0
    pad_top = bbox_pad.get("top", 0) if bbox_pad else 0
    pad_bottom = bbox_pad.get("bottom", 0) if bbox_pad else 0

    x1 = max(0, min(visible_x) - pad_left)
    y1 = max(0, min(visible_y) - pad_top)
    x2 = min(img_width, max(visible_x) + pad_right)
    y2 = min(img_height, max(visible_y) + pad_bottom)

    return x1, y1, x2 - x1, y2 - y1  # x, y, w, h


# --- Format Generators ---


def _generate_coco(entries, skeleton_template, output_dir, split_name):
    """Generate COCO Keypoints JSON files, one per category label."""
    keypoint_names = [p["name"] for p in skeleton_template.get("points", [])]
    connections = skeleton_template.get("connections", [])
    num_kpts = len(keypoint_names)

    # Group entries by label
    categories_data = {}  # label -> {"images": {}, "annotations": []}

    ann_id = 1
    img_id_map = {}  # (split, filename) -> img_id
    next_img_id = 1

    for entry in entries:
        filename = entry["filename"]
        img_w = entry["width"]
        img_h = entry["height"]

        for skel in entry["skeletons"]:
            label = skel.get("label", "object")

            if label not in categories_data:
                categories_data[label] = {"images": {}, "annotations": []}

            cat_data = categories_data[label]

            if filename not in cat_data["images"]:
                img_key = (split_name, filename)
                if img_key not in img_id_map:
                    img_id_map[img_key] = next_img_id
                    next_img_id += 1
                cat_data["images"][filename] = {
                    "id": img_id_map[img_key],
                    "file_name": filename,
                    "width": img_w,
                    "height": img_h,
                }

            image_id = cat_data["images"][filename]["id"]
            points = skel.get("points", [])

            # Build flat keypoints array [x1, y1, v1, x2, y2, v2, ...]
            kpts_flat = []
            for i in range(num_kpts):
                if i < len(points):
                    p = points[i]
                    v = p.get("visible", 2)
                    if v == 0:
                        kpts_flat.extend([0, 0, 0])
                    else:
                        kpts_flat.extend([round(p["x"], 2), round(p["y"], 2), v])
                else:
                    kpts_flat.extend([0, 0, 0])

            bbox = _compute_bbox(points, skel.get("bboxPad"), img_w, img_h)
            if bbox is None:
                continue

            bx, by, bw, bh = bbox

            cat_data["annotations"].append({
                "id": ann_id,
                "image_id": image_id,
                "category_id": 1,
                "keypoints": kpts_flat,
                "num_keypoints": sum(1 for p in points if p.get("visible", 2) > 0),
                "bbox": [round(bx, 2), round(by, 2), round(bw, 2), round(bh, 2)],
                "area": round(bw * bh, 2),
                "iscrowd": 0,
            })
            ann_id += 1

    # Write JSON files
    for label, cat_data in categories_data.items():
        coco_json = {
            "info": {"description": "OpenLabel export", "version": "1.0"},
            "categories": [{
                "id": 1,
                "name": label,
                "supercategory": "object",
                "keypoints": keypoint_names,
                "skeleton": connections,
            }],
            "images": list(cat_data["images"].values()),
            "annotations": cat_data["annotations"],
        }

        safe_label = "".join(c if c.isalnum() or c in "_-" else "_" for c in label)
        json_path = join_path(output_dir, split_name, f"{safe_label}.json")
        makedirs(path.dirname(json_path), exist_ok=True)

        with open(json_path, "w") as f:
            f.write(dumps(coco_json, indent=2))


def _generate_dlc(entries, skeleton_template, output_dir, split_name):
    """Generate DeepLabCut CSV files, one per category label."""
    keypoint_names = [p["name"] for p in skeleton_template.get("points", [])]
    connections = skeleton_template.get("connections", [])

    # Group by label
    label_entries = {}
    for entry in entries:
        for skel in entry["skeletons"]:
            label = skel.get("label", "object")
            if label not in label_entries:
                label_entries[label] = []
            label_entries[label].append((entry["filename"], skel))

    scorer = "DLC"

    for label, items in label_entries.items():
        safe_label = "".join(c if c.isalnum() or c in "_-" else "_" for c in label)
        csv_path = join_path(output_dir, split_name, f"CollectedData_{safe_label}.csv")
        makedirs(path.dirname(csv_path), exist_ok=True)

        output = io.StringIO()
        writer = csv.writer(output)

        # Header rows
        scorer_row = ["scorer"]
        bodyparts_row = ["bodyparts"]
        coords_row = ["coords"]
        for kp_name in keypoint_names:
            scorer_row.extend([scorer, scorer])
            bodyparts_row.extend([kp_name, kp_name])
            coords_row.extend(["x", "y"])

        writer.writerow(scorer_row)
        writer.writerow(bodyparts_row)
        writer.writerow(coords_row)

        for filename, skel in items:
            row = [f"labeled-data/{filename}"]
            points = skel.get("points", [])
            for i in range(len(keypoint_names)):
                if i < len(points):
                    p = points[i]
                    if p.get("visible", 2) == 0:
                        row.extend(["", ""])
                    else:
                        row.extend([round(p["x"], 1), round(p["y"], 1)])
                else:
                    row.extend(["", ""])
            writer.writerow(row)

        with open(csv_path, "w", newline="") as f:
            f.write(output.getvalue())

    # Config YAML (once, not per split)
    config_path = join_path(output_dir, "config.yaml")
    if not path.exists(config_path):
        skeleton_names = []
        for conn in connections:
            if len(conn) >= 2 and conn[0] < len(keypoint_names) and conn[1] < len(keypoint_names):
                skeleton_names.append(f"  - [{keypoint_names[conn[0]]}, {keypoint_names[conn[1]]}]")

        bodyparts_yaml = "\n".join(f"  - {name}" for name in keypoint_names)
        skeleton_yaml = "\n".join(skeleton_names) if skeleton_names else "  []"

        config_content = (
            f"Task: multi_animal\n"
            f"scorer: {scorer}\n"
            f"date: 2024\n"
            f"multianimalproject: true\n"
            f"bodyparts:\n{bodyparts_yaml}\n"
            f"skeleton:\n{skeleton_yaml}\n"
        )

        with open(config_path, "w") as f:
            f.write(config_content)


def _generate_yolo(entries, skeleton_template, labels_map, output_dir, split_name):
    """Generate YOLO Pose TXT files."""
    num_kpts = len(skeleton_template.get("points", []))
    labels_dir = join_path(output_dir, "labels", split_name)
    makedirs(labels_dir, exist_ok=True)

    # Group annotations by filename
    file_annotations = {}
    for entry in entries:
        filename = entry["filename"]
        if filename not in file_annotations:
            file_annotations[filename] = {
                "width": entry["width"],
                "height": entry["height"],
                "skeletons": [],
            }
        file_annotations[filename]["skeletons"].extend(entry["skeletons"])

    for filename, data in file_annotations.items():
        img_w = data["width"]
        img_h = data["height"]
        lines = []

        for skel in data["skeletons"]:
            label = skel.get("label", "object")
            class_id = labels_map.get(label, 0)
            points = skel.get("points", [])
            bbox = _compute_bbox(points, skel.get("bboxPad"), img_w, img_h)

            if bbox is None:
                continue

            bx, by, bw, bh = bbox
            cx = (bx + bw / 2) / img_w
            cy = (by + bh / 2) / img_h
            nw = bw / img_w
            nh = bh / img_h

            parts = [str(class_id), f"{cx:.6f}", f"{cy:.6f}", f"{nw:.6f}", f"{nh:.6f}"]

            for i in range(num_kpts):
                if i < len(points):
                    p = points[i]
                    v = p.get("visible", 2)
                    if v == 0:
                        parts.extend(["0", "0", "0"])
                    else:
                        parts.extend([f"{p['x'] / img_w:.6f}", f"{p['y'] / img_h:.6f}", str(v)])
                else:
                    parts.extend(["0", "0", "0"])

            lines.append(" ".join(parts))

        txt_name = path.splitext(filename)[0] + ".txt"
        txt_path = join_path(labels_dir, txt_name)
        with open(txt_path, "w") as f:
            f.write("\n".join(lines))


def _generate_yolo_config(skeleton_template, labels_map, output_dir, has_test):
    """Generate YOLO data.yaml."""
    num_kpts = len(skeleton_template.get("points", []))
    sorted_labels = sorted(labels_map.items(), key=lambda x: x[1])

    names_yaml = "\n".join(f"  {idx}: {name}" for name, idx in sorted_labels)

    content = (
        f"path: .\n"
        f"train: images/train\n"
        f"val: images/val\n"
    )
    if has_test:
        content += f"test: images/test\n"

    content += (
        f"\nkpt_shape: [{num_kpts}, 3]\n"
        f"\nnames:\n{names_yaml}\n"
    )

    config_path = join_path(output_dir, "data.yaml")
    with open(config_path, "w") as f:
        f.write(content)


@router.get("/export_dataset/{id_project}", tags=["Export"])
async def export_dataset(
    request: Request,
    id_project: int,
    format: str = Query("yolo"),
    train_pct: int = Query(70),
    val_pct: int = Query(20),
    test_pct: int = Query(10),
    aug_pct: int = Query(0),
    aug_flip: bool = Query(True),
    aug_rotate: bool = Query(True),
    aug_brightness: bool = Query(True),
    aug_crop: bool = Query(True),
):
    user = require_user(request)
    if not user_can_access_project(user, id_project):
        raise HTTPException(status_code=403, detail="Access denied")

    if format not in ("coco", "dlc", "yolo"):
        raise HTTPException(status_code=400, detail="Invalid format")

    total_pct = train_pct + val_pct + (test_pct if format == "yolo" else 0)
    if total_pct > 100 or train_pct < 0 or val_pct < 0 or test_pct < 0:
        raise HTTPException(status_code=400, detail="Invalid split percentages")

    project_path, settings = _load_project(id_project)
    skeleton_template = settings.get("skeleton_template", {"points": [], "connections": []})
    annotated = _collect_annotated_images(project_path, settings)

    if not annotated:
        raise HTTPException(status_code=400, detail="No annotated images found")

    project_name = settings.get("project_name", f"project_{id_project}")
    safe_name = "".join(c if c.isalnum() or c in "._- " else "_" for c in project_name)

    def generate():
        import json as json_module

        tmp_dir = tempfile.mkdtemp()

        try:
            total = len(annotated)
            all_entries = []  # list of {filename, skeletons, width, height}

            enabled_augs = {
                "flip": aug_flip,
                "rotate": aug_rotate,
                "brightness": aug_brightness,
                "crop": aug_crop,
            }

            images_output_dir = join_path(tmp_dir, "_images")
            makedirs(images_output_dir, exist_ok=True)

            # Phase 1: Process images (blur masks, generate augmentations)
            for idx, (image_name, skeletons) in enumerate(annotated):
                try:
                    image = _process_image(project_path, image_name)
                except Exception:
                    continue

                img_w, img_h = image.size

                # Save processed original
                out_path = join_path(images_output_dir, image_name)
                image.save(out_path)

                all_entries.append({
                    "filename": image_name,
                    "skeletons": skeletons,
                    "width": img_w,
                    "height": img_h,
                })

                # Generate augmented copies
                if aug_pct > 0:
                    aug_count = max(1, round(aug_pct / 100.0))
                    augmented = generate_augmented(image, skeletons, enabled_augs, count=aug_count)
                    for aug_idx, (aug_image, aug_skeletons) in enumerate(augmented):
                        stem = path.splitext(image_name)[0]
                        ext = path.splitext(image_name)[1] or ".png"
                        aug_name = f"{stem}_aug{aug_idx}{ext}"
                        aug_path = join_path(images_output_dir, aug_name)
                        aug_image.save(aug_path)

                        all_entries.append({
                            "filename": aug_name,
                            "skeletons": aug_skeletons,
                            "width": img_w,
                            "height": img_h,
                        })

                progress = json_module.dumps({
                    "current": idx + 1,
                    "total": total,
                    "phase": "processing",
                    "file": image_name,
                })
                yield f"data: {progress}\n\n"

            # Phase 2: Shuffle and split
            random.shuffle(all_entries)
            total_entries = len(all_entries)

            train_count = round(total_entries * train_pct / 100)
            val_count = round(total_entries * val_pct / 100)

            if format == "yolo":
                test_count = total_entries - train_count - val_count
            else:
                test_count = 0
                val_count = total_entries - train_count

            train_entries = all_entries[:train_count]
            val_entries = all_entries[train_count:train_count + val_count]
            test_entries = all_entries[train_count + val_count:] if test_count > 0 else []

            # Collect unique labels and build label map
            labels_map = {}
            label_idx = 0
            for entry in all_entries:
                for skel in entry["skeletons"]:
                    label = skel.get("label", "object")
                    if label not in labels_map:
                        labels_map[label] = label_idx
                        label_idx += 1

            # Phase 3: Generate format-specific files
            format_dir = join_path(tmp_dir, "_format")
            makedirs(format_dir, exist_ok=True)

            splits = [("train", train_entries), ("val", val_entries)]
            if test_entries:
                splits.append(("test", test_entries))

            for split_name, split_entries in splits:
                if not split_entries:
                    continue

                if format == "coco":
                    _generate_coco(split_entries, skeleton_template, format_dir, split_name)
                elif format == "dlc":
                    _generate_dlc(split_entries, skeleton_template, format_dir, split_name)
                elif format == "yolo":
                    _generate_yolo(split_entries, skeleton_template, labels_map, format_dir, split_name)

            if format == "yolo":
                _generate_yolo_config(skeleton_template, labels_map, format_dir, len(test_entries) > 0)

            # Phase 4: Package into ZIP
            tmp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
            tmp_zip_path = tmp_zip.name
            tmp_zip.close()

            with zipfile.ZipFile(tmp_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                # Add images to proper directories
                for split_name, split_entries in splits:
                    if not split_entries:
                        continue

                    if format == "yolo":
                        img_dir_in_zip = f"images/{split_name}"
                    else:
                        img_dir_in_zip = f"{split_name}/images"

                    for entry in split_entries:
                        src = join_path(images_output_dir, entry["filename"])
                        if path.exists(src):
                            zf.write(src, f"{img_dir_in_zip}/{entry['filename']}")

                # Add format files
                import os as _os
                for root, dirs, files in _os.walk(format_dir):
                    for fname in files:
                        full_path = path.join(root, fname)
                        arcname = path.relpath(full_path, format_dir).replace("\\", "/")
                        zf.write(full_path, arcname)

            token = str(uuid4())
            _export_files[token] = {"path": tmp_zip_path, "name": safe_name}

            done = json_module.dumps({
                "done": True,
                "total": total_entries,
                "train": len(train_entries),
                "val": len(val_entries),
                "test": len(test_entries),
                "token": token,
            })
            yield f"data: {done}\n\n"

        finally:
            # Clean up temp directory (but not the ZIP)
            try:
                shutil.rmtree(tmp_dir)
            except OSError:
                pass

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/download_dataset/{token}", tags=["Export"])
async def download_dataset(token: str, request: Request):
    require_user(request)

    entry = _export_files.pop(token, None)
    if not entry or not path.exists(entry["path"]):
        raise HTTPException(status_code=404, detail="Export not found or expired")

    tmp_path = entry["path"]
    safe_name = entry["name"]
    file_size = path.getsize(tmp_path)

    def file_stream():
        try:
            with open(tmp_path, "rb") as f:
                while chunk := f.read(1024 * 1024):
                    yield chunk
        finally:
            try:
                remove(tmp_path)
            except OSError:
                pass

    return StreamingResponse(
        file_stream(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}_dataset.zip"',
            "Content-Length": str(file_size),
        },
    )
