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
            skeletonDiv.innerHTML = ""
            const channels = Array.isArray(project.channels) ? project.channels : []
            const editorDiv = document.createElement("div")
            let currentChannel = null   // имя активного канала (null = шаблон проекта)

            // Импорт шаблона скелета из другого YOLO-skeleton проекта
            const openImportPicker = (anchorEl) =>
            {
                const prev = skeletonDiv.querySelector(".skel-import-picker")
                if (prev) prev.remove()
                fetch("/get_projects_list", {cache: "no-store"})
                    .then(r => r.json())
                    .then(data =>
                    {
                        const picker = document.createElement("div")
                        picker.className = "skel-import-picker"
                        picker.style.cssText = "display:inline-flex;gap:6px;align-items:center;margin-left:8px;padding:6px;background:#f3f6ff;border:1px solid #cdddff;border-radius:6px;flex-wrap:wrap;"

                        const sel = document.createElement("select")
                        sel.classList.add("form-select", "form-select-sm", "d-inline-block")
                        sel.style.width = "240px"
                        const others = (data.projects || []).filter(p => p.id_project !== project.id_project)
                        if (others.length === 0)
                        {
                            const o = document.createElement("option")
                            o.textContent = "нет других проектов"
                            sel.appendChild(o)
                        }
                        others.forEach(p =>
                        {
                            const o = document.createElement("option")
                            o.value = p.id_project
                            o.textContent = `#${p.id_project} ${p.project_name || ""}`.trim()
                            sel.appendChild(o)
                        })

                        const okBtn = document.createElement("button")
                        okBtn.classList.add("btn", "btn-sm", "btn-primary")
                        okBtn.textContent = "Импортировать"

                        const cancelBtn = document.createElement("button")
                        cancelBtn.classList.add("btn", "btn-sm", "btn-outline-secondary")
                        cancelBtn.textContent = "Отмена"
                        cancelBtn.addEventListener("click", () => picker.remove())

                        okBtn.addEventListener("click", () =>
                        {
                            const srcId = sel.value
                            if (!srcId) return
                            okBtn.disabled = true
                            fetch(`/get_project_data/${srcId}`, {cache: "no-store"})
                                .then(r => r.json())
                                .then(src =>
                                {
                                    let tpl = src.skeleton_template
                                    if ((!tpl || !(tpl.points || []).length) && Array.isArray(src.channels))
                                    {
                                        const mc = src.channels.find(c => c.main) || src.channels[0]
                                        if (mc && mc.skeleton_template) tpl = mc.skeleton_template
                                    }
                                    if (!tpl || !(tpl.points || []).length)
                                    {
                                        alert("В выбранном проекте нет шаблона скелета.")
                                        okBtn.disabled = false
                                        return
                                    }
                                    const formData = new FormData()
                                    formData.append("json_data", JSON.stringify(tpl))
                                    const url = currentChannel
                                        ? `/set_channel_skeleton_template/${project.id_project}/${encodeURIComponent(currentChannel)}`
                                        : `/set_skeleton_template/${project.id_project}`
                                    return fetch(url, {method: "POST", body: formData})
                                        .then(r => r.json())
                                        .then(resp =>
                                        {
                                            if (resp.result === "ok")
                                            {
                                                if (currentChannel)
                                                {
                                                    const c = channels.find(x => x.name === currentChannel)
                                                    if (c) c.skeleton_template = resp.value
                                                }
                                                else
                                                {
                                                    project.skeleton_template = resp.value
                                                }
                                                picker.remove()
                                                renderFor(currentChannel)   // обновить редактор
                                                alert(`Скелет (${(tpl.points || []).length} точек) импортирован.`)
                                            }
                                            else
                                            {
                                                alert("Ошибка импорта"); okBtn.disabled = false
                                            }
                                        })
                                })
                                .catch(e => { alert("Ошибка импорта: " + e); okBtn.disabled = false })
                        })

                        picker.append(sel, okBtn, cancelBtn)
                        anchorEl.parentNode.insertBefore(picker, anchorEl.nextSibling)
                    })
            }

            const makeImportBtn = () =>
            {
                const b = document.createElement("button")
                b.classList.add("btn", "btn-sm", "btn-outline-secondary", "ms-2")
                b.textContent = "⬇ импорт"
                b.title = "Импортировать шаблон скелета из другого проекта"
                b.addEventListener("click", () => openImportPicker(b))
                return b
            }

            const renderFor = (channelName) =>
            {
                currentChannel = channelName
                let tpl, onSave
                if (channels.length >= 1 && channelName)
                {
                    const ch = channels.find(c => c.name === channelName) || {}
                    tpl = ch.skeleton_template || {points: [], connections: []}
                    onSave = (data) =>
                    {
                        const formData = new FormData()
                        formData.append("json_data", JSON.stringify(data))
                        fetch(`/set_channel_skeleton_template/${project.id_project}/${encodeURIComponent(channelName)}`,
                            {method: "POST", body: formData})
                            .then(r => r.json())
                            .then(resp => { if (resp.result === "ok") { ch.skeleton_template = resp.value } })
                    }
                }
                else
                {
                    tpl = project.skeleton_template || {points: [], connections: []}
                    onSave = (data) =>
                    {
                        const formData = new FormData()
                        formData.append("json_data", JSON.stringify(data))
                        fetch(`/set_skeleton_template/${project.id_project}`, {method: "POST", body: formData})
                            .then(r => r.json())
                            .then(resp => { if (resp.result === "ok") { project.skeleton_template = resp.value } })
                    }
                }
                renderSkeletonEditor(editorDiv, tpl, onSave)
            }

            if (channels.length >= 1)
            {
                const bar = document.createElement("div")
                bar.style.cssText = "margin-bottom:8px;text-align:left;"
                const lbl = document.createElement("label")
                lbl.textContent = "Шаблон канала: "
                lbl.classList.add("me-2")
                const sel = document.createElement("select")
                sel.classList.add("form-select", "form-select-sm", "d-inline-block")
                sel.style.width = "200px"
                for (const ch of channels)
                {
                    const o = document.createElement("option")
                    o.value = ch.name
                    o.textContent = ch.name + (ch.main ? " ★" : "")
                    sel.appendChild(o)
                }
                sel.addEventListener("change", () => renderFor(sel.value))
                bar.append(lbl, sel, makeImportBtn())
                skeletonDiv.appendChild(bar)
                skeletonDiv.appendChild(editorDiv)
                renderFor(sel.value)
            }
            else
            {
                const bar = document.createElement("div")
                bar.style.cssText = "margin-bottom:8px;text-align:left;"
                bar.appendChild(makeImportBtn())
                skeletonDiv.appendChild(bar)
                skeletonDiv.appendChild(editorDiv)
                renderFor(null)
            }
        })
    })
}
