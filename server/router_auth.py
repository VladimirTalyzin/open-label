from os import path

from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

from database import create_session, delete_session
from helpers import get_script_directory, get_current_user

router = APIRouter()


@router.get("/", response_class=HTMLResponse, tags=["Global"])
async def home_page():
    script_path = get_script_directory()
    html_path = path.join(script_path, "..", "dist", "index.html").replace("\\", "/")

    if not path.exists(html_path):
        return HTMLResponse(content="<h1>Run `npm run build` first</h1>", status_code=503)

    with open(html_path, "r") as html_file:
        html_content = html_file.read()
    return HTMLResponse(content=html_content)


@router.post("/auth/login", tags=["Auth"])
async def login(username: str = Form(...), password: str = Form(...)):
    token, user = create_session(username, password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    response = JSONResponse(content={
        "result": "ok",
        "user": {"id": user["id"], "username": user["username"], "group_id": user["group_id"]}
    })
    response.set_cookie(key="session_token", value=token, httponly=True, samesite="lax")
    return response


@router.get("/auth/logout", tags=["Auth"])
async def logout(request: Request):
    token = request.cookies.get("session_token")
    if token:
        delete_session(token)
    response = JSONResponse(content={"result": "ok"})
    response.delete_cookie("session_token")
    response.delete_cookie("admin_token")
    return response


@router.get("/auth/me", tags=["Auth"])
async def me(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return JSONResponse(content={
        "user": {
            "id": user["id"],
            "username": user["username"],
            "group_id": user["group_id"],
            "group_name": user.get("group_name", "")
        }
    })
