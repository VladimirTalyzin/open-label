from os import path, makedirs

from fastapi import HTTPException, Request

from utility import join_path
from database import get_user_by_session, get_project_group
from settings import PREVIEW_WIDTH


def get_script_directory():
    return path.dirname(path.abspath(__file__)).replace("\\", "/")


def get_all_path(id_project):
    script_path = get_script_directory()
    project_path = join_path(script_path, "projects", str(id_project))

    if not path.exists(project_path):
        raise HTTPException(status_code=404, detail="Project not found")

    images_path = join_path(project_path, "images")
    preview_path = join_path(project_path, "preview")
    masks_path = join_path(project_path, "masks")
    settings_file = join_path(project_path, "project_settings.json")

    return project_path, images_path, preview_path, masks_path, settings_file


def get_settings_path(id_project):
    _, _, _, _, settings_file = get_all_path(id_project)
    return settings_file


def get_admin_password():
    admin_file = join_path(get_script_directory(), "admin_password.txt")
    if not path.exists(admin_file):
        return "admin"
    with open(admin_file, "r") as f:
        return f.read().strip()


def get_current_user(request: Request):
    token = request.cookies.get("session_token")
    return get_user_by_session(token)


def require_user(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_admin(request: Request):
    token = request.cookies.get("admin_token")
    if token != "admin_authenticated":
        raise HTTPException(status_code=401, detail="Admin access required")


def user_can_access_project(user, project_id):
    project_group = get_project_group(project_id)
    if project_group is None:
        return True
    return project_group == user["group_id"]


def create_project_data(new_project_id: int, images: list):
    return {"id_project": new_project_id, "project_name": "", "images": images, "images_width": PREVIEW_WIDTH}


def load_project_data(project_path):
    settings_file = join_path(project_path, "project_settings.json")
    if not path.exists(settings_file):
        return None

    from json import load
    with open(settings_file, "r") as file_settings:
        project_data = load(file_settings)

    if "images" in project_data:
        project_data["images_count"] = len(project_data["images"])
        skeletons_dir = join_path(project_path, "skeletons")
        project_data["annotated_count"] = sum(
            1 for img in project_data["images"]
            if img.get("masks") or path.exists(join_path(skeletons_dir, f"{img['image']}.json"))
        )
        del project_data["images"]
    else:
        project_data["images_count"] = 0
        project_data["annotated_count"] = 0

    return project_data


async def set_project_property(id_project, property_name, property_value):
    from json import load, dump
    from fastapi.responses import JSONResponse

    settings_file = get_settings_path(id_project)

    with open(settings_file, "r") as file_settings:
        settings_data = load(file_settings)
    settings_data[property_name] = property_value

    with open(settings_file, "w") as file_settings:
        dump(settings_data, file_settings)

    return JSONResponse(content={"result": "ok", "value": property_value})


def create_preview(image_name: str, image_path: str, preview_path: str) -> tuple:
    from PIL import Image

    image = Image.open(image_path)
    image.thumbnail((PREVIEW_WIDTH, PREVIEW_WIDTH))
    preview_file = join_path(preview_path, image_name)
    image.save(preview_file)

    preview_width, preview_height = image.size

    return preview_file, preview_height


def update_all_previews(image_path: str, preview_height: int, project_path: str, block_index: int):
    from PIL import Image

    all_preview_dir = join_path(project_path, "all-preview")
    makedirs(all_preview_dir, exist_ok=True)
    block_path = join_path(all_preview_dir, f"{block_index}.png")

    if path.exists(block_path):
        all_previews = Image.open(block_path)
        preview_image = Image.open(image_path)

        width, height = all_previews.size

        new_height = height + preview_height
        new_image = Image.new("RGB", (width, new_height))
        new_image.paste(all_previews, (0, 0))
        new_image.paste(preview_image, (0, height))

        new_image.save(block_path)
    else:
        preview_image = Image.open(image_path)
        preview_image.save(block_path)


def prepare_project_image(image_name, images_path):
    from os import remove
    from utility import transliterate

    transliterated_name = transliterate(image_name)
    if transliterated_name != image_name:
        old_path = join_path(images_path, image_name)
        new_path = join_path(images_path, transliterated_name)
        remove(old_path)
        makedirs(images_path, exist_ok=True)
        remove(new_path)
        makedirs(images_path, exist_ok=True)
        image_name = transliterated_name
    return image_name
