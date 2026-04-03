import {request} from "./api.js"
import {addEventListenerWithId, removeEventListenerWithId} from "./events.js"
import {setValueListener, hideLabelButtons, blockButtonsFunction, getInitialSliderValue, setSliderValue, toPercentage} from "./ui.js"
import {
    getPngCanvas, getVectorCanvas, clearCanvas, activateCanvas, setPngCanvasUnsaved,
    updateCanvasZoom, overlayMaskOnImage, getMouseCoordinatesCanvas, paintCircle, eraseCircle
} from "./canvas.js"
import {renderVectorData, getRectangleHandles, pointInRect, resizeRectangle} from "./vector.js"
import {
    getActiveLabel, getColor, activateLabel, checkUnsaveAndSave, saveLabelData, predictObjects
} from "./labels.js"
import {createSkeletonTab, initSkeletonTabHandler} from "./skeletonTab.js"
import {setupSkeletonMode} from "./skeletonTools.js"

export function updateProject(idProject)
{
    request(`get_project_data/${idProject}`, null, (responseJson) =>
    {
        updateProjects({projects: [responseJson]})
    })
}

export function updateProjects(responseJson, clear)
{
    const projectsContainer = document.getElementById("projects-container")

    if (clear)
    {
        projectsContainer.innerHTML = ""
    }

    for (const project of responseJson.projects)
    {
        const projectId = `project_${project.id_project}`
        const oldProjectDiv = document.getElementById(projectId)
        const projectDiv = oldProjectDiv == null ? document.createElement("div") : oldProjectDiv
        const imagesWidth = project.images_width.toString() + "px"

        if (oldProjectDiv == null)
        {
            projectDiv.id = projectId
            projectDiv.classList.add("mb-3")
        }
        else
        {
            projectDiv.innerHTML = ""
        }

        const projectCard = document.createElement("div")
        projectCard.classList.add("project-card")

        const projectCardBody = document.createElement("div")
        projectCardBody.classList.add("card-body")

        const projectUuid = document.createElement("small")
        projectUuid.textContent = project.id

        const projectNameInput = document.createElement("input")
        projectNameInput.type = "text"
        projectNameInput.value = project.hasOwnProperty("project_name") ? project.project_name : ""
        projectNameInput.placeholder = "Please enter project name"
        projectNameInput.classList.add("form-control", "project-name")

        setValueListener(projectNameInput, "set_project_name", "project_name", {id_project: project.id_project})

        const imagesCount = document.createElement("p")
        imagesCount.textContent = "Images count: "

        const imagesCountSpan = document.createElement("span")
        imagesCountSpan.textContent = project.images_count

        imagesCount.appendChild(imagesCountSpan)

        const projectButtons = document.createElement("ul")
        projectButtons.classList.add("nav", "project-tabs", "mt-3")

        const imagesLi = document.createElement("li")
        imagesLi.classList.add("nav-item")
        const imagesButton = document.createElement("a")
        imagesButton.classList.add("nav-link")
        imagesButton.href = "#"
        imagesButton.textContent = "Images"
        imagesLi.appendChild(imagesButton)

        const labelsLi = document.createElement("li")
        labelsLi.classList.add("nav-item")
        const labelsButton = document.createElement("a")
        labelsButton.classList.add("nav-link")
        labelsButton.href = "#"
        labelsButton.textContent = "Labels"
        labelsLi.appendChild(labelsButton)

        const settingsLi = document.createElement("li")
        settingsLi.classList.add("nav-item")
        const settingsButton = document.createElement("a")
        settingsButton.classList.add("nav-link")
        settingsButton.href = "#"
        settingsButton.textContent = "Settings"
        settingsLi.appendChild(settingsButton)

        const skeletonTab = createSkeletonTab(project)
        const skeletonLi = skeletonTab.li
        const skeletonButton = skeletonTab.button
        const skeletonDiv = skeletonTab.div

        const tabContentWrapper = document.createElement("div")
        tabContentWrapper.classList.add("project-tab-content")
        tabContentWrapper.style.display = "none"

        const imagesDiv = document.createElement("div")
        imagesDiv.classList.add("container-fluid", "p-0")
        imagesDiv.id = "project-images"
        imagesDiv.style.display = "none"

        const labelsDiv = document.createElement("div")
        labelsDiv.id = "project-labels"
        labelsDiv.style.display = "none"

        const labelsTextArea = document.createElement("div")
        labelsTextArea.contentEditable = "true"
        labelsTextArea.style.whiteSpace = "pre"
        labelsTextArea.classList.add("form-control", "project-labels")
        labelsTextArea.placeholder = "Enter labels here (Open-Label JSON or LabelStudio XML)"

        if (project.labels)
        {
            labelsTextArea.innerHTML = JSON.stringify(project.labels, null, 2)
        }

        labelsTextArea.style.height = "auto"
        labelsDiv.appendChild(labelsTextArea)

        setValueListener(labelsTextArea, "set_project_labels", "labels", {id_project: project.id_project})

        const settingsDiv = document.createElement("div")
        settingsDiv.classList.add("text-center")
        settingsDiv.id = "project-settings"
        settingsDiv.style.display = "none"

        const projectTypeDiv = document.createElement("div")
        projectTypeDiv.classList.add("mb-3")
        projectTypeDiv.style.textAlign = "left"

        const typeLabel = document.createElement("label")
        typeLabel.textContent = "Project Type: "
        typeLabel.classList.add("form-label", "me-2")

        const typeSelect = document.createElement("select")
        typeSelect.classList.add("form-select", "form-select-sm", "d-inline-block")
        typeSelect.style.width = "200px"

        const optSeg = document.createElement("option")
        optSeg.value = "segmentation"
        optSeg.textContent = "Segmentation"

        const optSkel = document.createElement("option")
        optSkel.value = "yolo-skeleton"
        optSkel.textContent = "YOLO Skeleton"

        typeSelect.appendChild(optSeg)
        typeSelect.appendChild(optSkel)
        typeSelect.value = project.project_type || "segmentation"

        addEventListenerWithId(typeSelect, "change", "project_type_change", () =>
        {
            const formData = new FormData()
            formData.append("id_project", project.id_project)
            formData.append("project_type", typeSelect.value)
            fetch("/set_project_type", {method: "POST", body: formData})
                .then(r => r.json())
                .then(resp =>
                {
                    if (resp.result === "ok")
                    {
                        project.project_type = typeSelect.value
                        skeletonLi.style.display = typeSelect.value === "yolo-skeleton" ? "" : "none"
                        labelsLi.style.display = typeSelect.value === "yolo-skeleton" ? "none" : ""
                        typeSelect.style.borderColor = "green"
                        typeSelect.style.borderWidth = "3px"
                        setTimeout(() =>
                        {
                            typeSelect.style.borderColor = ""
                            typeSelect.style.borderWidth = ""
                        }, 1000)
                    }
                })
        })

        projectTypeDiv.appendChild(typeLabel)
        projectTypeDiv.appendChild(typeSelect)
        settingsDiv.appendChild(projectTypeDiv)

        const predictionUrlInput = document.createElement("input")
        predictionUrlInput.type = "text"
        predictionUrlInput.value = project.hasOwnProperty("prediction_url") ? project.prediction_url : ""
        predictionUrlInput.placeholder = "Please enter prediction url, like https://my-prediction.com/predict/{label}"
        predictionUrlInput.classList.add("form-control", "project-name", "mb-3")

        setValueListener(predictionUrlInput, "set_prediction_url", "prediction_url", {id_project: project.id_project})
        settingsDiv.appendChild(predictionUrlInput)

        const exportButton = document.createElement("button")
        exportButton.classList.add("btn", "btn-outline-primary", "mb-4", "me-2")
        exportButton.textContent = "Export project"

        addEventListenerWithId(exportButton, "click", "export_click", () =>
        {
            exportButton.disabled = true
            exportButton.textContent = "Exporting..."

            fetch(`/export_project/${project.id_project}`)
                .then(r =>
                {
                    if (r.status === 401)
                    {
                        window.location.reload()
                        throw new Error("Not authenticated")
                    }
                    if (!r.ok) throw new Error("Export failed")
                    return r.blob()
                })
                .then(blob =>
                {
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = (project.project_name || `project_${project.id_project}`) + ".zip"
                    a.click()
                    URL.revokeObjectURL(url)
                })
                .catch(err => console.log(err))
                .finally(() =>
                {
                    exportButton.disabled = false
                    exportButton.textContent = "Export project"
                })
        })

        settingsDiv.appendChild(exportButton)

        const recalcButton = document.createElement("button")
        recalcButton.classList.add("btn", "btn-outline-warning", "mb-4", "me-2")
        recalcButton.textContent = "Recalculate previews"

        addEventListenerWithId(recalcButton, "click", "recalculate_previews", () =>
        {
            const overlay = document.createElement("div")
            overlay.classList.add("upload-progress-overlay")

            const panel = document.createElement("div")
            panel.classList.add("upload-progress-panel")

            const title = document.createElement("h5")
            title.textContent = "Пересчёт превью"

            const progressWrapper = document.createElement("div")
            progressWrapper.classList.add("progress")

            const progressBar = document.createElement("div")
            progressBar.classList.add("progress-bar", "progress-bar-striped", "progress-bar-animated")
            progressBar.style.width = "0%"
            progressBar.textContent = "0%"
            progressWrapper.appendChild(progressBar)

            const statusText = document.createElement("div")
            statusText.classList.add("upload-status")
            statusText.textContent = "Запуск..."

            panel.appendChild(title)
            panel.appendChild(progressWrapper)
            panel.appendChild(statusText)
            overlay.appendChild(panel)
            document.body.appendChild(overlay)

            recalcButton.disabled = true

            const eventSource = new EventSource(`/regenerate_previews/${project.id_project}`)

            eventSource.onmessage = (event) =>
            {
                const data = JSON.parse(event.data)

                if (data.done)
                {
                    eventSource.close()
                    progressBar.classList.remove("progress-bar-animated")
                    progressBar.classList.add("bg-success")
                    progressBar.style.width = "100%"
                    progressBar.textContent = "100%"
                    statusText.textContent = `Готово: ${data.total} изображений`
                    recalcButton.disabled = false
                    setTimeout(() => overlay.remove(), 2000)
                }
                else
                {
                    const percent = Math.round((data.current / data.total) * 100)
                    progressBar.style.width = `${percent}%`
                    progressBar.textContent = `${percent}%`
                    statusText.textContent = `${data.current} / ${data.total}: ${data.image}`
                }
            }

            eventSource.onerror = () =>
            {
                eventSource.close()
                progressBar.classList.remove("progress-bar-animated")
                progressBar.classList.add("bg-danger")
                statusText.textContent = "Ошибка при пересчёте"
                recalcButton.disabled = false
                setTimeout(() => overlay.remove(), 3000)
            }
        })

        settingsDiv.appendChild(recalcButton)

        const deleteButton = document.createElement("button")
        deleteButton.classList.add("btn", "btn-danger", "mb-4")
        deleteButton.textContent = "Delete project"

        addEventListenerWithId(deleteButton, "click", "delete_click", () =>
        {
            if (confirm("Are you sure you want to delete this project?"))
            {
                request(`delete_project/${project.id_project}`, null, (resp) =>
                {
                    if (resp.hasOwnProperty("result") && resp["result"] === "ok")
                    {
                        projectDiv.remove()
                    }
                    else
                    {
                        console.log(resp)
                    }
                })
            }
        })

        settingsDiv.appendChild(deleteButton)

        projectCardBody.appendChild(projectUuid)
        projectCardBody.appendChild(projectNameInput)
        projectCardBody.appendChild(imagesCount)
        const isYoloSkeleton = (project.project_type || "segmentation") === "yolo-skeleton"
        labelsLi.style.display = isYoloSkeleton ? "none" : ""

        projectButtons.appendChild(imagesLi)
        projectButtons.appendChild(settingsLi)
        projectButtons.appendChild(labelsLi)
        projectButtons.appendChild(skeletonLi)
        tabContentWrapper.appendChild(imagesDiv)
        tabContentWrapper.appendChild(labelsDiv)
        tabContentWrapper.appendChild(settingsDiv)
        tabContentWrapper.appendChild(skeletonDiv)
        projectCard.appendChild(projectCardBody)
        projectCard.appendChild(projectButtons)
        projectCard.appendChild(tabContentWrapper)
        projectDiv.appendChild(projectCard)
        projectsContainer.appendChild(projectDiv)

        const tabMap = [
            {button: imagesButton, div: imagesDiv},
            {button: labelsButton, div: labelsDiv},
            {button: settingsButton, div: settingsDiv},
            {button: skeletonButton, div: skeletonDiv}
        ]

        const showContent = (currentBlock, onFirstOpen = null, onOpen = null) =>
        {
            const isOpen = currentBlock.style.display === "block"

            imagesDiv.style.display = "none"
            labelsDiv.style.display = "none"
            settingsDiv.style.display = "none"
            skeletonDiv.style.display = "none"

            tabMap.forEach(t => t.button.classList.remove("active"))

            if (!isOpen)
            {
                if (!currentBlock.hasAttribute("opened"))
                {
                    currentBlock.setAttribute("opened", "true")
                    if (typeof onFirstOpen === "function")
                    {
                        onFirstOpen()
                    }
                }

                if (typeof onOpen === "function")
                {
                    onOpen()
                }

                currentBlock.style.display = "block"
                tabContentWrapper.style.display = "block"

                const activeTab = tabMap.find(t => t.div === currentBlock)
                if (activeTab) activeTab.button.classList.add("active")
            }
            else
            {
                tabContentWrapper.style.display = "none"
            }
        }

        // Overlay toggle state for skeleton SVG on tiles
        let showSkeletonOverlay = false
        const svgOverlays = []

        function updateAllSvgOverlays()
        {
            for (const ov of svgOverlays)
            {
                ov.style.display = showSkeletonOverlay ? "block" : "none"
            }
        }

        // Add overlay checkbox next to Images tab text
        const overlayCheckLabel = document.createElement("label")
        overlayCheckLabel.classList.add("form-check", "form-check-inline", "mb-0", "ms-2")
        overlayCheckLabel.style.fontSize = "11px"
        overlayCheckLabel.style.verticalAlign = "middle"
        const overlayCheck = document.createElement("input")
        overlayCheck.type = "checkbox"
        overlayCheck.classList.add("form-check-input")
        overlayCheck.style.marginTop = "0"
        overlayCheck.checked = false
        overlayCheck.addEventListener("change", () =>
        {
            showSkeletonOverlay = overlayCheck.checked
            updateAllSvgOverlays()
        })
        const overlayCheckText = document.createElement("span")
        overlayCheckText.classList.add("form-check-label")
        overlayCheckText.textContent = "Overlay"
        overlayCheckText.style.fontSize = "11px"
        overlayCheckLabel.appendChild(overlayCheck)
        overlayCheckLabel.appendChild(overlayCheckText)
        if (isYoloSkeleton)
        {
            imagesLi.appendChild(overlayCheckLabel)
        }

        addEventListenerWithId(imagesButton, "click", "show_images", (e) => {
            e.preventDefault()
            showContent(
                imagesDiv,
                () =>
                    request(
                        `get_images_list/${project.id_project}`,
                        null,
                        (respJson) =>
                        {
                            imagesDiv.innerHTML = ""

                            const imagesListDiv = document.createElement("div")
                            imagesListDiv.style.display = "flex"
                            imagesListDiv.style.flexWrap = "wrap"
                            imagesListDiv.style.gap = "0.5rem"

                            const previewFile = respJson.hasOwnProperty("preview_file") ? respJson.preview_file : null

                            const prepareImage = (imageObject, imageData, pf) =>
                            {
                                imageObject.style.backgroundImage = `url(${pf})`
                                imageObject.style.backgroundPosition = `0px -${imageData.accumulated_height}px`
                                imageObject.style.backgroundRepeat = "no-repeat"
                                imageObject.style.height = `${imageData.preview_height}px`
                                imageObject.style.width = imagesWidth
                                imageObject.style.marginTop = "2.5pt"
                                imageObject.style.marginLeft = "2.5pt"
                                imageObject.style.border = "none"
                            }

                            let lastZoomLevel = 100
                            let lastActiveTool = null
                            let lastActiveLabel = null

                            const addImage = (imageVariable, previewFileVariable) =>
                            {
                                const image = imageVariable
                                const pf = previewFileVariable
                                const imageCardDiv = document.createElement("div")
                                imageCardDiv.classList.add("image-tile-card")
                                imageCardDiv.style.width = `calc(${imagesWidth} + 6.5pt)`
                                imageCardDiv.style.display = "inline-block"
                                imageCardDiv.style.verticalAlign = "top"

                                const imageBlock = document.createElement("div")
                                imageBlock.style.position = "relative"
                                prepareImage(imageBlock, image, pf)
                                imageBlock.classList.add("card-img-top")

                                // Annotation chip
                                if (image.has_skeleton)
                                {
                                    const chip = document.createElement("span")
                                    chip.textContent = "\u2713"
                                    chip.style.cssText = "position:absolute;top:4px;right:4px;background:#28a745;color:#fff;font-size:10px;font-weight:bold;padding:1px 6px;border-radius:10px;z-index:2;pointer-events:none;"
                                    imageBlock.appendChild(chip)

                                    // SVG overlay
                                    const svgOverlay = document.createElement("img")
                                    svgOverlay.src = `/get_skeleton_svg/${project.id_project}/${encodeURIComponent(image.image)}`
                                    svgOverlay.style.cssText = "position:absolute;top:2.5pt;left:2.5pt;width:100%;height:100%;pointer-events:none;z-index:1;object-fit:fill;"
                                    svgOverlay.style.display = showSkeletonOverlay ? "block" : "none"
                                    imageBlock.appendChild(svgOverlay)
                                    svgOverlays.push(svgOverlay)
                                }

                                const imageCardBody = document.createElement("div")
                                imageCardBody.classList.add("card-body")

                                const imageTitle = document.createElement("div")
                                imageTitle.classList.add("card-title", "d-flex", "justify-content-between", "align-items-center")
                                imageTitle.textContent = image.image
                                imageTitle.style.width = "100%"

                                const imageTime = document.createElement("div")
                                imageTime.classList.add("card-text")
                                imageTime.textContent = image.time

                                const imgDeleteBtn = document.createElement("button")
                                imgDeleteBtn.classList.add("btn", "btn-sm")
                                imgDeleteBtn.innerHTML = "\uD83D\uDDD1\uFE0F"

                                addEventListenerWithId(imgDeleteBtn, "click", "delete_image", () =>
                                {
                                    if (confirm("Are you sure you want to delete this image?"))
                                    {
                                        request(
                                            "delete_image",
                                            {id_project: project.id_project, image_name: image.image},
                                            (response) =>
                                            {
                                                if (response.hasOwnProperty("result") && response.result === "ok")
                                                {
                                                    imageCardDiv.remove()
                                                    imagesCountSpan.innerHTML = Math.max(parseInt(imagesCountSpan.innerHTML) - 1, 0).toString()
                                                }
                                                else
                                                {
                                                    console.warn(response)
                                                }
                                            },
                                            null,
                                            true,
                                            imgDeleteBtn
                                        )
                                    }
                                })

                                imageTime.appendChild(imgDeleteBtn)

                                imageCardBody.appendChild(imageTitle)
                                imageCardBody.appendChild(imageTime)
                                imageCardDiv.appendChild(imageBlock)
                                imageCardDiv.appendChild(imageCardBody)
                                imagesListDiv.appendChild(imageCardDiv)

                                addEventListenerWithId(imageBlock, "click", "show_full_image", () =>
                                {
                                    if (imageCardDiv.classList.contains("expanded"))
                                    {
                                        return
                                    }

                                    imageCardDiv.classList.add("expanded")
                                    imageCardDiv.style.width = "100%"
                                    imageCardDiv.style.marginRight = "0"
                                    imageCardDiv.style.position = "relative"

                                    imageBlock.innerHTML = ""
                                    imageBlock.style.backgroundImage = "none"
                                    imageBlock.style.height = "auto"
                                    imageBlock.style.width = "100%"
                                    imageBlock.style.margin = "0"
                                    imageBlock.style.border = "1px solid #ccc"

                                    const fullImageContainer = document.createElement("div")
                                    fullImageContainer.style.width = "100%"
                                    fullImageContainer.style.height = "auto"
                                    fullImageContainer.style.maxHeight = "80vh"
                                    fullImageContainer.style.overflow = "auto"
                                    fullImageContainer.style.position = "relative"

                                    const fullImage = document.createElement("img")
                                    fullImage.src = `/image/${project.id_project}/${image.image}`
                                    fullImage.style.width = "100%"
                                    fullImage.style.height = "auto"
                                    fullImage.zoom_level = lastZoomLevel

                                    if (lastZoomLevel !== 100)
                                    {
                                        const applyInitialZoom = () =>
                                        {
                                            fullImage.style.width = lastZoomLevel + "%"
                                            const canvases = imageBlock.querySelectorAll("canvas")
                                            for (const canvas of canvases)
                                            {
                                                updateCanvasZoom(fullImage, canvas)
                                            }
                                        }
                                        if (fullImage.complete && fullImage.naturalWidth > 0)
                                        {
                                            requestAnimationFrame(applyInitialZoom)
                                        }
                                        else
                                        {
                                            fullImage.addEventListener("load", () => requestAnimationFrame(applyInitialZoom), {once: true})
                                        }
                                    }

                                    fullImageContainer.appendChild(fullImage)
                                    imageBlock.appendChild(fullImageContainer)

                                    const toolbar = document.createElement("div")
                                    toolbar.classList.add("toolbar")
                                    toolbar.style.display = "flex"
                                    toolbar.style.flexWrap = "wrap"
                                    toolbar.style.justifyContent = "flex-start"
                                    toolbar.style.alignItems = "center"
                                    toolbar.style.padding = "5px"
                                    toolbar.style.backgroundColor = "#f5f5f5"
                                    toolbar.style.borderTop = "1px solid #ccc"

                                    const buttons = []

                                    const blockButtons = (currentButton, currentListenerId = null, onUnset = () =>
                                    {
                                    }) =>
                                        blockButtonsFunction(buttons, currentButton, currentListenerId, onUnset)

                                    const zoomInButton = document.createElement("button")
                                    zoomInButton.classList.add("btn", "btn-sm", "btn-secondary", "me-1")
                                    zoomInButton.textContent = "\uD83D\uDD0D\uFE0F\u2795"

                                    const zoomOutButton = document.createElement("button")
                                    zoomOutButton.classList.add("btn", "btn-sm", "btn-secondary", "me-4")
                                    zoomOutButton.textContent = "\uD83D\uDD0D\uFE0F\u2796"

                                    const projectType = project.project_type || "segmentation"
                                    let skeletonCleanup = null

                                    const saveButton = document.createElement("button")
                                    saveButton.classList.add("btn", "btn-sm", "btn-secondary", "ms-3")
                                    saveButton.textContent = "\uD83D\uDCBE"
                                    saveButton.disabled = true
                                    saveButton.title = "Auto-save enabled"

                                    // --- Close ---
                                    const closeButtonEl = document.createElement("button")
                                    closeButtonEl.classList.add("btn", "btn-sm")
                                    closeButtonEl.textContent = "\u2716"
                                    addEventListenerWithId(closeButtonEl, "click", "close_full_image", () =>
                                    {
                                        if (skeletonCleanup) skeletonCleanup()
                                        blockButtons(null)

                                        lastZoomLevel = fullImage.zoom_level
                                        fullImage.zoom_level = 100
                                        fullImage.style.width = "100%"

                                        imageCardDiv.classList.remove("expanded")
                                        imageCardDiv.style.width = `calc(${imagesWidth} + 6.5pt)`
                                        imageCardDiv.style.marginRight = "2.5pt"
                                        prepareImage(imageBlock, image, pf)
                                        imageBlock.style.cursor = "pointer"
                                        imageBlock.innerHTML = ""
                                        toolbar.remove()

                                        // Restore annotation chip and SVG overlay
                                        if (image.has_skeleton)
                                        {
                                            const chip = document.createElement("span")
                                            chip.textContent = "\u2713"
                                            chip.style.cssText = "position:absolute;top:4px;right:4px;background:#28a745;color:#fff;font-size:10px;font-weight:bold;padding:1px 6px;border-radius:10px;z-index:2;pointer-events:none;"
                                            imageBlock.appendChild(chip)

                                            const svgOverlay = document.createElement("img")
                                            svgOverlay.src = `/get_skeleton_svg/${project.id_project}/${encodeURIComponent(image.image)}?t=${Date.now()}`
                                            svgOverlay.style.cssText = "position:absolute;top:2.5pt;left:2.5pt;width:100%;height:100%;pointer-events:none;z-index:1;object-fit:fill;"
                                            svgOverlay.style.display = showSkeletonOverlay ? "block" : "none"
                                            imageBlock.appendChild(svgOverlay)
                                            svgOverlays.push(svgOverlay)
                                        }
                                    })

                                    // --- Prev / Next image navigation ---
                                    const navigateImage = (direction) =>
                                    {
                                        const currentZoom = fullImage.zoom_level
                                        const currentLabel = lastActiveLabel
                                        const currentTool = lastActiveTool
                                        let target = direction === "next"
                                            ? imageCardDiv.nextElementSibling
                                            : imageCardDiv.previousElementSibling
                                        while (target && !target.classList.contains("image-tile-card"))
                                        {
                                            target = direction === "next"
                                                ? target.nextElementSibling
                                                : target.previousElementSibling
                                        }
                                        if (!target) return

                                        closeButtonEl.click()

                                        const targetImageBlock = target.querySelector(".card-img-top")
                                        if (!targetImageBlock) return
                                        targetImageBlock.click()

                                        if (currentZoom !== 100)
                                        {
                                            const newImg = target.querySelector(".card-img-top img")
                                            if (newImg)
                                            {
                                                const applyZoom = () =>
                                                {
                                                    newImg.zoom_level = currentZoom
                                                    newImg.style.width = currentZoom + "%"
                                                    const canvases = target.querySelector(".card-img-top").querySelectorAll("canvas")
                                                    for (const canvas of canvases)
                                                    {
                                                        updateCanvasZoom(newImg, canvas)
                                                    }
                                                }
                                                if (newImg.complete && newImg.naturalWidth > 0)
                                                {
                                                    requestAnimationFrame(applyZoom)
                                                }
                                                else
                                                {
                                                    newImg.addEventListener("load", () => requestAnimationFrame(applyZoom), {once: true})
                                                }
                                            }
                                        }

                                        // Restore active label and tool
                                        if (currentLabel)
                                        {
                                            const newToolbar = target.querySelector(".toolbar")
                                            if (newToolbar)
                                            {
                                                const newLabelBtn = newToolbar.querySelector(`button[label="${currentLabel}"]`)
                                                if (newLabelBtn)
                                                {
                                                    newLabelBtn.click()
                                                    if (currentTool)
                                                    {
                                                        const newToolBtn = newToolbar.querySelector(`button[data-tool-id="${currentTool}"]`)
                                                        if (newToolBtn) newToolBtn.click()
                                                    }
                                                }
                                            }
                                        }

                                        target.scrollIntoView({behavior: "smooth", block: "start"})
                                    }

                                    const prevImageBtn = document.createElement("button")
                                    prevImageBtn.classList.add("btn", "btn-sm", "btn-secondary", "ms-auto", "me-1")
                                    prevImageBtn.textContent = "\u2190"
                                    prevImageBtn.title = "Previous image"
                                    addEventListenerWithId(prevImageBtn, "click", "prev_image", () => navigateImage("prev"))

                                    const nextImageBtn = document.createElement("button")
                                    nextImageBtn.classList.add("btn", "btn-sm", "btn-secondary", "me-1")
                                    nextImageBtn.textContent = "\u2192"
                                    nextImageBtn.title = "Next image"
                                    addEventListenerWithId(nextImageBtn, "click", "next_image", () => navigateImage("next"))

                                    if (projectType === "yolo-skeleton")
                                    {
                                        skeletonCleanup = setupSkeletonMode({
                                            project, image, imageBlock, fullImage, fullImageContainer,
                                            imageCardDiv, buttons, zoomInButton, zoomOutButton, saveButton,
                                            prevImageBtn, nextImageBtn,
                                            closeButtonEl, blockButtons, imagesDiv
                                        })
                                    }
                                    else
                                    {
                                        let intervalId = null

                                        const handleSave = () =>
                                        {
                                            if (!imagesDiv || !document.body.contains(imagesDiv))
                                            {
                                                clearInterval(intervalId)
                                            }
                                            else if (imageCardDiv.hasAttribute("active_label"))
                                            {
                                                const label = imageCardDiv.getAttribute("active_label")
                                                if (label !== "")
                                                {
                                                    checkUnsaveAndSave(
                                                        imageBlock,
                                                        saveButton,
                                                        project.id_project,
                                                        image.image,
                                                        label,
                                                        () =>
                                                        {
                                                            saveButton.disabled = true
                                                        },
                                                        (error) =>
                                                        {
                                                            console.warn(error)
                                                        }
                                                    )
                                                }
                                            }
                                        }

                                        addEventListenerWithId(saveButton, "click", "save_masks", handleSave)

                                        const checkAndSave = () =>
                                        {
                                            if (!saveButton.disabled)
                                            {
                                                handleSave()
                                            }
                                        }

                                        intervalId = setInterval(checkAndSave, 15000)

                                        const clearCanvasButton = document.createElement("button")
                                        clearCanvasButton.classList.add("btn", "btn-sm", "btn-secondary", "ms-3")
                                        clearCanvasButton.textContent = "\u238A"
                                        clearCanvasButton.disabled = true
                                        clearCanvasButton.title = "Clear canvas"
                                        addEventListenerWithId(clearCanvasButton, "click", "clear_canvas", () =>
                                        {
                                            const pngCanvas = getPngCanvas(imageBlock, fullImage, fullImageContainer)
                                            if (pngCanvas)
                                            {
                                                clearCanvas(pngCanvas)
                                                setPngCanvasUnsaved(pngCanvas, saveButton, clearCanvasButton)
                                            }
                                        })

                                        // --- Brush ---
                                        const brushButton = document.createElement("button")
                                        brushButton.classList.add("btn", "btn-sm", "btn-secondary", "me-1")
                                        brushButton.innerHTML = "\uD83D\uDD8C\uFE0F"
                                        brushButton.setAttribute("data-tool-id", "brush")
                                        addEventListenerWithId(brushButton, "click", "brush_mode", () =>
                                        {
                                            getActiveLabel(imageCardDiv, (activeLabel) =>
                                            {
                                                const labelColor = getColor(activeLabel, project.labels)
                                                const vectorCanvas = getVectorCanvas(imageBlock, fullImage, fullImageContainer, true)
                                                const pngCanvas = getPngCanvas(imageBlock, fullImage, fullImageContainer, false)

                                                let brushSlider = document.getElementById("brush_slider")

                                                blockButtons(brushButton, "brush_mode", () =>
                                                {
                                                    lastActiveTool = null
                                                    brushSlider.remove()
                                                    hideLabelButtons(labelButtons, activeLabel, false)
                                                    removeEventListenerWithId(pngCanvas, "brush_mouse_down")
                                                    removeEventListenerWithId(pngCanvas, "brush_mouse_move")
                                                    removeEventListenerWithId(pngCanvas, "brush_mouse_up")
                                                })

                                                lastActiveTool = "brush"
                                                hideLabelButtons(labelButtons, activeLabel, true)
                                                activateCanvas(pngCanvas, vectorCanvas, true)

                                                const getMouseCoords = (event) => getMouseCoordinatesCanvas(event, pngCanvas)

                                                if (!brushSlider)
                                                {
                                                    brushSlider = document.createElement("input")
                                                    brushSlider.type = "range"
                                                    brushSlider.min = "1"
                                                    brushSlider.max = "50"
                                                    brushSlider.value = getInitialSliderValue(brushButton, "data-brush-size", "10")
                                                    brushSlider.title = "Brush size"
                                                    brushSlider.id = "brush_slider"
                                                    brushSlider.className = "me-1"
                                                    brushButton.parentNode.insertBefore(brushSlider, brushButton.nextSibling)
                                                }

                                                let isPainting = false
                                                let brushSize = parseInt(brushSlider.value, 10)
                                                brushSlider.addEventListener("input", () =>
                                                {
                                                    brushSize = parseInt(brushSlider.value, 10)
                                                    setSliderValue(brushButton, "data-brush-size", brushSize)
                                                })

                                                const ctx = pngCanvas.getContext("2d")
                                                let prevX = null, prevY = null

                                                addEventListenerWithId(pngCanvas, "mousedown", "brush_mouse_down", (event) =>
                                                {
                                                    const {mouse_x, mouse_y} = getMouseCoords(event)
                                                    isPainting = true
                                                    prevX = mouse_x
                                                    prevY = mouse_y
                                                    paintCircle(ctx, mouse_x, mouse_y, brushSize, labelColor)
                                                })

                                                addEventListenerWithId(pngCanvas, "mousemove", "brush_mouse_move", (event) =>
                                                {
                                                    if (!isPainting)
                                                    {
                                                        return
                                                    }
                                                    const {mouse_x, mouse_y} = getMouseCoords(event)
                                                    paintCircle(ctx, mouse_x, mouse_y, brushSize, labelColor, prevX, prevY)
                                                    prevX = mouse_x
                                                    prevY = mouse_y
                                                })

                                                addEventListenerWithId(pngCanvas, "mouseup", "brush_mouse_up", () =>
                                                {
                                                    isPainting = false
                                                    prevX = null
                                                    prevY = null
                                                    saveLabelData(project.id_project, image.image, activeLabel, imageBlock, () =>
                                                    {
                                                    }, () =>
                                                    {
                                                    }, "png")
                                                })
                                            })
                                        })

                                        // --- Eraser ---
                                        const eraserButton = document.createElement("button")
                                        eraserButton.classList.add("btn", "btn-sm", "btn-secondary", "me-1")
                                        eraserButton.innerHTML = "\uD83E\uDDFD"
                                        eraserButton.setAttribute("data-tool-id", "eraser")
                                        addEventListenerWithId(eraserButton, "click", "eraser_mode", () =>
                                        {
                                            getActiveLabel(imageCardDiv, (activeLabel) =>
                                            {
                                                const vectorCanvas = getVectorCanvas(imageBlock, fullImage, fullImageContainer, true)
                                                const pngCanvas = getPngCanvas(imageBlock, fullImage, fullImageContainer, false)

                                                let eraserSlider = document.getElementById("eraser_slider")

                                                blockButtons(eraserButton, "eraser_mode", () =>
                                                {
                                                    lastActiveTool = null
                                                    eraserSlider.remove()
                                                    hideLabelButtons(labelButtons, activeLabel, false)
                                                    removeEventListenerWithId(pngCanvas, "eraser_mouse_down")
                                                    removeEventListenerWithId(pngCanvas, "eraser_mouse_move")
                                                    removeEventListenerWithId(pngCanvas, "eraser_mouse_up")
                                                })

                                                lastActiveTool = "eraser"
                                                hideLabelButtons(labelButtons, activeLabel, true)
                                                activateCanvas(pngCanvas, vectorCanvas, true)

                                                const getMouseCoords = (event) => getMouseCoordinatesCanvas(event, pngCanvas)

                                                if (!eraserSlider)
                                                {
                                                    eraserSlider = document.createElement("input")
                                                    eraserSlider.type = "range"
                                                    eraserSlider.min = "1"
                                                    eraserSlider.max = "50"
                                                    eraserSlider.value = getInitialSliderValue(eraserButton, "data-eraser-size", "10")
                                                    eraserSlider.title = "Eraser size"
                                                    eraserSlider.id = "eraser_slider"
                                                    eraserSlider.className = "me-1"
                                                    eraserButton.parentNode.insertBefore(eraserSlider, eraserButton.nextSibling)
                                                }

                                                let isErasing = false
                                                let eraserSize = parseInt(eraserSlider.value, 10)
                                                eraserSlider.addEventListener("input", () =>
                                                {
                                                    eraserSize = parseInt(eraserSlider.value, 10)
                                                    setSliderValue(eraserButton, "data-eraser-size", eraserSize)
                                                })

                                                const ctx = pngCanvas.getContext("2d")
                                                let prevX = null, prevY = null

                                                addEventListenerWithId(pngCanvas, "mousedown", "eraser_mouse_down", (event) =>
                                                {
                                                    const {mouse_x, mouse_y} = getMouseCoords(event)
                                                    isErasing = true
                                                    prevX = mouse_x
                                                    prevY = mouse_y
                                                    eraseCircle(ctx, mouse_x, mouse_y, eraserSize)
                                                })

                                                addEventListenerWithId(pngCanvas, "mousemove", "eraser_mouse_move", (event) =>
                                                {
                                                    if (!isErasing)
                                                    {
                                                        return
                                                    }
                                                    const {mouse_x, mouse_y} = getMouseCoords(event)
                                                    eraseCircle(ctx, mouse_x, mouse_y, eraserSize, prevX, prevY)
                                                    prevX = mouse_x
                                                    prevY = mouse_y
                                                })

                                                addEventListenerWithId(pngCanvas, "mouseup", "eraser_mouse_up", () =>
                                                {
                                                    isErasing = false
                                                    prevX = null
                                                    prevY = null
                                                    saveLabelData(project.id_project, image.image, activeLabel, imageBlock, () =>
                                                    {
                                                    }, () =>
                                                    {
                                                    }, "png")
                                                })
                                            })
                                        })

                                        // --- Anti-label ---
                                        const antiLabelButton = document.createElement("button")
                                        antiLabelButton.classList.add("btn", "btn-sm", "btn-secondary", "me-4")
                                        antiLabelButton.innerHTML = "\uD83D\uDEAB"
                                        antiLabelButton.title = "AntiLabel"
                                        antiLabelButton.setAttribute("data-tool-id", "anti-label")
                                        addEventListenerWithId(antiLabelButton, "click", "anti_label_mode", () =>
                                            getActiveLabel(imageCardDiv, (activeLabel) =>
                                            {
                                                const labelColor = getColor(activeLabel, project.labels)
                                                const vectorCanvas = getVectorCanvas(imageBlock, fullImage, fullImageContainer, true)
                                                const pngCanvas = getPngCanvas(imageBlock, fullImage, fullImageContainer, false)

                                                blockButtons(antiLabelButton, "anti_label_mode", () =>
                                                {
                                                    lastActiveTool = null
                                                    removeEventListenerWithId(vectorCanvas, "anti_label_mouse_down")
                                                    removeEventListenerWithId(vectorCanvas, "anti_label_mouse_move")
                                                    removeEventListenerWithId(vectorCanvas, "anti_label_mouse_up")
                                                    removeEventListenerWithId(vectorCanvas, "anti_label_double_click")
                                                })

                                                lastActiveTool = "anti-label"
                                                activateCanvas(pngCanvas, vectorCanvas, false)

                                                if (vectorCanvas)
                                                {
                                                    let isDrawing = false
                                                    let currentRect = null
                                                    let startX = 0, startY = 0
                                                    let vectorData = []

                                                    const saveVectorData = () =>
                                                    {
                                                        if (vectorData.length > 0)
                                                        {
                                                            vectorCanvas.setAttribute("vector_data", JSON.stringify(vectorData))
                                                        }
                                                        else
                                                        {
                                                            vectorCanvas.removeAttribute("vector_data")
                                                        }
                                                        saveLabelData(project.id_project, image.image, activeLabel, imageBlock, () =>
                                                        {
                                                        }, () =>
                                                        {
                                                        }, "vector")
                                                    }

                                                    const getMouseCoords = (event) => getMouseCoordinatesCanvas(event, vectorCanvas)

                                                    const vectorDataJson = vectorCanvas.getAttribute("vector_data")
                                                    if (vectorDataJson)
                                                    {
                                                        vectorData = JSON.parse(vectorDataJson)
                                                    }

                                                    addEventListenerWithId(vectorCanvas, "mousedown", "anti_label_mouse_down", (event) =>
                                                    {
                                                        const {mouse_x, mouse_y} = getMouseCoords(event)

                                                        for (const shape of vectorData)
                                                        {
                                                            if (shape.type === "anti-rectangle")
                                                            {
                                                                const handles = getRectangleHandles(shape)
                                                                for (const handle of handles)
                                                                {
                                                                    if (pointInRect(mouse_x, mouse_y, handle.x, handle.y, handle.size, handle.size))
                                                                    {
                                                                        isDrawing = true
                                                                        currentRect = shape
                                                                        currentRect.resizing = true
                                                                        currentRect.resize_handle = handle.position
                                                                        return
                                                                    }
                                                                }
                                                            }
                                                        }

                                                        for (const shape of vectorData)
                                                        {
                                                            if (shape.type === "anti-rectangle")
                                                            {
                                                                if (pointInRect(mouse_x, mouse_y, shape.x, shape.y, shape.width, shape.height))
                                                                {
                                                                    return
                                                                }
                                                            }
                                                        }

                                                        isDrawing = true
                                                        startX = mouse_x
                                                        startY = mouse_y
                                                        currentRect = {
                                                            type: "anti-rectangle",
                                                            x: startX,
                                                            y: startY,
                                                            width: 0,
                                                            height: 0,
                                                            color: labelColor,
                                                            lineWidth: 2
                                                        }
                                                        vectorData.push(currentRect)
                                                    })

                                                    addEventListenerWithId(vectorCanvas, "mousemove", "anti_label_mouse_move", (event) =>
                                                    {
                                                        if (!isDrawing || !currentRect)
                                                        {
                                                            return
                                                        }
                                                        const {mouse_x, mouse_y} = getMouseCoords(event)

                                                        if (currentRect.resizing)
                                                        {
                                                            resizeRectangle(currentRect, mouse_x, mouse_y)
                                                        }
                                                        else
                                                        {
                                                            currentRect.width = mouse_x - startX
                                                            currentRect.height = mouse_y - startY
                                                        }
                                                        renderVectorData(vectorData, vectorCanvas)
                                                    })

                                                    addEventListenerWithId(vectorCanvas, "mouseup", "anti_label_mouse_up", () =>
                                                    {
                                                        if (isDrawing)
                                                        {
                                                            isDrawing = false
                                                            if (currentRect)
                                                            {
                                                                currentRect.resizing = false
                                                                currentRect.resize_handle = null
                                                                currentRect = null
                                                            }

                                                            vectorData = vectorData.filter((shape) =>
                                                            {
                                                                if (shape.type === "anti-rectangle")
                                                                {
                                                                    return shape.width > 1 && shape.height > 1
                                                                }
                                                                return true
                                                            })

                                                            saveVectorData()
                                                        }
                                                    })

                                                    addEventListenerWithId(vectorCanvas, "dblclick", "anti_label_double_click", (event) =>
                                                    {
                                                        const {mouse_x, mouse_y} = getMouseCoords(event)

                                                        for (let i = 0; i < vectorData.length; i++)
                                                        {
                                                            const shape = vectorData[i]
                                                            if (shape.type === "anti-rectangle")
                                                            {
                                                                if (pointInRect(mouse_x, mouse_y, shape.x, shape.y, shape.width, shape.height))
                                                                {
                                                                    vectorData.splice(i, 1)
                                                                    renderVectorData(vectorData, vectorCanvas)
                                                                    saveVectorData()
                                                                    return
                                                                }
                                                            }
                                                        }
                                                    })
                                                }
                                            })
                                        )

                                        // --- Undo ---
                                        const undoButton = document.createElement("button")
                                        undoButton.classList.add("btn", "btn-sm", "btn-secondary", "me-4")
                                        undoButton.innerHTML = "\u21B6"
                                        undoButton.title = "Undo"
                                        addEventListenerWithId(undoButton, "click", "undo_button", () =>
                                            getActiveLabel(imageCardDiv, (activeLabel) =>
                                            {
                                                blockButtons(null)
                                                const undoUrl = `/undo_png_mask/${project.id_project}/${encodeURIComponent(image.image)}/${encodeURIComponent(activeLabel)}`

                                                fetch(undoUrl, {cache: "no-store"})
                                                    .then((response) =>
                                                    {
                                                        if (!response.ok)
                                                        {
                                                            return response.json().then((err) =>
                                                            {
                                                                throw new Error(err.detail || "Unknown error during Undo operation")
                                                            }).catch(() =>
                                                            {
                                                                throw new Error("Unknown error during Undo operation")
                                                            })
                                                        }
                                                        return response.json()
                                                    })
                                                    .then((data) =>
                                                    {
                                                        if (data.result === "ok")
                                                        {
                                                            clearCanvas(getPngCanvas(imageBlock, fullImage, fullImageContainer))
                                                            activateLabel(
                                                                project.id_project, image.image, activeLabel,
                                                                imageBlock, fullImage, fullImageContainer,
                                                                project.labels, clearCanvasButton,
                                                                () =>
                                                                {
                                                                },
                                                                (error) =>
                                                                {
                                                                    console.warn(error)
                                                                }
                                                            )
                                                        }
                                                        else if (data.result === "no-undo")
                                                        {
                                                            alert(data.message)
                                                        }
                                                        else
                                                        {
                                                            throw new Error(data.message || "Unknown error during Undo operation")
                                                        }
                                                    })
                                                    .catch((error) =>
                                                    {
                                                        console.warn(error.message)
                                                    })
                                            })
                                        )

                                        // --- Label buttons ---
                                        const labelButtons = (project.labels || []).map((labelObject) =>
                                        {
                                            const labelButton = document.createElement("button")
                                            labelButton.classList.add("btn", "btn-sm", "me-1")
                                            labelButton.textContent = labelObject.label.charAt(0)
                                            labelButton.style.backgroundColor = labelObject.color
                                            labelButton.style.color = "#fff"
                                            labelButton.title = labelObject.label
                                            labelButton.setAttribute("label", labelObject.label)

                                            addEventListenerWithId(labelButton, "click", labelObject.label + "_select", () =>
                                            {
                                                blockButtons(null)

                                                const currentActiveLabel = imageCardDiv.getAttribute("active_label")
                                                const newLabel = labelButton.getAttribute("label")

                                                const enableControls = (enabled) =>
                                                {
                                                    labelButtons.forEach((lb) =>
                                                    {
                                                        lb.disabled = !enabled
                                                    })
                                                }

                                                enableControls(false)

                                                checkUnsaveAndSave(imageBlock, saveButton, project.id_project, image.image, currentActiveLabel, () =>
                                                {
                                                    const vc = imageBlock.querySelector("canvas.vector-canvas")
                                                    if (vc)
                                                    {
                                                        vc.remove()
                                                    }

                                                    const pc = getPngCanvas(imageBlock, fullImage, fullImageContainer)
                                                    if (pc)
                                                    {
                                                        pc.remove()
                                                    }

                                                    if (currentActiveLabel === newLabel)
                                                    {
                                                        labelButton.classList.remove("selected-label-button")
                                                        imageCardDiv.removeAttribute("active_label")
                                                        lastActiveLabel = null
                                                        enableControls(true)
                                                    }
                                                    else
                                                    {
                                                        labelButtons.forEach((lb) => lb.classList.remove("selected-label-button"))
                                                        labelButton.classList.add("selected-label-button")
                                                        imageCardDiv.setAttribute("active_label", newLabel)
                                                        lastActiveLabel = newLabel

                                                        activateLabel(
                                                            project.id_project, image.image, newLabel,
                                                            imageBlock, fullImage, fullImageContainer,
                                                            project.labels, clearCanvasButton,
                                                            () => enableControls(true),
                                                            (error) => console.warn(error)
                                                        )
                                                    }
                                                }, (error) => console.warn(error))
                                            })

                                            return labelButton
                                        })

                                        // --- Predict ---
                                        const predictObjectsButton = document.createElement("button")
                                        predictObjectsButton.classList.add("btn", "btn-sm", "btn-secondary", "ms-4", "me-1")
                                        predictObjectsButton.innerHTML = "\uD83E\uDD16"
                                        predictObjectsButton.title = "Predict Objects"
                                        addEventListenerWithId(predictObjectsButton, "click", "predict", () =>
                                            getActiveLabel(imageCardDiv, (activeLabel) =>
                                            {
                                                blockButtons(null)
                                                predictObjects(project, activeLabel, imageCardDiv, imageBlock, fullImage, fullImageContainer, saveButton, clearCanvasButton, null)
                                            })
                                        )

                                        // --- Predict in area ---
                                        const predictRectangleButton = document.createElement("button")
                                        predictRectangleButton.classList.add("btn", "btn-sm", "btn-secondary", "me-1")
                                        predictRectangleButton.innerHTML = "\u25A3"
                                        predictRectangleButton.title = "Predict Objects in Rectangular Area"
                                        addEventListenerWithId(predictRectangleButton, "click", "predict_area", () =>
                                        {
                                            getActiveLabel(imageCardDiv, (activeLabel) =>
                                            {
                                                blockButtons(null)

                                                const pngCanvas = getPngCanvas(imageBlock, fullImage, fullImageContainer)
                                                const vectorCanvas = getVectorCanvas(imageBlock, fullImage, fullImageContainer, true)

                                                if (vectorCanvas)
                                                {
                                                    activateCanvas(pngCanvas, vectorCanvas, false)

                                                    let isDrawing = false
                                                    let startX, startY
                                                    let rect = null
                                                    let predictAreaButton = null
                                                    let closeBtn = null

                                                    function removeRectangleAndButton()
                                                    {
                                                        if (rect)
                                                        {
                                                            fullImageContainer.removeChild(rect)
                                                            rect = null
                                                        }
                                                        if (predictAreaButton)
                                                        {
                                                            fullImageContainer.removeChild(predictAreaButton)
                                                            predictAreaButton = null
                                                        }
                                                        if (closeBtn)
                                                        {
                                                            fullImageContainer.removeChild(closeBtn)
                                                            closeBtn = null
                                                        }
                                                    }

                                                    function removeEventListeners()
                                                    {
                                                        removeEventListenerWithId(vectorCanvas, "predict_area_mouse_down")
                                                        removeEventListenerWithId(vectorCanvas, "predict_area_mouse_move")
                                                        removeEventListenerWithId(vectorCanvas, "predict_area_mouse_up")
                                                        removeEventListenerWithId(document, "predict_area_key_up")
                                                        removeEventListenerWithId(document, "predict_area_finalize")
                                                    }

                                                    addEventListenerWithId(vectorCanvas, "mousedown", "predict_area_mouse_down", (event) =>
                                                    {
                                                        if (predictAreaButton != null || rect != null)
                                                        {
                                                            removeRectangleAndButton()
                                                        }

                                                        isDrawing = true
                                                        const rectBounds = vectorCanvas.getBoundingClientRect()
                                                        startX = event.clientX - rectBounds.left
                                                        startY = event.clientY - rectBounds.top

                                                        rect = document.createElement("div")
                                                        rect.style.position = "absolute"
                                                        rect.style.border = "2px dashed #000"
                                                        rect.style.left = startX + "px"
                                                        rect.style.top = startY + "px"
                                                        fullImageContainer.appendChild(rect)
                                                    })

                                                    addEventListenerWithId(vectorCanvas, "mousemove", "predict_area_mouse_move", (event) =>
                                                    {
                                                        if (!isDrawing)
                                                        {
                                                            return
                                                        }
                                                        const rectBounds = vectorCanvas.getBoundingClientRect()
                                                        const mouseX = event.clientX - rectBounds.left
                                                        const mouseY = event.clientY - rectBounds.top

                                                        const width = mouseX - startX
                                                        const height = mouseY - startY

                                                        rect.style.width = Math.abs(width) + "px"
                                                        rect.style.height = Math.abs(height) + "px"
                                                        rect.style.left = (width < 0 ? mouseX : startX) + "px"
                                                        rect.style.top = (height < 0 ? mouseY : startY) + "px"
                                                        rect.style.zIndex = "500"

                                                        const rectLeft = parseFloat(rect.style.left)
                                                        const rectTop = parseFloat(rect.style.top)

                                                        if (!predictAreaButton)
                                                        {
                                                            predictAreaButton = document.createElement("button")
                                                            predictAreaButton.textContent = "Predict"
                                                            predictAreaButton.style.position = "absolute"
                                                            predictAreaButton.style.left = (rectLeft + 10) + "px"
                                                            predictAreaButton.style.top = (rectTop + 10) + "px"
                                                            predictAreaButton.style.zIndex = "1100"
                                                            fullImageContainer.appendChild(predictAreaButton)

                                                            closeBtn = document.createElement("button")
                                                            closeBtn.textContent = "\u2A09"
                                                            closeBtn.style.position = "absolute"
                                                            closeBtn.style.color = "red"
                                                            closeBtn.style.left = (rectLeft + predictAreaButton.offsetWidth + 20) + "px"
                                                            closeBtn.style.top = (rectTop + 10) + "px"
                                                            closeBtn.style.zIndex = "1100"
                                                            fullImageContainer.appendChild(closeBtn)

                                                            addEventListenerWithId(closeBtn, "click", "close_predict_area", () =>
                                                            {
                                                                removeRectangleAndButton()
                                                            })

                                                            addEventListenerWithId(predictAreaButton, "click", "execute_predict_area", () =>
                                                            {
                                                                const elementArea = rect.getBoundingClientRect()
                                                                const containerArea = imageBlock.getBoundingClientRect()

                                                                const relativeX = elementArea.left - containerArea.left
                                                                const relativeY = elementArea.top - containerArea.top
                                                                const relativeWidth = elementArea.width
                                                                const relativeHeight = elementArea.height

                                                                const cropArea = {
                                                                    x: toPercentage(relativeX, containerArea.width),
                                                                    y: toPercentage(relativeY, containerArea.height),
                                                                    width: toPercentage(relativeWidth, containerArea.width),
                                                                    height: toPercentage(relativeHeight, containerArea.height)
                                                                }

                                                                removeEventListeners()

                                                                predictObjects(
                                                                    project, activeLabel, imageCardDiv, imageBlock, fullImage, fullImageContainer,
                                                                    saveButton, clearCanvasButton, cropArea,
                                                                    () => removeRectangleAndButton()
                                                                )
                                                            })
                                                        }
                                                        else
                                                        {
                                                            predictAreaButton.style.left = (rectLeft + 10) + "px"
                                                            predictAreaButton.style.top = (rectTop + 10) + "px"
                                                            closeBtn.style.left = (rectLeft + predictAreaButton.offsetWidth + 20) + "px"
                                                            closeBtn.style.top = (rectTop + 10) + "px"
                                                        }
                                                    })

                                                    addEventListenerWithId(vectorCanvas, "mouseup", "predict_area_mouse_up", () =>
                                                    {
                                                        if (!isDrawing)
                                                        {
                                                            return
                                                        }
                                                        isDrawing = false
                                                    })

                                                    addEventListenerWithId(document, "keyup", "predict_area_key_up", (event) =>
                                                    {
                                                        if (event.key === "Escape")
                                                        {
                                                            removeRectangleAndButton()
                                                            removeEventListeners()
                                                        }
                                                    })

                                                    setTimeout(() =>
                                                        addEventListenerWithId(document, "click", "predict_area_finalize", (event) =>
                                                        {
                                                            const rectBounds = vectorCanvas.getBoundingClientRect()
                                                            const scrollX = window.scrollX
                                                            const scrollY = window.scrollY

                                                            if (
                                                                event.clientX < rectBounds.left + scrollX ||
                                                                event.clientX > rectBounds.right + scrollX ||
                                                                event.clientY < rectBounds.top + scrollY ||
                                                                event.clientY > rectBounds.bottom + scrollY
                                                            )
                                                            {
                                                                removeRectangleAndButton()
                                                                removeEventListeners()
                                                            }
                                                        }), 0)
                                                }
                                            })
                                        })

                                        buttons.push(
                                            zoomInButton, zoomOutButton,
                                            brushButton, eraserButton, antiLabelButton,
                                            undoButton,
                                            ...labelButtons,
                                            predictObjectsButton, predictRectangleButton,
                                            clearCanvasButton, saveButton,
                                            prevImageBtn, nextImageBtn,
                                            closeButtonEl
                                        )
                                    }

                                    for (const button of buttons)
                                    {
                                        toolbar.appendChild(button)
                                    }

                                    imageCardDiv.appendChild(toolbar)

                                    const zoom = (change) =>
                                    {
                                        fullImage.zoom_level += change
                                        if (fullImage.zoom_level > 1000)
                                        {
                                            fullImage.zoom_level = 1000
                                        }
                                        if (fullImage.zoom_level < 30)
                                        {
                                            fullImage.zoom_level = 30
                                        }

                                        fullImage.style.width = fullImage.zoom_level + "%"

                                        const canvases = imageBlock.querySelectorAll("canvas")
                                        for (const canvas of canvases)
                                        {
                                            updateCanvasZoom(fullImage, canvas)
                                        }

                                        if (fullImage.zoom_level >= 95 && fullImage.zoom_level <= 105)
                                        {
                                            fullImage.zoom_level = 100
                                            fullImage.style.width = "100%"
                                            for (const canvas of canvases)
                                            {
                                                canvas.style.width = "100%"
                                                canvas.style.height = "auto"
                                            }
                                        }

                                        lastZoomLevel = fullImage.zoom_level
                                    }

                                    addEventListenerWithId(zoomInButton, "click", "zoom_in", () => zoom(30))
                                    addEventListenerWithId(zoomOutButton, "click", "zoom_out", () => zoom(-30))
                                })
                            }

                            for (const img of respJson.images)
                            {
                                addImage(img, previewFile)
                            }
                            imagesDiv.style.display = "block"

                            const addImageButton = document.createElement("button")
                            addImageButton.classList.add("btn", "btn-outline-primary", "btn-sm", "mt-2")
                            addImageButton.textContent = "+ Add image"

                            addEventListenerWithId(addImageButton, "click", "add_image", () =>
                            {
                                const input = document.createElement("input")
                                input.type = "file"
                                input.accept = "image/*"
                                input.multiple = true
                                input.style.display = "none"
                                addEventListenerWithId(input, "change", "upload_image", async () =>
                                {
                                    const files = Array.from(input.files)
                                    if (files.length === 0) return

                                    const showProgress = files.length > 5
                                    let overlay = null
                                    let progressBar = null
                                    let statusText = null
                                    let errorsDiv = null

                                    if (showProgress)
                                    {
                                        overlay = document.createElement("div")
                                        overlay.classList.add("upload-progress-overlay")

                                        const panel = document.createElement("div")
                                        panel.classList.add("upload-progress-panel")

                                        const title = document.createElement("h5")
                                        title.textContent = "Загрузка изображений"

                                        const progressWrapper = document.createElement("div")
                                        progressWrapper.classList.add("progress")

                                        progressBar = document.createElement("div")
                                        progressBar.classList.add("progress-bar", "progress-bar-striped", "progress-bar-animated")
                                        progressBar.style.width = "0%"
                                        progressBar.textContent = "0%"
                                        progressWrapper.appendChild(progressBar)

                                        statusText = document.createElement("div")
                                        statusText.classList.add("upload-status")
                                        statusText.textContent = `0 / ${files.length}`

                                        errorsDiv = document.createElement("div")
                                        errorsDiv.classList.add("upload-errors")

                                        panel.appendChild(title)
                                        panel.appendChild(progressWrapper)
                                        panel.appendChild(statusText)
                                        panel.appendChild(errorsDiv)
                                        overlay.appendChild(panel)
                                        document.body.appendChild(overlay)
                                    }

                                    let uploaded = 0
                                    const errors = []

                                    for (const file of files)
                                    {
                                        const formData = new FormData()
                                        formData.append("image", file)

                                        try
                                        {
                                            const response = await fetch(`/upload_image/${project.id_project}`, {
                                                method: "POST",
                                                body: formData
                                            })
                                            const answer = await response.json()

                                            if (answer.hasOwnProperty('result') && answer['result'] === 'ok')
                                            {
                                                addImage(answer['image_data'], `${respJson.preview_file}?t=${new Date().getTime()}`)
                                                imagesCountSpan.innerHTML = (parseInt(imagesCountSpan.innerHTML) + 1).toString()
                                            }
                                            else
                                            {
                                                const msg = `${file.name}: ${answer.message || 'error'}`
                                                errors.push(msg)
                                                console.error(msg)
                                            }
                                        }
                                        catch (error)
                                        {
                                            const msg = `${file.name}: ${error}`
                                            errors.push(msg)
                                            console.error('Error uploading image:', error)
                                        }

                                        uploaded++

                                        if (showProgress)
                                        {
                                            const percent = Math.round((uploaded / files.length) * 100)
                                            progressBar.style.width = `${percent}%`
                                            progressBar.textContent = `${percent}%`
                                            statusText.textContent = `${uploaded} / ${files.length}`
                                            errorsDiv.innerHTML = errors.map(e => `<div>${e}</div>`).join("")
                                        }
                                    }

                                    if (showProgress && progressBar)
                                    {
                                        statusText.textContent = "Генерация all_previews.png..."
                                        progressBar.style.width = "100%"
                                        progressBar.textContent = "100%"
                                    }

                                    try
                                    {
                                        await fetch(`/rebuild_all_previews/${project.id_project}`)
                                    }
                                    catch (err)
                                    {
                                        console.error("Error rebuilding all_previews:", err)
                                    }

                                    if (overlay)
                                    {
                                        if (errors.length > 0)
                                        {
                                            progressBar.classList.remove("progress-bar-animated")
                                            progressBar.classList.add("bg-warning")
                                            statusText.textContent = `Готово: ${uploaded - errors.length} из ${files.length} (ошибок: ${errors.length})`
                                            setTimeout(() => overlay.remove(), 3000)
                                        }
                                        else
                                        {
                                            overlay.remove()
                                        }
                                    }
                                })
                                input.click()
                            })

                            imagesDiv.appendChild(imagesListDiv)
                            imagesDiv.appendChild(addImageButton)
                        },
                        (errorText) =>
                        {
                            console.log(errorText)
                        }
                    )
            )
        })

        addEventListenerWithId(labelsButton, 'click', 'show_labels', (e) => { e.preventDefault(); showContent(labelsDiv) })
        addEventListenerWithId(settingsButton, 'click', 'show_settings', (e) => { e.preventDefault(); showContent(settingsDiv) })
        initSkeletonTabHandler(skeletonButton, skeletonDiv, showContent, project)
    }
}
