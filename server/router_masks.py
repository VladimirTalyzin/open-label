import traceback
import hashlib
from os import path, makedirs, listdir, remove
from re import match
from io import BytesIO
from json import load, dump, loads
from datetime import datetime

from fastapi import APIRouter, Form, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse, Response
from PIL import Image

from utility import transliterate, join_path, safe_move
from helpers import get_script_directory

router = APIRouter()


@router.get("/get_png_mask/{id_project}/{image_name}/{label}", tags=["Mask"])
async def get_png_mask(id_project: int, image_name: str, label: str):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    masks_path = join_path(project_path, "masks")

    image_name = transliterate(path.basename(image_name))
    label = transliterate(path.basename(label))

    mask_filename = f"{image_name}_{label}.png"
    mask_path = join_path(masks_path, mask_filename)

    if not path.exists(mask_path):
        return Response(status_code=204)

    return FileResponse(mask_path, media_type='image/png')


@router.post("/upload_png_mask/{id_project}/{image_name}/{label}", tags=["Mask"])
async def upload_png_mask(
    id_project: int,
    image_name: str,
    label: str,
    image: UploadFile = File(...)
):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    masks_path = join_path(project_path, "masks")

    if not path.exists(masks_path):
        makedirs(masks_path)

    image_name = transliterate(path.basename(image_name))
    label = transliterate(path.basename(label))

    mask_filename = f"{image_name}_{label}.png"
    mask_path = join_path(masks_path, mask_filename)

    try:
        image_content = await image.read()

        incoming_hash = hashlib.md5(image_content).hexdigest()

        new_image = Image.open(BytesIO(image_content))
        new_image = new_image.convert("L")

        threshold_value = 10
        new_image = new_image.point(lambda p: 255 if p >= threshold_value else 0)

        undo_folder_name = f"{image_name}_{label}.png"
        undo_path = join_path(project_path, "undo", undo_folder_name)
        if not path.exists(undo_path):
            makedirs(undo_path)

        if path.exists(mask_path):
            undo_files = listdir(undo_path)
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

            if undo_files:
                undo_files_sorted = sorted(undo_files, reverse=True)
                latest_undo_file = undo_files_sorted[0]

                match_data = match(r"(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})_([a-fA-F0-9]{32})\.png$", latest_undo_file)
                if match_data:
                    last_hash = match_data.group(2)

                    if incoming_hash == last_hash:
                        return JSONResponse(content={"result": "ok", "message": "Mask already up-to-date"})

                undo_filename = f"{timestamp}_{incoming_hash}.png"
                undo_file_path = join_path(undo_path, undo_filename)

                new_image.save(undo_file_path, 'PNG')

            else:
                creation_time = path.getctime(mask_path)
                old_timestamp = datetime.fromtimestamp(creation_time).strftime("%Y-%m-%d_%H-%M-%S")
                safe_move(mask_path, undo_path, f"{old_timestamp}_start_undo.png")
                new_image.save(join_path(undo_path, f"{timestamp}_{incoming_hash}.png"), 'PNG')

        new_image.save(mask_path, 'PNG')

        return JSONResponse(content={"result": "ok", "message": "Mask uploaded successfully"})

    except Exception as exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error uploading mask: {exception}")


@router.get("/undo_png_mask/{id_project}/{image_name}/{label}", tags=["Mask"])
async def undo_png_mask(id_project: int, image_name: str, label: str):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    masks_path = join_path(project_path, "masks")
    if not path.exists(masks_path):
        raise HTTPException(status_code=404, detail="Masks folder not found")

    image_name = transliterate(path.basename(image_name))
    label = transliterate(path.basename(label))

    mask_filename = f"{image_name}_{label}.png"
    mask_path = join_path(masks_path, mask_filename)

    undo_folder_name = f"{image_name}_{label}.png"
    undo_path = join_path(project_path, "undo", undo_folder_name)

    if not path.exists(undo_path):
        raise HTTPException(status_code=404, detail="Undo folder not found")

    undo_files = listdir(undo_path)
    if not undo_files:
        return JSONResponse(content={"result": "no-undo", "message": "No undo files available"})

    undo_files_sorted = sorted(undo_files)
    first_undo_file = undo_files_sorted[-1]
    first_undo_file_path = join_path(undo_path, first_undo_file)

    match_data = match(r"(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})_", first_undo_file)
    if not match_data:
        raise HTTPException(status_code=400, detail="Invalid undo file name format")

    try:
        remove(mask_path)
        safe_move(first_undo_file_path, masks_path, mask_filename)

        if not path.exists(mask_path):
            traceback.print_exc()
            raise HTTPException(status_code=500, detail="Failed to restore mask from undo")

        return JSONResponse(content={"result": "ok", "message": "Undo successfully"})

    except Exception as exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error during undo operation: {exception}")


@router.get("/get_vector_mask/{id_project}/{image_name}/{label}", tags=["Mask"])
async def get_vector_mask(id_project: int, image_name: str, label: str):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    vector_data_path = join_path(project_path, "vector_data")
    masks_path = join_path(project_path, "masks")

    image_name = transliterate(path.basename(image_name))
    label = transliterate(path.basename(label))

    vector_filename = f"{image_name}_{label}.json"
    vector_file_path = join_path(vector_data_path, vector_filename)

    mask_filename = f"{image_name}_{label}.png"
    mask_file_path = join_path(masks_path, mask_filename)

    has_png_mask = path.exists(mask_file_path)

    if not path.exists(vector_file_path):
        return JSONResponse(content={
            "json-data": None,
            "has-png-mask": has_png_mask
        })

    try:
        with open(vector_file_path, 'r', encoding='utf-8') as vector_file:
            json_data = load(vector_file)

        return JSONResponse(content={
            "json-data": json_data,
            "has-png-mask": has_png_mask
        })

    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error reading vector data: {exception}")


@router.post("/upload_vector_mask/{id_project}/{image_name}/{label}", tags=["Mask"])
async def upload_vector_mask(id_project: int, image_name: str, label: str, json_data: str = Form(...)):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    vector_data_path = join_path(project_path, "vector_data")
    if not path.exists(vector_data_path):
        makedirs(vector_data_path)

    image_name = transliterate(path.basename(image_name))
    label = transliterate(path.basename(label))

    vector_filename = f"{image_name}_{label}.json"
    vector_file_path = join_path(vector_data_path, vector_filename)

    try:
        json_object = loads(json_data)

        with open(vector_file_path, 'w', encoding='utf-8') as f:
            dump(json_object, f, ensure_ascii=False, indent=4)

        return JSONResponse(content={"result": "ok", "message": "Vector data saved successfully"})

    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error saving vector data: {exception}")
