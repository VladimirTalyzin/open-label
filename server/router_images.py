from os import path, makedirs, remove, listdir
from json import load, dump, loads
from datetime import datetime
from zlib import crc32

from fastapi import APIRouter, Form, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from PIL import Image

from utility import transliterate, join_path
from settings import PREVIEW_WIDTH, PREVIEW_BLOCK_SIZE
from helpers import (
    get_script_directory, create_preview, update_all_previews,
)

router = APIRouter()


@router.post("/upload_image/{id_project}", tags=["Image"])
async def upload_image(id_project: int, image: UploadFile = File(...)):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))
    images_path = join_path(project_path, "images")
    preview_path = join_path(project_path, "preview")
    settings_file = join_path(project_path, "project_settings.json")

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    if not path.exists(images_path):
        makedirs(images_path)

    if not path.exists(preview_path):
        makedirs(preview_path)

    image_name = transliterate(image.filename)
    image_path = join_path(images_path, image_name)

    if path.exists(image_path):
        return JSONResponse(content={"result": "error", "message": "Image with this name already exists."})

    try:
        image_bytes = await image.read()
        with open(image_path, "wb") as file:
            file.write(image_bytes)

        if not image_name.lower().endswith(".png"):
            img = Image.open(image_path)
            png_name = path.splitext(image_name)[0] + ".png"
            png_path = join_path(images_path, png_name)
            img.save(png_path, "PNG")
            remove(image_path)
            image_name = png_name
            image_path = png_path

        with open(image_path, "rb") as f:
            file_crc = crc32(f.read()) & 0xFFFFFFFF

        with open(settings_file, "r") as file_settings:
            settings_data = load(file_settings)

        existing_images = settings_data.get("images", [])
        for existing_img in existing_images:
            existing_crc = existing_img.get("crc")
            if existing_crc is None:
                existing_file = join_path(images_path, existing_img["image"])
                if path.exists(existing_file):
                    with open(existing_file, "rb") as f:
                        existing_crc = crc32(f.read()) & 0xFFFFFFFF
                    existing_img["crc"] = existing_crc
            if existing_crc == file_crc:
                remove(image_path)
                with open(settings_file, "w") as file_settings:
                    dump(settings_data, file_settings)
                return JSONResponse(content={
                    "result": "duplicate",
                    "message": f"Duplicate of existing image: {existing_img['image']}",
                    "duplicate_of": existing_img["image"]
                })

        preview_path, preview_height = create_preview(image_name, image_path, preview_path)

        if "images" not in settings_data:
            settings_data["images"] = []

        existing_count = len(settings_data["images"])
        block_index = existing_count // PREVIEW_BLOCK_SIZE

        block_start = block_index * PREVIEW_BLOCK_SIZE
        block_offset = sum(
            img["preview_height"] for img in settings_data["images"][block_start:]
        )

        image_data = \
            {
                "image": image_name,
                "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "preview_height": preview_height,
                "preview_block": block_index,
                "block_offset": block_offset,
                "crc": file_crc
            }

        settings_data["images"].append(image_data)

        with open(settings_file, "w") as file_settings:
            dump(settings_data, file_settings)

        update_all_previews(preview_path, preview_height, join_path(get_script_directory(), "projects", str(id_project)), block_index)

        return JSONResponse(content={"result": "ok", "message": "Image uploaded successfully", "image_data": image_data,
                                     "preview_base": f"/get_preview/{id_project}"})

    except Exception as exception:
        if path.exists(image_path):
            remove(image_path)
        raise HTTPException(status_code=500, detail=f"Error uploading image: {exception}")


@router.get("/image/{id_project}/{image_name}", tags=["Image"])
async def get_image(id_project: int, image_name: str):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))
    images_path = join_path(project_path, "images")
    image_file_path = join_path(images_path, image_name)

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    if not path.exists(image_file_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(image_file_path)


@router.post("/delete_image", tags=["Image"])
async def delete_image(id_project: int = Form(...), image_name: str = Form(...)):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))
    images_path = join_path(project_path, "images")
    preview_path = join_path(project_path, "preview")
    masks_path = join_path(project_path, "masks")
    deleted_path = join_path(project_path, "deleted")
    settings_file = join_path(project_path, "project_settings.json")

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    if not path.exists(deleted_path):
        makedirs(deleted_path)

    image_file_path = join_path(images_path, image_name)
    preview_file_path = join_path(preview_path, image_name)

    from utility import safe_move
    import traceback

    if path.exists(image_file_path):
        deleted_image_path = join_path(deleted_path, "images")
        if not path.exists(deleted_image_path):
            makedirs(deleted_image_path)
        safe_move(image_file_path, deleted_image_path)

    if path.exists(preview_file_path):
        deleted_preview_path = join_path(deleted_path, "preview")
        if not path.exists(deleted_preview_path):
            makedirs(deleted_preview_path)
        safe_move(preview_file_path, deleted_preview_path)

    if path.exists(masks_path):
        for mask_file in listdir(masks_path):
            if mask_file.startswith(image_name):
                mask_file_path = join_path(masks_path, mask_file)
                deleted_mask_path = join_path(deleted_path, "masks")
                if not path.exists(deleted_mask_path):
                    makedirs(deleted_mask_path)
                safe_move(mask_file_path, deleted_mask_path)

    try:
        with open(settings_file, "r") as file_settings:
            settings_data = load(file_settings)

        if "images" in settings_data:
            settings_data["images"] = [img for img in settings_data["images"] if img["image"] != image_name]

        with open(settings_file, "w") as file_settings:
            dump(settings_data, file_settings)

        from router_projects import update_project
        await update_project(id_project)

        return JSONResponse(content={"result": "ok", "message": "Image deleted successfully."})

    except Exception as exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error deleting image: {exception}")


@router.post("/delete_images_bulk", tags=["Image"])
async def delete_images_bulk(id_project: int = Form(...), image_names: str = Form(...)):
    """Delete multiple images at once. image_names is a JSON array of image name strings."""
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))
    images_path = join_path(project_path, "images")
    preview_path = join_path(project_path, "preview")
    masks_path = join_path(project_path, "masks")
    deleted_path = join_path(project_path, "deleted")
    settings_file = join_path(project_path, "project_settings.json")

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    names = loads(image_names)
    if not isinstance(names, list):
        raise HTTPException(status_code=400, detail="image_names must be a JSON array")

    if not path.exists(deleted_path):
        makedirs(deleted_path)

    from utility import safe_move
    import traceback

    for image_name in names:
        image_file_path = join_path(images_path, image_name)
        preview_file_path = join_path(preview_path, image_name)

        if path.exists(image_file_path):
            deleted_image_path = join_path(deleted_path, "images")
            if not path.exists(deleted_image_path):
                makedirs(deleted_image_path)
            safe_move(image_file_path, deleted_image_path)

        if path.exists(preview_file_path):
            deleted_preview_path = join_path(deleted_path, "preview")
            if not path.exists(deleted_preview_path):
                makedirs(deleted_preview_path)
            safe_move(preview_file_path, deleted_preview_path)

        if path.exists(masks_path):
            for mask_file in listdir(masks_path):
                if mask_file.startswith(image_name):
                    mask_file_path = join_path(masks_path, mask_file)
                    deleted_mask_path = join_path(deleted_path, "masks")
                    if not path.exists(deleted_mask_path):
                        makedirs(deleted_mask_path)
                    safe_move(mask_file_path, deleted_mask_path)

    try:
        with open(settings_file, "r") as file_settings:
            settings_data = load(file_settings)

        names_set = set(names)
        if "images" in settings_data:
            settings_data["images"] = [img for img in settings_data["images"] if img["image"] not in names_set]

        with open(settings_file, "w") as file_settings:
            dump(settings_data, file_settings)

        from router_projects import update_project
        await update_project(id_project)

        return JSONResponse(content={"result": "ok", "deleted_count": len(names)})

    except Exception as exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error deleting images: {exception}")
