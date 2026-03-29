import "bootstrap/dist/css/bootstrap.min.css"
import "../css/style.css"

import {request} from "./api.js"
import {addEventListenerWithId} from "./events.js"
import {updateProjects} from "./project.js"
import {checkAuth, showMainApp, setupLoginHandlers, showLogin} from "./auth.js"

addEventListenerWithId(document, "DOMContentLoaded", "startup", () =>
{
    setupLoginHandlers((user) =>
    {
        showApp(user)
    })

    checkAuth((user) =>
    {
        showApp(user)
    })
})

function showApp(user)
{
    showMainApp()

    const userInfo = document.getElementById("user-info")
    userInfo.textContent = `${user.username} (${user.group_name || "group " + user.group_id})`

    request(
        "get_projects_list",
        null,
        (responseJson) =>
        {
            updateProjects(responseJson, true)
        },
        (errorText) =>
        {
            if (errorText === "HTTP status != 200")
            {
                showLogin()
            }
            console.log(errorText)
        },
        false
    )

    const addProjectButton = document.getElementById("add-project-button")
    addEventListenerWithId(addProjectButton, "click", "add_project", () =>
        request(
            "add_project",
            null,
            (responseJson) =>
            {
                updateProjects(responseJson, true)
            },
            (errorText) =>
            {
                console.log(errorText)
            },
            false,
            addProjectButton
        )
    )

    const importButton = document.getElementById("import-project-button")
    const importFileInput = document.getElementById("import-project-file")

    addEventListenerWithId(importButton, "click", "import_project_click", () =>
    {
        importFileInput.click()
    })

    addEventListenerWithId(importFileInput, "change", "import_project_change", () =>
    {
        const file = importFileInput.files[0]
        if (!file) return

        const formData = new FormData()
        formData.append("file", file)

        importButton.disabled = true
        importButton.textContent = "Uploading..."

        fetch("/import_project", {method: "POST", body: formData})
            .then(r =>
            {
                if (r.status === 401)
                {
                    window.location.reload()
                    throw new Error("Not authenticated")
                }
                return r.json()
            })
            .then(data =>
            {
                if (data.projects)
                {
                    updateProjects(data, true)
                }
            })
            .catch(err => console.log(err))
            .finally(() =>
            {
                importButton.disabled = false
                importButton.textContent = "Upload project"
                importFileInput.value = ""
            })
    })
}
