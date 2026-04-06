import shutil
import zipfile
import tempfile
from os import path, makedirs, listdir, remove
from json import load, dump, loads
from re import findall
from datetime import datetime
from io import BytesIO
from uuid import uuid4

from fastapi import APIRouter, Form, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image, ImageDraw

from utility import transliterate, join_path, safe_move
from settings import PREVIEW_WIDTH, PREVIEW_BLOCK_SIZE
from database import assign_project_to_group, get_group_project_ids, remove_project_group
from helpers import (
    get_script_directory, get_all_path, get_settings_path,
    require_user, user_can_access_project,
    create_project_data, load_project_data, set_project_property,
    create_preview, prepare_project_image,
)

router = APIRouter()

_export_files = {}  # token -> {"path": str, "name": str}


@router.get("/add_project", tags=["Global"])
async def add_project(request: Request):
    user = require_user(request)

    script_path = get_script_directory()
    project_path = join_path(script_path, "projects")

    if not path.exists(project_path):
        makedirs(project_path)

    max_project_id = 0
    for entry in listdir(project_path):
        if entry.isdigit():
            project_id = int(entry)
            max_project_id = max(max_project_id, project_id)

    new_project_id = max_project_id + 1
    new_project_path = join_path(project_path, str(new_project_id))
    makedirs(new_project_path)

    settings_file = join_path(new_project_path, "project_settings.json")
    with open(settings_file, "w") as file_settings:
        dump(create_project_data(new_project_id, []), file_settings)

    assign_project_to_group(new_project_id, user["group_id"])

    return await get_projects_list(request)


@router.get("/get_projects_list", tags=["Global"])
async def get_projects_list(request: Request):
    user = require_user(request)

    script_path = get_script_directory()
    projects_path = join_path(script_path, "projects")

    if not path.exists(projects_path):
        makedirs(projects_path)

    allowed_ids = set(get_group_project_ids(user["group_id"]))

    projects_list = []
    for entry in listdir(projects_path):
        if entry.isdigit():
            project_id = int(entry)
            if allowed_ids and project_id not in allowed_ids:
                continue
            project_path = join_path(projects_path, entry)
            project_data = load_project_data(project_path)
            if project_data:
                projects_list.append(project_data)

    projects_list.sort(key=lambda item: item["id_project"])

    return JSONResponse(content={"projects": projects_list})


@router.get("/get_project_data/{id_project}", tags=["Project"])
async def get_project_data(id_project: int, request: Request):
    user = require_user(request)
    if not user_can_access_project(user, id_project):
        raise HTTPException(status_code=403, detail="Access denied")

    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    project_data = load_project_data(project_path)
    if project_data:
        return JSONResponse(content=project_data)
    else:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/set_prediction_url", tags=["Project"])
async def set_prediction_url(id_project: int = Form(...), prediction_url: str = Form(...)):
    try:
        return await set_project_property(id_project, "prediction_url", prediction_url)
    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error updating prediction url: {exception}")


@router.post("/set_project_name", tags=["Project"])
async def set_project_name(id_project: int = Form(...), project_name: str = Form(...)):
    try:
        return await set_project_property(id_project, "project_name", project_name)
    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error updating project name: {exception}")


@router.post("/set_project_labels", tags=["Project"])
async def set_project_labels(id_project: int = Form(...), labels: str = Form(...)):
    settings_file = get_settings_path(id_project)

    try:
        try:
            labels_data = loads(labels)
        except Exception:
            labels_data = None

        if labels_data:
            for label in labels_data:
                if "label" not in label or "color" not in label:
                    raise ValueError("Invalid label format")

            labels_to_save = labels_data

        else:
            labels_to_save = []
            for match_data in findall(r'<Label value="([^"]+)" background="([^"]+)"', labels):
                label_name = match_data[0]
                color = match_data[1]
                labels_to_save.append({"label": label_name, "color": color})

        with open(settings_file, "r") as file_settings:
            settings_data = load(file_settings)
        settings_data["labels"] = labels_to_save

        with open(settings_file, "w") as file_settings:
            dump(settings_data, file_settings)

        return JSONResponse(content={"result": "ok", "value": labels_to_save})

    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error updating project labels: {exception}")


@router.post("/set_project_type", tags=["Project"])
async def set_project_type_endpoint(id_project: int = Form(...), project_type: str = Form(...)):
    try:
        return await set_project_property(id_project, "project_type", project_type)
    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error updating project type: {exception}")


@router.post("/set_skeleton_template/{id_project}", tags=["Project"])
async def set_skeleton_template(id_project: int, json_data: str = Form(...)):
    try:
        skeleton_data = loads(json_data)
        return await set_project_property(id_project, "skeleton_template", skeleton_data)
    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error saving skeleton template: {exception}")


@router.get("/update_project/{id_project}", tags=["Project"])
async def update_project(id_project: int):
    project_path, images_path, preview_path, masks_path, settings_file = get_all_path(id_project)

    images = []
    for image_name in listdir(images_path):
        if image_name.lower().endswith(".png"):
            image_name = prepare_project_image(image_name, images_path)

            image_data = \
                {
                    "image": image_name,
                    "time": datetime.fromtimestamp(path.getmtime(join_path(images_path, image_name))).strftime("%Y-%m-%d %H:%M:%S")
                }

            preview_image = join_path(preview_path, image_name)
            if path.exists(preview_image) and path.getsize(preview_image) == 0:
                remove(preview_path)

            if not path.exists(preview_image) or path.getsize(preview_image) == 0:
                preview_image, preview_height = create_preview(image_name, join_path(images_path, image_name), preview_path)
                image_data["preview_height"] = preview_height

            else:
                preview_image = Image.open(preview_image)
                _, preview_height = preview_image.size
                image_data["preview_height"] = preview_height

            if path.exists(masks_path):
                for mask_name in listdir(masks_path):
                    if mask_name.lower().endswith((".png", ".jpg", ".jpeg", ".bmp")):
                        mask_name = prepare_project_image(mask_name, masks_path)

                        if mask_name.startswith(image_name) and "##" in mask_name:
                            mask_label = mask_name.split("##")[1].split(".")[0]
                            if "masks" not in image_data:
                                image_data["masks"] = {}
                            image_data["masks"][mask_label] = mask_name

            images.append(image_data)

    images.sort(key=lambda item: item["time"])

    preview_images = []
    preview_heights = []
    for image_data in images:
        try:
            preview_image = Image.open(join_path(preview_path, image_data["image"]))
        except FileNotFoundError:
            preview_image = Image.new("RGB", (PREVIEW_WIDTH, 90), color="white")
            draw = ImageDraw.Draw(preview_image)
            draw.text((10, 40), "Missing image", fill="black")

        preview_images.append(preview_image)
        _, preview_height = preview_image.size
        preview_heights.append(preview_height)

    block_offset = 0
    current_block = 0
    for idx, image_data in enumerate(images):
        block_index = idx // PREVIEW_BLOCK_SIZE
        if block_index != current_block:
            block_offset = 0
            current_block = block_index
        image_data["preview_block"] = block_index
        image_data["block_offset"] = block_offset
        block_offset += preview_heights[idx]

    all_preview_dir = join_path(project_path, "all-preview")
    if path.exists(all_preview_dir):
        shutil.rmtree(all_preview_dir)
    makedirs(all_preview_dir, exist_ok=True)

    for block_start in range(0, len(preview_images), PREVIEW_BLOCK_SIZE):
        block_end = min(block_start + PREVIEW_BLOCK_SIZE, len(preview_images))
        block_imgs = preview_images[block_start:block_end]
        block_hts = preview_heights[block_start:block_end]

        block_height = sum(block_hts)
        if block_height > 0:
            new_image = Image.new("RGB", (PREVIEW_WIDTH, block_height))
            y_off = 0
            for i, img in enumerate(block_imgs):
                new_image.paste(img, (0, y_off))
                y_off += block_hts[i]

            bi = block_start // PREVIEW_BLOCK_SIZE
            new_image.save(join_path(all_preview_dir, f"{bi}.png"))

    try:
        with open(settings_file, "r") as file_settings:
            settings_data = load(file_settings)
        settings_data["images"] = images
    except Exception:
        settings_data = create_project_data(id_project, images)

    with open(settings_file, "w") as file_settings:
        dump(settings_data, file_settings)

    return JSONResponse(content={"result": "ok", "message": "Project updated successfully."})


@router.get("/get_images_list/{id_project}", tags=["Project"])
async def get_images_list(id_project: int):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    settings_file = join_path(project_path, "project_settings.json")
    if path.exists(settings_file):
        with open(settings_file, "r") as file_settings:
            project_data = load(file_settings)
            images = project_data.get("images", [])
            skeletons_dir = join_path(project_path, "skeletons")
            for img in images:
                skel_file = join_path(skeletons_dir, f"{img['image']}.json")
                img["has_skeleton"] = path.exists(skel_file)
                img["has_masks"] = bool(img.get("masks"))
            return JSONResponse(content={"images": images, "preview_base": f"/get_preview/{id_project}"})

    else:
        raise HTTPException(status_code=404, detail="Project settings not found")


@router.get("/get_preview/{id_project}/{block}.png", tags=["Project"])
async def get_preview(id_project: int, block: int):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))
    block_path = join_path(project_path, "all-preview", f"{block}.png")

    if not path.exists(block_path):
        await update_project(id_project)

    if path.exists(block_path):
        def parts_file():
            with open(block_path, mode="rb") as file_like:
                yield from file_like

        # noinspection PyTypeChecker
        return StreamingResponse(parts_file(), media_type="image/png")
    else:
        raise HTTPException(status_code=404, detail="Preview image not found")


@router.get("/rebuild_all_previews/{id_project}", tags=["Project"])
async def rebuild_all_previews(id_project: int):
    project_path, images_path, preview_path, masks_path, settings_file = get_all_path(id_project)

    with open(settings_file, "r") as file_settings:
        settings_data = load(file_settings)

    images = settings_data.get("images", [])
    all_preview_dir = join_path(project_path, "all-preview")

    if path.exists(all_preview_dir):
        shutil.rmtree(all_preview_dir)
    makedirs(all_preview_dir, exist_ok=True)

    if not images:
        return JSONResponse(content={"result": "ok"})

    preview_images = []
    preview_heights = []
    for image_data in images:
        try:
            preview_image = Image.open(join_path(preview_path, image_data["image"]))
        except FileNotFoundError:
            preview_image = Image.new("RGB", (PREVIEW_WIDTH, 90), color="white")
            draw = ImageDraw.Draw(preview_image)
            draw.text((10, 40), "Missing image", fill="black")

        preview_images.append(preview_image)
        _, preview_height = preview_image.size
        preview_heights.append(preview_height)

    for block_start in range(0, len(preview_images), PREVIEW_BLOCK_SIZE):
        block_end = min(block_start + PREVIEW_BLOCK_SIZE, len(preview_images))
        block_imgs = preview_images[block_start:block_end]
        block_hts = preview_heights[block_start:block_end]

        block_height = sum(block_hts)
        new_image = Image.new("RGB", (PREVIEW_WIDTH, block_height))
        y_offset = 0
        for idx, img in enumerate(block_imgs):
            new_image.paste(img, (0, y_offset))
            y_offset += block_hts[idx]

        block_index = block_start // PREVIEW_BLOCK_SIZE
        new_image.save(join_path(all_preview_dir, f"{block_index}.png"))

    return JSONResponse(content={"result": "ok"})


@router.get("/regenerate_previews/{id_project}", tags=["Project"])
async def regenerate_previews(id_project: int):
    project_path, images_path, preview_path, masks_path, settings_file = get_all_path(id_project)

    image_files = [f for f in listdir(images_path) if f.lower().endswith(".png")]
    total = len(image_files)

    def generate():
        import json as json_module

        images = []
        block_offset = 0
        current_block = 0

        for idx, image_name in enumerate(sorted(image_files)):
            image_path = join_path(images_path, image_name)

            preview_file_path, preview_height = create_preview(image_name, image_path, preview_path)

            block_index = idx // PREVIEW_BLOCK_SIZE
            if block_index != current_block:
                block_offset = 0
                current_block = block_index

            image_data = {
                "image": image_name,
                "time": datetime.fromtimestamp(path.getmtime(image_path)).strftime("%Y-%m-%d %H:%M:%S"),
                "preview_height": preview_height,
                "preview_block": block_index,
                "block_offset": block_offset
            }
            block_offset += preview_height
            images.append(image_data)

            progress = json_module.dumps({"current": idx + 1, "total": total, "image": image_name})
            yield f"data: {progress}\n\n"

        all_preview_dir = join_path(project_path, "all-preview")
        if path.exists(all_preview_dir):
            shutil.rmtree(all_preview_dir)
        makedirs(all_preview_dir, exist_ok=True)

        if images:
            for block_start in range(0, len(images), PREVIEW_BLOCK_SIZE):
                block_end = min(block_start + PREVIEW_BLOCK_SIZE, len(images))
                block_imgs = []
                block_heights = []
                for img_data in images[block_start:block_end]:
                    preview_img = Image.open(join_path(preview_path, img_data["image"]))
                    block_imgs.append(preview_img)
                    block_heights.append(img_data["preview_height"])

                block_height = sum(block_heights)
                new_image = Image.new("RGB", (PREVIEW_WIDTH, block_height))
                y_offset = 0
                for i, img in enumerate(block_imgs):
                    new_image.paste(img, (0, y_offset))
                    y_offset += block_heights[i]

                bi = block_start // PREVIEW_BLOCK_SIZE
                new_image.save(join_path(all_preview_dir, f"{bi}.png"))

        try:
            with open(settings_file, "r") as f:
                settings_data = load(f)
            settings_data["images"] = images
        except Exception:
            settings_data = {"images": images}

        with open(settings_file, "w") as f:
            dump(settings_data, f)

        done = json_module.dumps({"done": True, "total": total})
        yield f"data: {done}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/delete_project/{id_project}", tags=["Project"])
async def delete_project(id_project: int, request: Request):
    user = require_user(request)
    if not user_can_access_project(user, id_project):
        raise HTTPException(status_code=403, detail="Access denied")

    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        return {"error": "Project not found"}

    deleted_projects_path = join_path(script_path, "deleted")
    if not path.exists(deleted_projects_path):
        makedirs(deleted_projects_path)

    unique_id = uuid4().hex
    deleted_project_name = f"{id_project}_{unique_id}"
    deleted_project_path = join_path(deleted_projects_path, deleted_project_name)

    safe_move(project_path, deleted_project_path)
    remove_project_group(id_project)

    return JSONResponse(content={"result": "ok", "message": "Project deleted successfully"})


@router.get("/export_project/{id_project}", tags=["Project"])
async def export_project(id_project: int, request: Request):
    user = require_user(request)
    if not user_can_access_project(user, id_project):
        raise HTTPException(status_code=403, detail="Access denied")

    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    import os as _os
    all_files = []
    for root, dirs, files in _os.walk(project_path):
        rel_root = path.relpath(root, project_path).replace("\\", "/")
        if rel_root.startswith("deleted"):
            continue
        for file_name in files:
            all_files.append(path.join(root, file_name))

    total = len(all_files)

    settings_file = join_path(project_path, "project_settings.json")
    project_name = f"project_{id_project}"
    if path.exists(settings_file):
        with open(settings_file, "r") as f:
            data = load(f)
            if data.get("project_name"):
                project_name = data["project_name"]

    safe_name = "".join(c if c.isalnum() or c in "._- " else "_" for c in project_name)

    def generate():
        import json as json_module

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
        tmp_path = tmp.name
        tmp.close()

        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for idx, file_full in enumerate(all_files):
                arcname = path.relpath(file_full, project_path).replace("\\", "/")
                zf.write(file_full, arcname)

                if (idx + 1) % 50 == 0 or idx + 1 == total:
                    progress = json_module.dumps({
                        "current": idx + 1,
                        "total": total,
                        "file": arcname,
                    })
                    yield f"data: {progress}\n\n"

        token = str(uuid4())
        _export_files[token] = {"path": tmp_path, "name": safe_name}

        done = json_module.dumps({"done": True, "total": total, "token": token})
        yield f"data: {done}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/download_export/{token}", tags=["Project"])
async def download_export(token: str, request: Request):
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
            "Content-Disposition": f'attachment; filename="{safe_name}.zip"',
            "Content-Length": str(file_size),
        },
    )


@router.post("/import_project", tags=["Project"])
async def import_project(request: Request, file: UploadFile = File(...)):
    user = require_user(request)

    file_content = await file.read()
    buffer = BytesIO(file_content)

    try:
        zf = zipfile.ZipFile(buffer, "r")
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    names = zf.namelist()
    if "project_settings.json" not in names:
        zf.close()
        raise HTTPException(status_code=400, detail="ZIP does not contain project_settings.json")

    script_path = get_script_directory()
    projects_path = join_path(script_path, "projects")
    if not path.exists(projects_path):
        makedirs(projects_path)

    max_project_id = 0
    for entry in listdir(projects_path):
        if entry.isdigit():
            max_project_id = max(max_project_id, int(entry))

    new_project_id = max_project_id + 1
    new_project_path = join_path(projects_path, str(new_project_id))
    makedirs(new_project_path)

    for member in names:
        if member.startswith("/") or ".." in member:
            continue
        target = join_path(new_project_path, member)
        if member.endswith("/"):
            makedirs(target, exist_ok=True)
        else:
            target_dir = path.dirname(target)
            if not path.exists(target_dir):
                makedirs(target_dir, exist_ok=True)
            with open(target, "wb") as f:
                f.write(zf.read(member))

    zf.close()

    settings_file = join_path(new_project_path, "project_settings.json")
    if path.exists(settings_file):
        with open(settings_file, "r") as f:
            settings = load(f)
        settings["id_project"] = new_project_id
        with open(settings_file, "w") as f:
            dump(settings, f)

    assign_project_to_group(new_project_id, user["group_id"])

    return await get_projects_list(request)
