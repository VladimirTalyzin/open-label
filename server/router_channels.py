"""
Многоканальность для проектов типа "yolo-skeleton".

Идея минимально инвазивная: ОСНОВНОЙ канал использует существующее хранилище проекта
(images/, skeletons/) и существующие эндпоинты без изменений. ДОПОЛНИТЕЛЬНЫЕ каналы
хранятся в подпапках images/<channel>/ и skeletons/<channel>/. Пары между каналами
связываются по ИМЕНИ файла (одинаковое имя = один и тот же объект/корова).

Конфигурация каналов хранится в project_settings.json:
    "channels": [
        {"name": "side", "main": true,  "model_url": "http://127.0.0.1:8200/predict/side"},
        {"name": "top",  "main": false, "model_url": "http://127.0.0.1:8200/predict/top"}
    ]

Эндпоинты канало-универсальны: для основного канала пути ведут в корень проекта,
для остальных — в подпапку канала. Загрузка основного канала по-прежнему идёт через
существующий /upload_image (он ведёт список изображений проекта = список объектов).
"""
from os import path, makedirs, remove, listdir
from json import load, dump, loads

import httpx
from fastapi import APIRouter, Form, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from PIL import Image

from utility import transliterate, join_path
from helpers import get_script_directory, get_settings_path

router = APIRouter()


def _project_path(id_project: int) -> str:
    p = join_path(get_script_directory(), "projects", str(id_project))
    if not path.exists(p):
        raise HTTPException(status_code=404, detail="Project not found")
    return p


def _load_settings(id_project: int) -> dict:
    with open(get_settings_path(id_project), "r") as f:
        return load(f)


def _channels(settings: dict) -> list:
    return settings.get("channels", []) or []


def _main_channel_name(settings: dict):
    for ch in _channels(settings):
        if ch.get("main"):
            return ch.get("name")
    chs = _channels(settings)
    return chs[0]["name"] if chs else None


def _is_main(settings: dict, channel: str) -> bool:
    main = _main_channel_name(settings)
    # основной канал ИЛИ проект без каналов → корневое хранилище
    return channel == main or not _channels(settings)


def _images_dir(id_project: int, channel: str, settings: dict) -> str:
    base = join_path(_project_path(id_project), "images")
    return base if _is_main(settings, channel) else join_path(base, channel)


def _skeletons_dir(id_project: int, channel: str, settings: dict) -> str:
    base = join_path(_project_path(id_project), "skeletons")
    return base if _is_main(settings, channel) else join_path(base, channel)


@router.post("/set_project_channels", tags=["Project"])
async def set_project_channels(id_project: int = Form(...), channels: str = Form(...)):
    """channels — JSON-массив [{name, main, model_url}]. Ровно один main."""
    try:
        data = loads(channels)
        if not isinstance(data, list):
            raise ValueError("channels must be a list")
        names = [c.get("name", "").strip() for c in data]
        if any(not n for n in names):
            raise ValueError("channel name cannot be empty")
        if len(set(names)) != len(names):
            raise ValueError("channel names must be unique")
        # ровно один основной
        mains = [c for c in data if c.get("main")]
        if data and not mains:
            data[0]["main"] = True
        elif len(mains) > 1:
            for c in data[1:]:
                c["main"] = False

        settings_file = get_settings_path(id_project)
        with open(settings_file, "r") as f:
            settings = load(f)
        settings["channels"] = data
        with open(settings_file, "w") as f:
            dump(settings, f)
        return JSONResponse(content={"result": "ok", "value": data})
    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error saving channels: {exception}")


@router.post("/set_channel_skeleton_template/{id_project}/{channel}", tags=["Project"])
async def set_channel_skeleton_template(id_project: int, channel: str, json_data: str = Form(...)):
    """Сохраняет шаблон скелета для конкретного канала (side — 29 точек, top — 14 и т.п.)."""
    try:
        tpl = loads(json_data)
        settings_file = get_settings_path(id_project)
        with open(settings_file, "r") as f:
            settings = load(f)
        chans = settings.get("channels", []) or []
        found = False
        for ch in chans:
            if ch.get("name") == channel:
                ch["skeleton_template"] = tpl
                found = True
                break
        if not found:
            raise HTTPException(status_code=404, detail=f"Channel '{channel}' not found")
        settings["channels"] = chans
        with open(settings_file, "w") as f:
            dump(settings, f)
        return JSONResponse(content={"result": "ok", "value": tpl})
    except HTTPException:
        raise
    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error saving channel template: {exception}")


@router.post("/upload_image_channel/{id_project}/{channel}", tags=["Image"])
async def upload_image_channel(id_project: int, channel: str, image: UploadFile = File(...)):
    """Загрузка изображения в ДОП. канал. Для основного канала используйте /upload_image."""
    settings = _load_settings(id_project)
    if _is_main(settings, channel):
        raise HTTPException(status_code=400, detail="Use /upload_image for the main channel")

    images_path = _images_dir(id_project, channel, settings)
    if not path.exists(images_path):
        makedirs(images_path)

    image_name = transliterate(image.filename)
    image_path = join_path(images_path, image_name)

    try:
        image_bytes = await image.read()
        with open(image_path, "wb") as f:
            f.write(image_bytes)

        if not image_name.lower().endswith(".png"):
            img = Image.open(image_path)
            png_name = path.splitext(image_name)[0] + ".png"
            png_path = join_path(images_path, png_name)
            img.save(png_path, "PNG")
            remove(image_path)
            image_name = png_name

        return JSONResponse(content={"result": "ok", "image": image_name, "channel": channel})
    except Exception as exception:
        if path.exists(image_path):
            remove(image_path)
        raise HTTPException(status_code=500, detail=f"Error uploading image: {exception}")


@router.get("/image_channel/{id_project}/{channel}/{image_name}", tags=["Image"])
async def get_image_channel(id_project: int, channel: str, image_name: str):
    settings = _load_settings(id_project)
    images_path = _images_dir(id_project, channel, settings)
    image_file = join_path(images_path, transliterate(path.basename(image_name)))
    if not path.exists(image_file):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(image_file)


@router.get("/channel_images/{id_project}/{channel}", tags=["Image"])
async def list_channel_images(id_project: int, channel: str):
    """Имена изображений, присутствующих в канале (для индикации наличия пары)."""
    settings = _load_settings(id_project)
    images_path = _images_dir(id_project, channel, settings)
    names = []
    if path.exists(images_path):
        names = [n for n in listdir(images_path) if n.lower().endswith(".png")]
    return JSONResponse(content={"images": names})


def _channel_model_url(settings: dict, channel: str):
    for ch in _channels(settings):
        if ch.get("name") == channel:
            return (ch.get("model_url") or "").strip()
    return ""


@router.post("/predict_skeleton/{id_project}/{channel}", tags=["Skeleton"])
async def predict_skeleton(id_project: int, channel: str, file: UploadFile = File(...)):
    """Прокси к модели канала (model_url). Возвращает JSON с точками скелета
    (в формате DLC-сервиса: {width,height,points:[{index,name,x,y,confidence,detected,filled,visible}]})."""
    settings = _load_settings(id_project)
    model_url = _channel_model_url(settings, channel)
    if not model_url:
        raise HTTPException(status_code=400, detail=f"No model_url configured for channel '{channel}'")

    content = await file.read()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(model_url, files={"file": (file.filename or "image.png", content, file.content_type or "image/png")})
    except httpx.RequestError as exception:
        raise HTTPException(status_code=502, detail=f"Model request failed: {exception}")
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Model returned {resp.status_code}: {resp.text[:200]}")
    try:
        return JSONResponse(content=resp.json())
    except Exception:
        raise HTTPException(status_code=502, detail="Model did not return JSON")


@router.get("/get_skeleton_data_channel/{id_project}/{channel}/{image_name}", tags=["Skeleton"])
async def get_skeleton_data_channel(id_project: int, channel: str, image_name: str):
    settings = _load_settings(id_project)
    skel_dir = _skeletons_dir(id_project, channel, settings)
    image_name = transliterate(path.basename(image_name))
    skel_file = join_path(skel_dir, f"{image_name}.json")
    if not path.exists(skel_file):
        return JSONResponse(content={"skeletons": []})
    with open(skel_file, "r", encoding="utf-8") as f:
        return JSONResponse(content={"skeletons": load(f)})


def _channel_template(settings: dict, channel: str) -> dict:
    for ch in _channels(settings):
        if ch.get("name") == channel:
            return ch.get("skeleton_template") or {}
    return settings.get("skeleton_template") or {}


@router.post("/upload_skeleton_data_channel/{id_project}/{channel}/{image_name}", tags=["Skeleton"])
async def upload_skeleton_data_channel(id_project: int, channel: str, image_name: str, json_data: str = Form(...)):
    from settings import PREVIEW_WIDTH
    from router_skeletons import generate_skeleton_svg

    settings = _load_settings(id_project)
    skel_dir = _skeletons_dir(id_project, channel, settings)
    if not path.exists(skel_dir):
        makedirs(skel_dir)
    image_name = transliterate(path.basename(image_name))
    skel_file = join_path(skel_dir, f"{image_name}.json")
    try:
        data = loads(json_data)
        with open(skel_file, "w", encoding="utf-8") as f:
            dump(data, f, ensure_ascii=False, indent=4)

        # SVG-превью скелета канала (для маленького скелета на preview)
        try:
            tpl = _channel_template(settings, channel)
            connections = tpl.get("connections", [])
            images_dir = _images_dir(id_project, channel, settings)
            img_path = join_path(images_dir, image_name)
            img_w, img_h = 1000, 1000
            if path.exists(img_path):
                with Image.open(img_path) as im:
                    img_w, img_h = im.size
            svg = generate_skeleton_svg(data, connections, img_w, img_h, PREVIEW_WIDTH)
            with open(join_path(skel_dir, f"{image_name}.svg"), "w", encoding="utf-8") as f:
                f.write(svg)
        except Exception:
            pass  # SVG не критичен

        return JSONResponse(content={"result": "ok"})
    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error saving skeleton data: {exception}")


@router.get("/get_skeleton_svg_channel/{id_project}/{channel}/{image_name}", tags=["Skeleton"])
async def get_skeleton_svg_channel(id_project: int, channel: str, image_name: str):
    from settings import PREVIEW_WIDTH
    from router_skeletons import generate_skeleton_svg

    settings = _load_settings(id_project)
    skel_dir = _skeletons_dir(id_project, channel, settings)
    name = transliterate(path.basename(image_name))
    svg_file = join_path(skel_dir, f"{name}.svg")
    json_file = join_path(skel_dir, f"{name}.json")

    # Если SVG нет (например, разметка сделана в старой версии) — генерируем из JSON
    if not path.exists(svg_file):
        if not path.exists(json_file):
            raise HTTPException(status_code=404, detail="Skeleton not found")
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = load(f)
            tpl = _channel_template(settings, channel)
            connections = tpl.get("connections", [])
            images_dir = _images_dir(id_project, channel, settings)
            img_path = join_path(images_dir, name)
            img_w, img_h = 1000, 1000
            if path.exists(img_path):
                with Image.open(img_path) as im:
                    img_w, img_h = im.size
            svg = generate_skeleton_svg(data, connections, img_w, img_h, PREVIEW_WIDTH)
            with open(svg_file, "w", encoding="utf-8") as f:
                f.write(svg)
        except Exception as exception:
            raise HTTPException(status_code=500, detail=f"SVG generation failed: {exception}")
    return FileResponse(svg_file, media_type="image/svg+xml")


@router.get("/get_channel_preview/{id_project}/{channel}/{image_name}", tags=["Image"])
async def get_channel_preview(id_project: int, channel: str, image_name: str):
    """Уменьшенное превью картинки канала (кэшируется в preview/<channel>/<image>)."""
    from settings import PREVIEW_WIDTH
    settings = _load_settings(id_project)
    name = transliterate(path.basename(image_name))
    images_path = _images_dir(id_project, channel, settings)
    src = join_path(images_path, name)
    if not path.exists(src):
        raise HTTPException(status_code=404, detail="Image not found")

    project_path = _project_path(id_project)
    if _is_main(settings, channel):
        prev_dir = join_path(project_path, "preview")
    else:
        prev_dir = join_path(project_path, "preview", channel)
    if not path.exists(prev_dir):
        makedirs(prev_dir)
    prev_file = join_path(prev_dir, name)
    if not path.exists(prev_file) or path.getmtime(prev_file) < path.getmtime(src):
        img = Image.open(src)
        img.thumbnail((PREVIEW_WIDTH, PREVIEW_WIDTH))
        img.save(prev_file)
    return FileResponse(prev_file, media_type="image/png")


@router.post("/set_preview_channel", tags=["Project"])
async def set_preview_channel(id_project: int = Form(...), channel: str = Form(...)):
    settings_file = get_settings_path(id_project)
    with open(settings_file, "r") as f:
        settings = load(f)
    settings["preview_channel"] = channel
    with open(settings_file, "w") as f:
        dump(settings, f)
    return JSONResponse(content={"result": "ok", "value": channel})
