import {request} from "./api.js"

export function checkAuth(onSuccess)
{
    fetch("/auth/me", {cache: "no-store"})
        .then((response) =>
        {
            if (response.status === 200)
            {
                return response.json()
            }
            throw new Error("Not authenticated")
        })
        .then((data) =>
        {
            onSuccess(data.user)
        })
        .catch(() =>
        {
            showLogin()
        })
}

export function showLogin()
{
    document.getElementById("login-container").style.display = "block"
    document.getElementById("admin-login-container").style.display = "none"
    document.getElementById("admin-container").style.display = "none"
    document.getElementById("main-app").style.display = "none"
}

export function showMainApp()
{
    document.getElementById("login-container").style.display = "none"
    document.getElementById("admin-login-container").style.display = "none"
    document.getElementById("admin-container").style.display = "none"
    document.getElementById("main-app").style.display = "block"
}

export function setupLoginHandlers(onLoginSuccess)
{
    const loginButton = document.getElementById("login-button")
    const usernameInput = document.getElementById("login-username")
    const passwordInput = document.getElementById("login-password")
    const loginError = document.getElementById("login-error")

    function doLogin()
    {
        const username = usernameInput.value.trim()
        const password = passwordInput.value

        if (!username || !password)
        {
            loginError.textContent = "Please enter username and password"
            loginError.style.display = "block"
            return
        }

        const formData = new FormData()
        formData.append("username", username)
        formData.append("password", password)

        fetch("/auth/login", {method: "POST", body: formData})
            .then((response) =>
            {
                if (response.status === 200)
                {
                    return response.json()
                }
                throw new Error("Invalid credentials")
            })
            .then((data) =>
            {
                loginError.style.display = "none"
                onLoginSuccess(data.user)
            })
            .catch(() =>
            {
                loginError.textContent = "Invalid username or password"
                loginError.style.display = "block"
            })
    }

    loginButton.addEventListener("click", doLogin)
    passwordInput.addEventListener("keydown", (e) =>
    {
        if (e.key === "Enter")
        {
            doLogin()
        }
    })
    usernameInput.addEventListener("keydown", (e) =>
    {
        if (e.key === "Enter")
        {
            passwordInput.focus()
        }
    })

    // Admin panel toggle
    document.getElementById("admin-login-toggle").addEventListener("click", () =>
    {
        document.getElementById("login-container").style.display = "none"
        document.getElementById("admin-login-container").style.display = "block"
    })

    document.getElementById("admin-back-button").addEventListener("click", () =>
    {
        document.getElementById("admin-login-container").style.display = "none"
        document.getElementById("login-container").style.display = "block"
    })

    // Admin login
    const adminLoginButton = document.getElementById("admin-login-button")
    const adminPasswordInput = document.getElementById("admin-password")
    const adminLoginError = document.getElementById("admin-login-error")

    function doAdminLogin()
    {
        const password = adminPasswordInput.value

        if (!password)
        {
            adminLoginError.textContent = "Please enter admin password"
            adminLoginError.style.display = "block"
            return
        }

        const formData = new FormData()
        formData.append("password", password)

        fetch("/admin/login", {method: "POST", body: formData})
            .then((response) =>
            {
                if (response.status === 200)
                {
                    return response.json()
                }
                throw new Error("Invalid password")
            })
            .then(() =>
            {
                adminLoginError.style.display = "none"
                showAdminPanel()
            })
            .catch(() =>
            {
                adminLoginError.textContent = "Invalid admin password"
                adminLoginError.style.display = "block"
            })
    }

    adminLoginButton.addEventListener("click", doAdminLogin)
    adminPasswordInput.addEventListener("keydown", (e) =>
    {
        if (e.key === "Enter")
        {
            doAdminLogin()
        }
    })

    // Logout
    document.getElementById("logout-button").addEventListener("click", () =>
    {
        fetch("/auth/logout", {cache: "no-store"}).then(() => showLogin())
    })

    // Admin logout
    document.getElementById("admin-logout-button").addEventListener("click", () =>
    {
        fetch("/admin/logout", {cache: "no-store"}).then(() => showLogin())
    })
}

function showAdminPanel()
{
    document.getElementById("login-container").style.display = "none"
    document.getElementById("admin-login-container").style.display = "none"
    document.getElementById("main-app").style.display = "none"
    document.getElementById("admin-container").style.display = "block"

    loadAdminData()
}

function loadAdminData()
{
    loadGroups()
    loadUsers()
    loadProjectGroups()
}

function loadGroups()
{
    Promise.all([
        fetch("/admin/groups", {cache: "no-store"}).then(r => r.json()),
        fetch("/admin/users", {cache: "no-store"}).then(r => r.json())
    ]).then(([data, usersData]) =>
    {
        const container = document.getElementById("groups-list")
        container.innerHTML = ""

        const select = document.getElementById("new-user-group")
        select.innerHTML = ""

        const usersByGroup = {}
        for (const user of usersData.users)
        {
            if (!usersByGroup[user.group_id])
            {
                usersByGroup[user.group_id] = []
            }
            usersByGroup[user.group_id].push(user)
        }

        for (const group of data.groups)
        {
            const card = document.createElement("div")
            card.classList.add("mb-2", "p-2", "border", "rounded")

            const header = document.createElement("div")
            header.classList.add("d-flex", "align-items-center", "justify-content-between")

            const nameSpan = document.createElement("span")
            nameSpan.innerHTML = `<strong>${group.name}</strong> <small class="text-muted">(id: ${group.id})</small>`

            const deleteBtn = document.createElement("button")
            deleteBtn.classList.add("btn", "btn-danger", "btn-sm")
            deleteBtn.textContent = "Delete"
            deleteBtn.addEventListener("click", () =>
            {
                if (!confirm(`Delete group "${group.name}"?`))
                {
                    return
                }
                const formData = new FormData()
                formData.append("group_id", group.id)
                fetch("/admin/groups/delete", {method: "POST", body: formData})
                    .then(r => r.json())
                    .then(result =>
                    {
                        if (result.result === "ok")
                        {
                            loadAdminData()
                        }
                        else
                        {
                            alert(result.detail || "Error deleting group")
                        }
                    })
                    .catch(() => alert("Error deleting group"))
            })

            header.appendChild(nameSpan)
            header.appendChild(deleteBtn)
            card.appendChild(header)

            const groupUsers = usersByGroup[group.id] || []
            if (groupUsers.length > 0)
            {
                const usersList = document.createElement("div")
                usersList.classList.add("mt-2", "ms-3")

                for (const user of groupUsers)
                {
                    const userDiv = document.createElement("div")
                    userDiv.classList.add("d-flex", "align-items-center", "justify-content-between", "mb-1")

                    const userSpan = document.createElement("span")
                    userSpan.classList.add("text-muted", "small")
                    userSpan.textContent = user.username

                    const removeBtn = document.createElement("button")
                    removeBtn.classList.add("btn", "btn-outline-danger", "btn-sm", "py-0", "px-1")
                    removeBtn.textContent = "×"
                    removeBtn.title = `Delete user "${user.username}"`
                    removeBtn.addEventListener("click", () =>
                    {
                        if (!confirm(`Delete user "${user.username}" from group "${group.name}"?\nThe user will be deleted entirely.`))
                        {
                            return
                        }
                        const formData = new FormData()
                        formData.append("user_id", user.id)
                        fetch("/admin/users/delete", {method: "POST", body: formData})
                            .then(r =>
                            {
                                if (!r.ok)
                                {
                                    throw new Error("Server error")
                                }
                                return r.json()
                            })
                            .then(() => loadAdminData())
                            .catch(() => alert(`Error deleting user "${user.username}"`))
                    })

                    userDiv.appendChild(userSpan)
                    userDiv.appendChild(removeBtn)
                    usersList.appendChild(userDiv)
                }

                card.appendChild(usersList)
            }
            else
            {
                const emptyMsg = document.createElement("div")
                emptyMsg.classList.add("mt-1", "ms-3", "text-muted", "small", "fst-italic")
                emptyMsg.textContent = "No users"
                card.appendChild(emptyMsg)
            }

            container.appendChild(card)

            const option = document.createElement("option")
            option.value = group.id
            option.textContent = group.name
            select.appendChild(option)
        }
    })

    // Add group button
    const addGroupBtn = document.getElementById("add-group-button")
    addGroupBtn.onclick = () =>
    {
        const name = document.getElementById("new-group-name").value.trim()
        if (!name)
        {
            return
        }

        const formData = new FormData()
        formData.append("name", name)
        fetch("/admin/groups", {method: "POST", body: formData})
            .then(r => r.json())
            .then(() =>
            {
                document.getElementById("new-group-name").value = ""
                loadAdminData()
            })
    }
}

function loadUsers()
{
    fetch("/admin/users", {cache: "no-store"})
        .then(r => r.json())
        .then(data =>
        {
            const container = document.getElementById("users-list")
            container.innerHTML = ""

            for (const user of data.users)
            {
                const div = document.createElement("div")
                div.classList.add("d-flex", "align-items-center", "justify-content-between", "mb-2", "p-2", "border", "rounded")

                const infoSpan = document.createElement("span")
                infoSpan.textContent = `${user.username} — ${user.group_name || "no group"}`

                const deleteBtn = document.createElement("button")
                deleteBtn.classList.add("btn", "btn-danger", "btn-sm")
                deleteBtn.textContent = "Delete"
                deleteBtn.addEventListener("click", () =>
                {
                    if (!confirm(`Delete user "${user.username}"?`))
                    {
                        return
                    }
                    const formData = new FormData()
                    formData.append("user_id", user.id)
                    fetch("/admin/users/delete", {method: "POST", body: formData})
                        .then(r =>
                        {
                            if (!r.ok)
                            {
                                throw new Error("Server error")
                            }
                            return r.json()
                        })
                        .then(() => loadAdminData())
                        .catch(() => alert(`Error deleting user "${user.username}"`))
                })

                div.appendChild(infoSpan)
                div.appendChild(deleteBtn)
                container.appendChild(div)
            }
        })

    // Add user button
    const addUserBtn = document.getElementById("add-user-button")
    addUserBtn.onclick = () =>
    {
        const username = document.getElementById("new-user-name").value.trim()
        const password = document.getElementById("new-user-password").value
        const groupId = document.getElementById("new-user-group").value

        if (!username || !password || !groupId)
        {
            alert("Fill all fields")
            return
        }

        const formData = new FormData()
        formData.append("username", username)
        formData.append("password", password)
        formData.append("group_id", groupId)
        fetch("/admin/users", {method: "POST", body: formData})
            .then(r => r.json())
            .then(() =>
            {
                document.getElementById("new-user-name").value = ""
                document.getElementById("new-user-password").value = ""
                loadAdminData()
            })
    }
}

function loadProjectGroups()
{
    Promise.all([
        fetch("/admin/project_groups", {cache: "no-store"}).then(r => r.json()),
        fetch("/admin/groups", {cache: "no-store"}).then(r => r.json())
    ]).then(([pgData, groupsData]) =>
    {
        const container = document.getElementById("project-groups-list")
        container.innerHTML = ""

        if (pgData.project_groups.length === 0)
        {
            container.textContent = "No projects assigned to groups yet. Create projects first, then assign them here."
            return
        }

        const groupMap = {}
        for (const g of groupsData.groups)
        {
            groupMap[g.id] = g.name
        }

        for (const pg of pgData.project_groups)
        {
            const div = document.createElement("div")
            div.classList.add("d-flex", "align-items-center", "mb-2", "p-2", "border", "rounded", "gap-2")

            const label = document.createElement("span")
            label.textContent = `Project #${pg.project_id}`
            label.style.minWidth = "100px"

            const select = document.createElement("select")
            select.classList.add("form-select", "form-select-sm")
            select.style.maxWidth = "200px"

            for (const g of groupsData.groups)
            {
                const option = document.createElement("option")
                option.value = g.id
                option.textContent = g.name
                if (g.id === pg.group_id)
                {
                    option.selected = true
                }
                select.appendChild(option)
            }

            select.addEventListener("change", () =>
            {
                const formData = new FormData()
                formData.append("project_id", pg.project_id)
                formData.append("group_id", select.value)
                fetch("/admin/project_group", {method: "POST", body: formData})
                    .then(r => r.json())
            })

            div.appendChild(label)
            div.appendChild(select)
            container.appendChild(div)
        }
    })
}
