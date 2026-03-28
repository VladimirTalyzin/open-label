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
            projectDiv.classList.add("row", "mb-3")
        }
        else
        {
            projectDiv.innerHTML = ""
        }

        const projectCard = document.createElement("div")
        projectCard.classList.add("col-md-12", "card")

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

        const projectButtons = document.createElement("div")
        projectButtons.classList.add("btn-group", "mt-2")

        const imagesButton = document.createElement("button")
        imagesButton.classList.add("btn", "btn-secondary")
        imagesButton.textContent = "Images"

        const labelsButton = document.createElement("button")
        labelsButton.classList.add("btn", "btn-secondary")
        labelsButton.textContent = "Labels"

        const settingsButton = document.createElement("button")
        settingsButton.classList.add("btn", "btn-secondary")
        settingsButton.textContent = "Settings"

        const imagesDiv = document.createElement("div")
        imagesDiv.classList.add("mt-2", "container-fluid")
        imagesDiv.id = "project-images"
        imagesDiv.style.display = "none"

        const labelsDiv = document.createElement("div")
        labelsDiv.classList.add("mt-2", "col-md-12")
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
        settingsDiv.classList.add("mt-2", "col-md-12", "text-center")
        settingsDiv.id = "project-settings"
        settingsDiv.style.display = "none"

        const predictionUrlInput = document.createElement("input")
        predictionUrlInput.type = "text"
        predictionUrlInput.value = project.hasOwnProperty("prediction_url") ? project.prediction_url : ""
        predictionUrlInput.placeholder = "Please enter prediction url, like https://my-prediction.com/predict/{label}"
        predictionUrlInput.classList.add("form-control", "project-name", "mb-3")

        setValueListener(predictionUrlInput, "set_prediction_url", "prediction_url", {id_project: project.id_project})
        settingsDiv.appendChild(predictionUrlInput)

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
        projectButtons.appendChild(imagesButton)
        projectButtons.appendChild(labelsButton)
        projectButtons.appendChild(settingsButton)
        projectCard.appendChild(projectCardBody)
        projectCard.appendChild(projectButtons)
        projectDiv.appendChild(projectCard)
        projectDiv.appendChild(imagesDiv)
        projectDiv.appendChild(labelsDiv)
        projectDiv.appendChild(settingsDiv)
        projectsContainer.appendChild(projectDiv)

        const showContent = (currentBlock, onFirstOpen = null, onOpen = null) =>
        {
            const isOpen = currentBlock.style.display === "block"

            imagesDiv.style.display = "none"
            labelsDiv.style.display = "none"
            settingsDiv.style.display = "none"

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
            }
        }

        addEventListenerWithId(imagesButton, "click", "show_images", () =>
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
                            imagesListDiv.classList.add("row", "container-fluid")

                            const previewFile = respJson.hasOwnProperty("preview_file") ? respJson.preview_file : null

                            const prepareImage = (imageObject, imageData, pf) =>
                            {
                                imageObject.style.backgroundImage = `url(${pf})`
                                imageObject.style.backgroundPosition = `0px -${imageData.accumulated_height}px`
                                imageObject.style.backgroundRepeat = "no-repeat"
                                imageObject.style.height = `${imageData.preview_height}px`
                                imageObject.style.width = imagesWidth
                                imageObject.style.borderRadius = "2.5pt"
                                imageObject.style.marginTop = "2.5pt"
                                imageObject.style.marginLeft = "2.5pt"
                                imageObject.style.border = "none"
                            }

                            const addImage = (imageVariable, previewFileVariable) =>
                            {
                                const image = imageVariable
                                const pf = previewFileVariable
                                const imageCardDiv = document.createElement("div")
                                imageCardDiv.classList.add("card", "mb-2")
                                imageCardDiv.style.width = `calc(${imagesWidth} + 6.5pt)`
                                imageCardDiv.style.marginRight = "2.5pt"

                                const imageBlock = document.createElement("div")
                                prepareImage(imageBlock, image, pf)
                                imageBlock.classList.add("card-img-top")

                                const imageCardBody = document.createElement("div")
                                imageCardBody.classList.add("card-body")
                                imageCardBody.style.paddingLeft = "2.5pt"
                                imageCardBody.style.paddingRight = "0"
                                imageCardBody.style.width = "94%"

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
                                    fullImage.zoom_level = 100

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

                                    const saveButton = document.createElement("button")
                                    saveButton.classList.add("btn", "btn-sm", "btn-secondary", "ms-3")
                                    saveButton.textContent = "\uD83D\uDCBE"
                                    saveButton.disabled = true
                                    saveButton.title = "Auto-save enabled"

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
                                                brushSlider.remove()
                                                hideLabelButtons(labelButtons, activeLabel, false)
                                                removeEventListenerWithId(pngCanvas, "brush_mouse_down")
                                                removeEventListenerWithId(pngCanvas, "brush_mouse_move")
                                                removeEventListenerWithId(pngCanvas, "brush_mouse_up")
                                            })

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
                                    addEventListenerWithId(eraserButton, "click", "eraser_mode", () =>
                                    {
                                        getActiveLabel(imageCardDiv, (activeLabel) =>
                                        {
                                            const vectorCanvas = getVectorCanvas(imageBlock, fullImage, fullImageContainer, true)
                                            const pngCanvas = getPngCanvas(imageBlock, fullImage, fullImageContainer, false)

                                            let eraserSlider = document.getElementById("eraser_slider")

                                            blockButtons(eraserButton, "eraser_mode", () =>
                                            {
                                                eraserSlider.remove()
                                                hideLabelButtons(labelButtons, activeLabel, false)
                                                removeEventListenerWithId(pngCanvas, "eraser_mouse_down")
                                                removeEventListenerWithId(pngCanvas, "eraser_mouse_move")
                                                removeEventListenerWithId(pngCanvas, "eraser_mouse_up")
                                            })

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
                                    addEventListenerWithId(antiLabelButton, "click", "anti_label_mode", () =>
                                        getActiveLabel(imageCardDiv, (activeLabel) =>
                                        {
                                            const labelColor = getColor(activeLabel, project.labels)
                                            const vectorCanvas = getVectorCanvas(imageBlock, fullImage, fullImageContainer, true)
                                            const pngCanvas = getPngCanvas(imageBlock, fullImage, fullImageContainer, false)

                                            blockButtons(antiLabelButton, "anti_label_mode", () =>
                                            {
                                                removeEventListenerWithId(vectorCanvas, "anti_label_mouse_down")
                                                removeEventListenerWithId(vectorCanvas, "anti_label_mouse_move")
                                                removeEventListenerWithId(vectorCanvas, "anti_label_mouse_up")
                                                removeEventListenerWithId(vectorCanvas, "anti_label_double_click")
                                            })

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
                                    const labelButtons = project.labels.map((labelObject) =>
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
                                                    enableControls(true)
                                                }
                                                else
                                                {
                                                    labelButtons.forEach((lb) => lb.classList.remove("selected-label-button"))
                                                    labelButton.classList.add("selected-label-button")
                                                    imageCardDiv.setAttribute("active_label", newLabel)

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

                                    // --- Close ---
                                    const closeButtonEl = document.createElement("button")
                                    closeButtonEl.classList.add("btn", "btn-sm", "ms-auto")
                                    closeButtonEl.textContent = "\u2716"
                                    addEventListenerWithId(closeButtonEl, "click", "close_full_image", () =>
                                    {
                                        blockButtons(null)

                                        fullImage.zoom_level = 100
                                        fullImage.style.width = "100%"

                                        imageCardDiv.classList.remove("expanded")
                                        imageCardDiv.style.width = `calc(${imagesWidth} + 6.5pt)`
                                        imageCardDiv.style.marginRight = "2.5pt"
                                        prepareImage(imageBlock, image, pf)
                                        imageBlock.style.cursor = "pointer"
                                        imageBlock.innerHTML = ""
                                        toolbar.remove()
                                    })

                                    buttons.push(
                                        zoomInButton, zoomOutButton,
                                        brushButton, eraserButton, antiLabelButton,
                                        undoButton,
                                        ...labelButtons,
                                        predictObjectsButton, predictRectangleButton,
                                        clearCanvasButton, saveButton,
                                        closeButtonEl
                                    )

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
                            addImageButton.classList.add("btn", "btn-primary", "mt-3")
                            addImageButton.textContent = "Add image"

                            addEventListenerWithId(addImageButton, "click", "add_image", () =>
                            {
                                const input = document.createElement("input")
                                input.type = "file"
                                input.accept = "image/*"
                                input.style.display = "none"
                                addEventListenerWithId(input, "change", "upload_image", () =>
                                {
                                    const formData = new FormData()
                                    formData.append("image", input.files[0])

                                    fetch(`/upload_image/${project.id_project}`, {
                                        method: "POST",
                                        body: formData
                                    })
                                        .then((response) => response.json())
                                        .then((answer) =>
                                        {
                                            if (answer.hasOwnProperty('result') && answer['result'] === 'ok')
                                            {
                                                addImage(answer['image_data'], `${respJson.preview_file}?t=${new Date().getTime()}`)
                                                imagesCountSpan.innerHTML = (parseInt(imagesCountSpan.innerHTML) + 1).toString()
                                            }
                                            else
                                            {
                                                console.error(answer)
                                            }
                                        })
                                        .catch((error) =>
                                        {
                                            console.error('Error uploading image:', error)
                                        })
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
        )

        addEventListenerWithId(labelsButton, 'click', 'show_labels', () => showContent(labelsDiv))
        addEventListenerWithId(settingsButton, 'click', 'show_settings', () => showContent(settingsDiv))
    }
}
