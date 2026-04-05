from os import path, makedirs, listdir
from json import load, dump, loads

from fastapi import APIRouter, Form, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from PIL import Image

from utility import transliterate, join_path
from settings import PREVIEW_WIDTH
from helpers import get_script_directory

router = APIRouter()


def generate_skeleton_svg(skeletons, connections, img_width, img_height, preview_width=None):
    scale = max(img_width, img_height) / preview_width if preview_width else 1
    stroke_w = max(2, round(2 * scale))
    radius = max(4, round(4 * scale))
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {img_width} {img_height}" preserveAspectRatio="xMidYMid meet">']
    for skel in skeletons:
        pts = skel.get("points", [])
        color = "#2196F3"
        for conn in connections:
            if len(conn) >= 2:
                i1, i2 = conn[0], conn[1]
                if i1 < len(pts) and i2 < len(pts):
                    p1, p2 = pts[i1], pts[i2]
                    lines.append(f'<line x1="{p1["x"]:.1f}" y1="{p1["y"]:.1f}" x2="{p2["x"]:.1f}" y2="{p2["y"]:.1f}" stroke="{color}" stroke-width="{stroke_w}" opacity="0.7"/>')
        for p in pts:
            v = p.get("visible", 2)
            opacity = "0.7" if v >= 2 else "0.3"
            lines.append(f'<circle cx="{p["x"]:.1f}" cy="{p["y"]:.1f}" r="{radius}" fill="{color}" opacity="{opacity}"/>')
    lines.append('</svg>')
    return "\n".join(lines)


@router.get("/get_skeleton_data/{id_project}/{image_name}", tags=["Skeleton"])
async def get_skeleton_data(id_project: int, image_name: str):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    image_name = transliterate(path.basename(image_name))
    skeleton_file = join_path(project_path, "skeletons", f"{image_name}.json")

    if not path.exists(skeleton_file):
        return JSONResponse(content={"skeletons": []})

    with open(skeleton_file, "r", encoding="utf-8") as f:
        data = load(f)

    return JSONResponse(content={"skeletons": data})


@router.post("/upload_skeleton_data/{id_project}/{image_name}", tags=["Skeleton"])
async def upload_skeleton_data(id_project: int, image_name: str, json_data: str = Form(...)):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    skeleton_dir = join_path(project_path, "skeletons")
    if not path.exists(skeleton_dir):
        makedirs(skeleton_dir)

    image_name = transliterate(path.basename(image_name))
    skeleton_file = join_path(skeleton_dir, f"{image_name}.json")

    try:
        data = loads(json_data)
        with open(skeleton_file, "w", encoding="utf-8") as f:
            dump(data, f, ensure_ascii=False, indent=4)

        connections = []
        img_w, img_h = 1000, 1000
        settings_file = join_path(project_path, "project_settings.json")
        if path.exists(settings_file):
            with open(settings_file, "r") as sf:
                settings = load(sf)
                tpl = settings.get("skeleton_template", {})
                connections = tpl.get("connections", [])
                images_dir = join_path(project_path, "images")
                img_path = join_path(images_dir, image_name)
                if path.exists(img_path):
                    try:
                        with Image.open(img_path) as img:
                            img_w, img_h = img.size
                    except Exception:
                        pass

        svg_content = generate_skeleton_svg(data, connections, img_w, img_h, PREVIEW_WIDTH)
        svg_file = join_path(skeleton_dir, f"{image_name}.svg")
        with open(svg_file, "w", encoding="utf-8") as f:
            f.write(svg_content)

        return JSONResponse(content={"result": "ok", "message": "Skeleton data saved"})
    except Exception as exception:
        raise HTTPException(status_code=500, detail=f"Error saving skeleton data: {exception}")


@router.get("/get_skeleton_svg/{id_project}/{image_name}", tags=["Skeleton"])
async def get_skeleton_svg(id_project: int, image_name: str):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    image_name = transliterate(path.basename(image_name))
    svg_file = join_path(project_path, "skeletons", f"{image_name}.svg")

    if not path.exists(svg_file):
        raise HTTPException(status_code=404, detail="SVG not found")

    return FileResponse(svg_file, media_type="image/svg+xml")


@router.post("/regenerate_skeleton_svgs/{id_project}", tags=["Skeleton"])
async def regenerate_skeleton_svgs(id_project: int):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    skeleton_dir = join_path(project_path, "skeletons")
    if not path.exists(skeleton_dir):
        return JSONResponse(content={"result": "ok", "regenerated": 0})

    connections = []
    settings_file = join_path(project_path, "project_settings.json")
    if path.exists(settings_file):
        with open(settings_file, "r") as sf:
            settings = load(sf)
            tpl = settings.get("skeleton_template", {})
            connections = tpl.get("connections", [])

    images_dir = join_path(project_path, "images")
    count = 0
    for fname in listdir(skeleton_dir):
        if not fname.endswith(".json"):
            continue
        image_name = fname[:-5]
        json_file = join_path(skeleton_dir, fname)
        with open(json_file, "r", encoding="utf-8") as f:
            data = load(f)

        img_w, img_h = 1000, 1000
        img_path = join_path(images_dir, image_name)
        if path.exists(img_path):
            try:
                with Image.open(img_path) as img:
                    img_w, img_h = img.size
            except Exception:
                pass

        svg_content = generate_skeleton_svg(data, connections, img_w, img_h, PREVIEW_WIDTH)
        svg_file = join_path(skeleton_dir, f"{image_name}.svg")
        with open(svg_file, "w", encoding="utf-8") as f:
            f.write(svg_content)
        count += 1

    return JSONResponse(content={"result": "ok", "regenerated": count})


@router.get("/get_skeleton_mask/{id_project}/{image_name}", tags=["Skeleton"])
async def get_skeleton_mask(id_project: int, image_name: str):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    image_name = transliterate(path.basename(image_name))
    mask_path = join_path(project_path, "skeleton_masks", f"{image_name}.png")

    if not path.exists(mask_path):
        raise HTTPException(status_code=404, detail="Mask not found")

    return FileResponse(mask_path, media_type="image/png")


@router.post("/upload_skeleton_mask/{id_project}/{image_name}", tags=["Skeleton"])
async def upload_skeleton_mask(id_project: int, image_name: str, image: UploadFile = File(...)):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    masks_dir = join_path(project_path, "skeleton_masks")
    if not path.exists(masks_dir):
        makedirs(masks_dir)

    image_name = transliterate(path.basename(image_name))
    mask_path = join_path(masks_dir, f"{image_name}.png")

    contents = await image.read()
    with open(mask_path, "wb") as f:
        f.write(contents)

    return JSONResponse(content={"result": "ok"})
