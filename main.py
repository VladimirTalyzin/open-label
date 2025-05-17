import traceback
from typing import Optional

import httpx
import hashlib
from datetime import datetime
from io import BytesIO
from re import findall, match

from fastapi import FastAPI, Form, HTTPException, UploadFile, File, Query, Path
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from os import listdir, path, makedirs, remove
from json import dump, load, loads
from PIL import Image, ImageDraw
from uuid import uuid4
from fastapi.middleware.cors import CORSMiddleware
from settings import PREVIEW_WIDTH, API_PORT

from utility import transliterate, safe_move

app = FastAPI(title="Open Label API", docs_url="/docs")

# noinspection PyTypeChecker
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_script_directory():
    return path.dirname(path.abspath(__file__))


app.mount("/static", StaticFiles(directory=path.join(get_script_directory(), "static")), name="static")


@app.get("/", response_class=HTMLResponse, tags=["Global"])
async def home_page():
    script_path = get_script_directory()
    html_path = path.join(script_path, "index.html")

    with open(html_path, "r") as html_file:
        html_content = html_file.read()
    return HTMLResponse(content=html_content)


@app.get("/add_project", tags=["Global"])
async def add_project():
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects")

    if not path.exists(project_path):
        makedirs(project_path)

    max_project_id = 0
    for entry in listdir(project_path):
        if entry.isdigit():
            project_id = int(entry)
            max_project_id = max(max_project_id, project_id)

    new_project_id = max_project_id + 1
    new_project_path = path.join(project_path, str(new_project_id))
    makedirs(new_project_path)

    settings_file = path.join(new_project_path, "project_settings.json")
    with open(settings_file, "w") as file_settings:
        dump(create_project_data(new_project_id, []), file_settings)

    return await get_projects_list()


def create_project_data(new_project_id: int, images: list):
    return {"id_project": new_project_id, "project_name": "", "images": images, "images_width": PREVIEW_WIDTH}


def load_project_data(project_path):
    settings_file = path.join(project_path, "project_settings.json")
    if not path.exists(settings_file):
        return None

    with open(settings_file, "r") as file_settings:
        project_data = load(file_settings)

    if "images" in project_data:
        project_data["images_count"] = len(project_data["images"])
        del project_data["images"]
    else:
        project_data["images_count"] = 0

    return project_data


@app.get("/get_projects_list", tags=["Global"])
async def get_projects_list():
    script_path = get_script_directory()
    projects_path = path.join(script_path, "projects")

    projects_list = []
    for entry in listdir(projects_path):
        if entry.isdigit():
            project_path = path.join(projects_path, entry)
            project_data = load_project_data(project_path)
            if project_data:
                projects_list.append(project_data)

    projects_list.sort(key=lambda item: item["id_project"])

    return JSONResponse(content={"projects": projects_list})


@app.get("/get_project_data/{id_project}", tags=["Project"])
async def get_project_data(id_project: int):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects", str(id_project))

    project_data = load_project_data(project_path)
    if project_data:
        return JSONResponse(content=project_data)
    else:
        raise HTTPException(status_code=404, detail="Project not found")


async def set_project_property(id_project, property_name, property_value):
    settings_file = get_settings_path(id_project)

    with open(settings_file, "r") as file_settings:
        settings_data = load(file_settings)
    settings_data[property_name] = property_value

    with open(settings_file, "w") as file_settings:
        dump(settings_data, file_settings)

    return JSONResponse(content={"result": "ok", "value": property_value})


@app.post("/set_prediction_url", tags=["Project"])
async def set_project_name(id_project: int = Form(...), prediction_url: str = Form(...)):
    try:
        return await set_project_property(id_project, "prediction_url", prediction_url)

    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error updating prediction url: {exception}")


@app.post("/set_project_name", tags=["Project"])
async def set_project_name(id_project: int = Form(...), project_name: str = Form(...)):
    try:
        return await set_project_property(id_project, "project_name", project_name)

    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error updating project name: {exception}")


@app.post("/set_project_labels", tags=["Project"])
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


def get_settings_path(id_project):
    _, _, _, _, settings_file = get_all_path(id_project)
    return settings_file


def get_all_path(id_project):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects")
    project_path = path.join(project_path, str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    images_path = path.join(project_path, "images")
    preview_path = path.join(project_path, "preview")
    masks_path = path.join(project_path, "masks")
    settings_file = path.join(project_path, "project_settings.json")

    return project_path, images_path, preview_path, masks_path, settings_file


@app.post("/upload_image/{id_project}", tags=["Image"])
async def upload_image(id_project: int, image: UploadFile = File(...)):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects")
    project_path = path.join(project_path, str(id_project))
    images_path = path.join(project_path, "images")
    preview_path = path.join(project_path, "preview")
    settings_file = path.join(project_path, "project_settings.json")

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    if not path.exists(images_path):
        makedirs(images_path)

    if not path.exists(preview_path):
        makedirs(preview_path)

    image_name = transliterate(image.filename)
    image_path = path.join(images_path, image_name)

    if path.exists(image_path):
        return JSONResponse(content={"result": "error", "message": "Image with this name already exists."})

    try:
        with open(image_path, "wb") as file:
            file.write(await image.read())

        if not image_name.lower().endswith(".png"):
            image = Image.open(image_path)
            image.save(image_path, "PNG")
            remove(image_path)

        preview_path, preview_height = create_preview(image_name, image_path, preview_path)

        with open(settings_file, "r") as file_settings:
            settings_data = load(file_settings)

        if "images" not in settings_data:
            settings_data["images"] = []
            accumulated_height = 0

        else:
            accumulated_height = sum(image["preview_height"] for image in settings_data["images"])

        image_data = \
            {
                "image": image_name,
                "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "preview_height": preview_height,
                "accumulated_height": accumulated_height
            }

        settings_data["images"].append(image_data)

        with open(settings_file, "w") as file_settings:
            dump(settings_data, file_settings)

        update_all_previews(preview_path, preview_height, project_path)

        return JSONResponse(content={"result": "ok", "message": "Image uploaded successfully", "image_data": image_data})

    except Exception as exception:
        if path.exists(image_path):
            remove(image_path)
        raise HTTPException(status_code=500, detail=f"Error uploading image: {exception}")


@app.get("/get_png_mask/{id_project}/{image_name}/{label}", tags=["Mask"])
async def get_png_mask(id_project: int, image_name: str, label: str):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    masks_path = path.join(project_path, "masks")

    image_name = transliterate(path.basename(image_name))
    label = transliterate(path.basename(label))

    mask_filename = f"{image_name}_{label}.png"
    mask_path = path.join(masks_path, mask_filename)

    if not path.exists(mask_path):
        return Response(status_code=204)

    return FileResponse(mask_path, media_type='image/png')


@app.post("/upload_png_mask/{id_project}/{image_name}/{label}", tags=["Mask"])
async def upload_png_mask(
    id_project: int,
    image_name: str,
    label: str,
    image: UploadFile = File(...)
):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    masks_path = path.join(project_path, "masks")

    if not path.exists(masks_path):
        makedirs(masks_path)

    image_name = transliterate(path.basename(image_name))
    label = transliterate(path.basename(label))

    mask_filename = f"{image_name}_{label}.png"
    mask_path = path.join(masks_path, mask_filename)

    try:
        image_content = await image.read()

        incoming_hash = hashlib.md5(image_content).hexdigest()

        new_image = Image.open(BytesIO(image_content))
        new_image = new_image.convert("L")

        threshold_value = 10
        new_image = new_image.point(lambda p: 255 if p >= threshold_value else 0)

        undo_folder_name = f"{image_name}_{label}.png"
        undo_path = path.join(project_path, "undo", undo_folder_name)
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
                undo_file_path = path.join(undo_path, undo_filename)

                new_image.save(undo_file_path, 'PNG')

            else:
                creation_time = path.getctime(mask_path)
                old_timestamp = datetime.fromtimestamp(creation_time).strftime("%Y-%m-%d_%H-%M-%S")
                safe_move(mask_path, undo_path, f"{old_timestamp}_start_undo.png")
                new_image.save(path.join(undo_path, f"{timestamp}_{incoming_hash}.png"), 'PNG')

        new_image.save(mask_path, 'PNG')

        return JSONResponse(content={"result": "ok", "message": "Mask uploaded successfully"})

    except Exception as exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error uploading mask: {exception}")


@app.get("/undo_png_mask/{id_project}/{image_name}/{label}", tags=["Mask"])
async def undo_png_mask(id_project: int, image_name: str, label: str):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    masks_path = path.join(project_path, "masks")
    if not path.exists(masks_path):
        raise HTTPException(status_code=404, detail="Masks folder not found")

    image_name = transliterate(path.basename(image_name))
    label = transliterate(path.basename(label))

    mask_filename = f"{image_name}_{label}.png"
    mask_path = path.join(masks_path, mask_filename)

    undo_folder_name = f"{image_name}_{label}.png"
    undo_path = path.join(project_path, "undo", undo_folder_name)

    if not path.exists(undo_path):
        raise HTTPException(status_code=404, detail="Undo folder not found")

    undo_files = listdir(undo_path)
    if not undo_files:
        return JSONResponse(content={"result": "no-undo", "message": "No undo files available"})

    undo_files_sorted = sorted(undo_files)
    first_undo_file = undo_files_sorted[-1]
    first_undo_file_path = path.join(undo_path, first_undo_file)

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


@app.get("/get_vector_mask/{id_project}/{image_name}/{label}", tags=["Mask"])
async def get_vector_mask(id_project: int, image_name: str, label: str):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    vector_data_path = path.join(project_path, "vector_data")
    masks_path = path.join(project_path, "masks")

    image_name = transliterate(path.basename(image_name))
    label = transliterate(path.basename(label))

    vector_filename = f"{image_name}_{label}.json"
    vector_file_path = path.join(vector_data_path, vector_filename)

    mask_filename = f"{image_name}_{label}.png"
    mask_file_path = path.join(masks_path, mask_filename)

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


@app.post("/upload_vector_mask/{id_project}/{image_name}/{label}", tags=["Mask"])
async def upload_vector_mask(id_project: int, image_name: str, label: str, json_data: str = Form(...)):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    vector_data_path = path.join(project_path, "vector_data")
    if not path.exists(vector_data_path):
        makedirs(vector_data_path)

    image_name = transliterate(path.basename(image_name))
    label = transliterate(path.basename(label))

    vector_filename = f"{image_name}_{label}.json"
    vector_file_path = path.join(vector_data_path, vector_filename)

    try:
        json_object = loads(json_data)

        with open(vector_file_path, 'w', encoding='utf-8') as f:
            dump(json_object, f, ensure_ascii=False, indent=4)

        return JSONResponse(content={"result": "ok", "message": "Vector data saved successfully"})

    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error saving vector data: {exception}")


@app.get("/image/{id_project}/{image_name}", tags=["Image"])
async def get_image(id_project: int, image_name: str):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects", str(id_project))
    images_path = path.join(project_path, "images")
    image_file_path = path.join(images_path, image_name)

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    if not path.exists(image_file_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(image_file_path)


@app.post("/delete_image", tags=["Image"])
async def delete_image(id_project: int = Form(...), image_name: str = Form(...)):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects", str(id_project))
    images_path = path.join(project_path, "images")
    preview_path = path.join(project_path, "preview")
    masks_path = path.join(project_path, "masks")
    deleted_path = path.join(project_path, "deleted")
    settings_file = path.join(project_path, "project_settings.json")

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    if not path.exists(deleted_path):
        makedirs(deleted_path)

    image_file_path = path.join(images_path, image_name)
    preview_file_path = path.join(preview_path, image_name)

    # Перемещаем изображение в папку deleted
    if path.exists(image_file_path):
        deleted_image_path = path.join(deleted_path, "images")

        if not path.exists(deleted_image_path):
            makedirs(deleted_image_path)

        safe_move(image_file_path, deleted_image_path)

    # Перемещаем превью изображения в папку deleted
    if path.exists(preview_file_path):
        deleted_preview_path = path.join(deleted_path, "preview")

        if not path.exists(deleted_preview_path):
            makedirs(deleted_preview_path)

        safe_move(preview_file_path, deleted_preview_path)

    # Перемещаем все связанные маски
    if path.exists(masks_path):
        for mask_file in listdir(masks_path):
            if mask_file.startswith(image_name):
                mask_file_path = path.join(masks_path, mask_file)
                deleted_mask_path = path.join(deleted_path, "masks")

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

        # Выполняем обновление проекта
        await update_project(id_project)

        return JSONResponse(content={"result": "ok", "message": "Image deleted successfully."})

    except Exception as exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error deleting image: {exception}")


@app.get("/update_project/{id_project}", tags=["Project"])
async def update_project(id_project: int):
    project_path, images_path, preview_path, masks_path, settings_file = get_all_path(id_project)

    images = []
    for image_name in listdir(images_path):
        if image_name.lower().endswith(".png"):
            image_name = prepare_project_image(image_name, images_path)

            image_data = \
                {
                    "image": image_name,
                    "time": datetime.fromtimestamp(path.getmtime(path.join(images_path, image_name))).strftime("%Y-%m-%d %H:%M:%S")
                }

            preview_image = path.join(preview_path, image_name)
            if path.exists(preview_image) and path.getsize(preview_image) == 0:
                remove(preview_path)

            if not path.exists(preview_image) or path.getsize(preview_image) == 0:
                preview_image, preview_height = create_preview(image_name, path.join(images_path, image_name), preview_path)
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

    all_previews_path = path.join(project_path, "all_previews.png")
    if path.exists(all_previews_path):
        remove(all_previews_path)

    new_height = 0
    preview_images = []
    preview_heights = []
    for image_data in images:
        try:
            preview_image = Image.open(path.join(preview_path, image_data["image"]))
        except FileNotFoundError:
            preview_image = Image.new("RGB", (PREVIEW_WIDTH, 90), color="white")
            draw = ImageDraw.Draw(preview_image)
            draw.text((10, 40), "Missing image", fill="black")

        preview_images.append(preview_image)
        preview_width, preview_height = preview_image.size
        new_height += preview_height
        preview_heights.append(preview_height)

    if new_height == 0:
        if path.exists(all_previews_path):
            remove(all_previews_path)
    else:
        new_image = Image.new("RGB", (PREVIEW_WIDTH, new_height))
        y_offset = 0
        for index_image, image_data in enumerate(images):
            new_image.paste(preview_images[index_image], (0, y_offset))
            y_offset += preview_heights[index_image]

        new_image.save(all_previews_path)

    try:
        with open(settings_file, "r") as file_settings:
            settings_data = load(file_settings)
        settings_data["images"] = images
    except Exception:
        settings_data = create_project_data(id_project, images)

    with open(settings_file, "w") as file_settings:
        dump(settings_data, file_settings)

    return JSONResponse(content={"result": "ok", "message": "Project updated successfully."})


def prepare_project_image(image_name, images_path):
    transliterated_name = transliterate(image_name)
    if transliterated_name != image_name:
        old_path = path.join(images_path, image_name)
        new_path = path.join(images_path, transliterated_name)
        remove(old_path)
        makedirs(images_path, exist_ok=True)
        remove(new_path)
        makedirs(images_path, exist_ok=True)
        image_name = transliterated_name
    return image_name


@app.get("/get_images_list/{id_project}", tags=["Project"])
async def get_images_list(id_project: int):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    settings_file = path.join(project_path, "project_settings.json")
    if path.exists(settings_file):
        with open(settings_file, "r") as file_settings:
            project_data = load(file_settings)
            return JSONResponse(content={"images": project_data.get("images", []), "preview_file": f"/get_preview/{id_project}.png"})

    else:
        raise HTTPException(status_code=404, detail="Project settings not found")


def create_preview(image_name: str, image_path: str, preview_path: str) -> tuple:
    image = Image.open(image_path)
    image.thumbnail((PREVIEW_WIDTH, PREVIEW_WIDTH))
    preview_path = path.join(preview_path, image_name)
    image.save(preview_path)

    preview_width, preview_height = image.size

    return preview_path, preview_height


def update_all_previews(image_path: str, preview_height: int, project_path: str):
    all_previews_path = path.join(project_path, "all_previews.png")

    if path.exists(all_previews_path):
        all_previews = Image.open(all_previews_path)
        preview_image = Image.open(image_path)

        width, height = all_previews.size

        new_height = height + preview_height
        new_image = Image.new("RGB", (width, new_height))
        new_image.paste(all_previews, (0, 0))
        new_image.paste(preview_image, (0, height))

        new_image.save(all_previews_path)
    else:
        preview_image = Image.open(image_path)
        preview_image.save(all_previews_path)


@app.get("/get_preview/{id_project}.png", tags=["Project"])
async def get_preview(id_project: int):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects", str(id_project))
    all_previews_path = path.join(project_path, "all_previews.png")

    if not path.exists(all_previews_path):
        await update_project(id_project)

    if path.exists(all_previews_path):
        def parts_file():
            with open(all_previews_path, mode="rb") as file_like:
                yield from file_like

        # noinspection PyTypeChecker
        return StreamingResponse(parts_file(), media_type="image/png")
    else:
        raise HTTPException(status_code=404, detail="Preview image not found")


@app.get("/delete_project/{id_project}", tags=["Project"])
async def delete_project(id_project: int):
    script_path = get_script_directory()
    project_path = path.join(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        return {"error": "Project not found"}

    deleted_projects_path = path.join(script_path, "deleted")
    if not path.exists(deleted_projects_path):
        makedirs(deleted_projects_path)

    unique_id = uuid4().hex
    deleted_project_name = f"{id_project}_{unique_id}"
    deleted_project_path = path.join(deleted_projects_path, deleted_project_name)

    safe_move(project_path, deleted_project_path)

    return JSONResponse(content={"result": "ok", "message": "Project deleted successfully"})


async def read_user_image_data(id_project, label, file):
    settings_file = get_settings_path(id_project)

    if not path.exists(settings_file):
        return None, None, JSONResponse(
            content={"error": "Settings file not found"},
            status_code=404
        )

    with open(settings_file, "r") as file_settings:
        settings_data = load(file_settings)

    prediction_url = settings_data.get('prediction_url')
    if not prediction_url:
        return None, None, JSONResponse(
            content={"error": "Please specify prediction URL in project settings before predicting objects."},
            status_code=400
        )

    url = prediction_url.format(label=label)

    file_content = await file.read()

    try:
        image = Image.open(BytesIO(file_content))
        return url, image, None

    except Exception as exception:
        return None, None, JSONResponse(
            content={"error": f"Failed to open the image: {exception}"},
            status_code=400
        )


async def call_predict(url, filename, image_bytes, content_type):
    async with httpx.AsyncClient() as client:
        files = {'file': (filename, image_bytes, content_type)}
        try:
            response = await client.post(url, files=files)
        except httpx.RequestError as exception:
            return None, JSONResponse(
                content={"error": f"Object prediction query failed: {exception}"},
                status_code=502
            )

    if response.status_code != 200:
        return None, JSONResponse(
            content={"error": f"Prediction request failed with status {response.status_code}"},
            status_code=response.status_code
        )

    return response, None


@app.post("/predict/{id_project}/{label}", tags=["Project"])
async def predict(id_project: str, label: str, file: UploadFile = File(...)):
    url, image, error_response = await read_user_image_data(id_project, label, file)

    if error_response:
        return error_response

    if isinstance(image, Image.Image) and image.mode == 'RGBA':
        image = image.convert('RGB')

    output_buffer = BytesIO()
    image_format = image.format if isinstance(image, Image.Image) and image.format else 'PNG'
    image.save(output_buffer, format=image_format)
    image_bytes = output_buffer.getvalue()

    if image_format.upper() == 'JPEG':
        content_type = 'image/jpeg'
        filename = f"{file.filename.rsplit('.', 1)[0]}.jpg"
    else:
        content_type = 'image/png'
        filename = f"{file.filename.rsplit('.', 1)[0]}.png"

    response, error_response = await call_predict(url, filename, image_bytes, content_type)

    if error_response:
        return error_response

    return StreamingResponse(
        BytesIO(response.content),
        media_type=response.headers.get('content-type')
    )


def parse_dimension(value: str, total: int, name: str) -> Optional[int]:
    if isinstance(value, str) and value.endswith('%'):
        try:
            percentage = float(value.rstrip('%'))
            if not (0 <= percentage <= 100):
                print(f"Percentage for {name} out of bounds: {percentage}%")
                return None
            pixel_value = (percentage / 100) * total
            return int(round(pixel_value))
        except ValueError:
            print(f"Invalid percentage format for {name}: {value}")
            return None
    else:
        try:
            pixel = int(value)
            if pixel < 0:
                print(f"Negative value for {name}: {pixel}")
                return None
            return pixel
        except ValueError:
            print(f"Invalid integer format for {name}: {value}")
            return None


@app.post("/predict_with_crop/{id_project}/{label}", tags=["Project"])
async def predict_with_crop(
    id_project: str = Path(..., description="Project ID"),
    label: str = Path(..., description="Label to recognize"),
    x: str = Query(..., description="X coordinate of the upper left corner of the area (pixels or percentage)"),
    y: str = Query(..., description="Y coordinate of the upper left corner of the area (pixels or percentage)"),
    width: str = Query(..., description="Area width (pixels or percentage)"),
    height: str = Query(..., description="Area height (pixels or percentage)"),
    file: UploadFile = File(..., description="Image to be recognized"),
):
    url, image, error_response = await read_user_image_data(id_project, label, file)

    if error_response:
        return error_response

    original_width, original_height = image.size

    parsed_x = parse_dimension(x, original_width, 'x')
    parsed_y = parse_dimension(y, original_height, 'y')
    parsed_width = parse_dimension(width, original_width, 'width')
    parsed_height = parse_dimension(height, original_height, 'height')

    if None in (parsed_x, parsed_y, parsed_width, parsed_height):
        return JSONResponse(
            content={"error": "Invalid format for x, y, width, or height. Use non-negative integers or percentage strings (e.g., '42.3333%'). "
                              "Percentages must be between 0% and 100%."},
            status_code=400
        )

    if parsed_width <= 0 or parsed_height <= 0:
        return JSONResponse(
            content={"error": "The width and height of the area must be greater than zero."},
            status_code=400
        )

    parsed_x = max(parsed_x, 0)
    parsed_y = max(parsed_y, 0)
    parsed_width = min(parsed_width, original_width - parsed_x)
    parsed_height = min(parsed_height, original_height - parsed_y)

    cropped_image = image.crop((parsed_x, parsed_y, parsed_x + parsed_width, parsed_y + parsed_height))

    if cropped_image.mode == 'RGBA':
        cropped_image = cropped_image.convert('RGB')

    output_buffer = BytesIO()
    cropped_image.save(output_buffer, format='PNG')
    cropped_content = output_buffer.getvalue()

    content_type = 'image/png'
    filename = f"{file.filename.rsplit('.', 1)[0]}_cropped.png"

    response, error_response = await call_predict(url, filename, cropped_content, content_type)

    if error_response:
        return error_response

    try:
        mask = Image.open(BytesIO(response.content)).convert("RGBA")
    except Exception as exception:
        return JSONResponse(
            content={"error": f"Failed to process the prediction response: {exception}"},
            status_code=500
        )

    transparent_image = Image.new("RGBA", image.size, (0, 0, 0, 0))
    transparent_image.paste(mask, (parsed_x, parsed_y), mask)

    final_buffer = BytesIO()
    transparent_image.save(final_buffer, format='PNG')
    final_buffer.seek(0)

    return StreamingResponse(
        final_buffer,
        media_type='image/png'
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=API_PORT)
