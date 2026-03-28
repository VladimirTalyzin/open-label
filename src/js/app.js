import "bootstrap/dist/css/bootstrap.min.css"
import "../css/style.css"

import {request} from "./api.js"
import {addEventListenerWithId} from "./events.js"
import {updateProjects} from "./project.js"

addEventListenerWithId(document, "DOMContentLoaded", "startup", () =>
{
    request(
        "get_projects_list",
        null,
        (responseJson) =>
        {
            updateProjects(responseJson)
        },
        (errorText) =>
        {
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
                updateProjects(responseJson)
            },
            (errorText) =>
            {
                console.log(errorText)
            },
            false,
            addProjectButton
        )
    )
})
