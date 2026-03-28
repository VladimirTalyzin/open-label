import {renderSkeletonEditor} from "./skeleton.js"
import {addEventListenerWithId} from "./events.js"

export function createSkeletonTab(project)
{
    const li = document.createElement("li")
    li.classList.add("nav-item")
    li.style.display = (project.project_type || "segmentation") === "yolo-skeleton" ? "" : "none"

    const button = document.createElement("a")
    button.classList.add("nav-link")
    button.href = "#"
    button.textContent = "Skeleton"
    li.appendChild(button)

    const div = document.createElement("div")
    div.id = "project-skeleton"
    div.style.display = "none"

    return {li, button, div}
}

export function initSkeletonTabHandler(skeletonButton, skeletonDiv, showContent, project)
{
    addEventListenerWithId(skeletonButton, "click", "show_skeleton", (e) =>
    {
        e.preventDefault()
        showContent(skeletonDiv, () =>
        {
            renderSkeletonEditor(
                skeletonDiv,
                project.skeleton_template || {points: [], connections: []},
                (data) =>
                {
                    const formData = new FormData()
                    formData.append("json_data", JSON.stringify(data))
                    fetch(`/set_skeleton_template/${project.id_project}`, {method: "POST", body: formData})
                        .then(r => r.json())
                        .then(resp =>
                        {
                            if (resp.result === "ok")
                            {
                                project.skeleton_template = resp.value
                            }
                        })
                }
            )
        })
    })
}
