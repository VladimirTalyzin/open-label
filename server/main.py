import sys

if sys.platform == "win32":
    import colorama
    colorama.init()

from os import path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from settings import API_PORT
from database import init_db

from router_auth import router as auth_router
from router_admin import router as admin_router
from router_projects import router as projects_router
from router_images import router as images_router
from router_masks import router as masks_router
from router_skeletons import router as skeletons_router
from router_predict import router as predict_router

init_db()

app = FastAPI(title="Open Label API", docs_url="/docs")

# noinspection PyTypeChecker
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

script_dir = path.dirname(path.abspath(__file__)).replace("\\", "/")
dist_dir = path.join(script_dir, "..", "dist").replace("\\", "/")
if path.exists(dist_dir):
    app.mount("/assets", StaticFiles(directory=path.join(dist_dir, "assets").replace("\\", "/")), name="assets")

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(projects_router)
app.include_router(images_router)
app.include_router(masks_router)
app.include_router(skeletons_router)
app.include_router(predict_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=API_PORT)
