from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import JSONResponse

from database import (
    create_group, get_all_groups, delete_group,
    create_user, get_all_users, delete_user, update_user_password, update_user_group,
    assign_project_to_group, remove_project_group
)
from helpers import get_admin_password, require_admin

router = APIRouter()


@router.post("/admin/login", tags=["Admin"])
async def admin_login(password: str = Form(...)):
    if password != get_admin_password():
        raise HTTPException(status_code=401, detail="Invalid admin password")
    response = JSONResponse(content={"result": "ok"})
    response.set_cookie(key="admin_token", value="admin_authenticated", httponly=True, samesite="lax")
    return response


@router.get("/admin/logout", tags=["Admin"])
async def admin_logout():
    response = JSONResponse(content={"result": "ok"})
    response.delete_cookie("admin_token")
    return response


@router.get("/admin/groups", tags=["Admin"])
async def admin_get_groups(request: Request):
    require_admin(request)
    groups = get_all_groups()
    return JSONResponse(content={"groups": [dict(g) for g in groups]})


@router.post("/admin/groups", tags=["Admin"])
async def admin_create_group(request: Request, name: str = Form(...)):
    require_admin(request)
    try:
        group = create_group(name)
        return JSONResponse(content={"result": "ok", "group": dict(group)})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/groups/delete", tags=["Admin"])
async def admin_delete_group(request: Request, group_id: int = Form(...)):
    require_admin(request)
    success = delete_group(group_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot delete group with users. Remove users first.")
    return JSONResponse(content={"result": "ok"})


@router.get("/admin/users", tags=["Admin"])
async def admin_get_users(request: Request):
    require_admin(request)
    users = get_all_users()
    return JSONResponse(content={"users": [dict(u) for u in users]})


@router.post("/admin/users", tags=["Admin"])
async def admin_create_user(request: Request, username: str = Form(...), password: str = Form(...), group_id: int = Form(...)):
    require_admin(request)
    try:
        user = create_user(username, password, group_id)
        return JSONResponse(content={"result": "ok", "user": dict(user)})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/users/delete", tags=["Admin"])
async def admin_delete_user(request: Request, user_id: int = Form(...)):
    require_admin(request)
    try:
        delete_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error deleting user: {str(e)}")
    return JSONResponse(content={"result": "ok"})


@router.post("/admin/users/password", tags=["Admin"])
async def admin_update_password(request: Request, user_id: int = Form(...), password: str = Form(...)):
    require_admin(request)
    update_user_password(user_id, password)
    return JSONResponse(content={"result": "ok"})


@router.post("/admin/users/group", tags=["Admin"])
async def admin_update_user_group(request: Request, user_id: int = Form(...), group_id: int = Form(...)):
    require_admin(request)
    update_user_group(user_id, group_id)
    return JSONResponse(content={"result": "ok"})


@router.post("/admin/project_group", tags=["Admin"])
async def admin_set_project_group(request: Request, project_id: int = Form(...), group_id: int = Form(...)):
    require_admin(request)
    remove_project_group(project_id)
    assign_project_to_group(project_id, group_id)
    return JSONResponse(content={"result": "ok"})


@router.get("/admin/project_groups", tags=["Admin"])
async def admin_get_project_groups(request: Request):
    require_admin(request)
    from database import get_connection
    conn = get_connection()
    try:
        rows = conn.execute("SELECT project_id, group_id FROM project_groups ORDER BY project_id").fetchall()
        return JSONResponse(content={"project_groups": [dict(r) for r in rows]})
    finally:
        conn.close()
