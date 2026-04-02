import {createSkeletonAnnotator} from "./skeleton.js"
import {getVectorCanvas, updateCanvasZoom, getMouseCoordinatesCanvas, paintCircle, eraseCircle} from "./canvas.js"
import {addEventListenerWithId, removeEventListenerWithId} from "./events.js"

const MASK_PAINT_COLOR = "rgb(30, 100, 255)"
const MAX_UNDO = 30
let skeletonClipboard = null

export function setupSkeletonMode(
    {
        project, image, imageBlock, fullImage, fullImageContainer,
        imageCardDiv, buttons, zoomInButton, zoomOutButton, saveButton,
        prevImageBtn, nextImageBtn,
        closeButtonEl, blockButtons, imagesDiv
    }
)
{
    const template = project.skeleton_template || {points: [], connections: []}
    let annotator = null
    let vectorCanvas = null
    let maskCanvas = null
    let maskCtx = null
    let skelUnsaved = false
    let maskUnsaved = false
    let activeTool = "skeleton"

    // --- Unified Undo / Redo ---
    const undoStack = []
    const redoStack = []

    function captureSkeletonState()
    {
        return JSON.parse(JSON.stringify(annotator.getAnnotations()))
    }

    function captureMaskState()
    {
        return maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
    }

    function pushUndo(type)
    {
        const entry = {type}
        if (type === "skeleton")
        {
            entry.data = captureSkeletonState()
        }
        else
        {
            entry.data = captureMaskState()
        }
        undoStack.push(entry)
        if (undoStack.length > MAX_UNDO)
        {
            undoStack.shift()
        }
        redoStack.length = 0
        updateUndoRedoButtons()
    }

    function doUndo()
    {
        if (undoStack.length === 0)
        {
            return
        }
        const entry = undoStack.pop()
        if (entry.type === "skeleton")
        {
            redoStack.push({type: "skeleton", data: captureSkeletonState()})
            annotator.setAnnotations(entry.data)
        }
        else
        {
            redoStack.push({type: "mask", data: captureMaskState()})
            maskCtx.putImageData(entry.data, 0, 0)
        }
        skelUnsaved = true
        maskUnsaved = true
        saveButton.disabled = false
        updateUndoRedoButtons()
    }

    function doRedo()
    {
        if (redoStack.length === 0)
        {
            return
        }
        const entry = redoStack.pop()
        if (entry.type === "skeleton")
        {
            undoStack.push({type: "skeleton", data: captureSkeletonState()})
            annotator.setAnnotations(entry.data)
        }
        else
        {
            undoStack.push({type: "mask", data: captureMaskState()})
            maskCtx.putImageData(entry.data, 0, 0)
        }
        skelUnsaved = true
        maskUnsaved = true
        saveButton.disabled = false
        updateUndoRedoButtons()
    }

    function updateUndoRedoButtons()
    {
        undoBtn.disabled = undoStack.length === 0
        redoBtn.disabled = redoStack.length === 0
    }

    // --- Create toolbar buttons ---
    const addSkelBtn = document.createElement("button")
    addSkelBtn.classList.add("btn", "btn-sm", "btn-secondary", "me-1")
    addSkelBtn.textContent = "+ Skeleton"
    addSkelBtn.title = "Add Skeleton"

    const delSkelBtn = document.createElement("button")
    delSkelBtn.classList.add("btn", "btn-sm", "btn-secondary", "me-1")
    delSkelBtn.textContent = "\u2715 Delete"
    delSkelBtn.title = "Delete Selected Skeleton (or double-click)"

    const copySkelBtn = document.createElement("button")
    copySkelBtn.classList.add("btn", "btn-sm", "btn-secondary", "me-1")
    copySkelBtn.textContent = "Copy"
    copySkelBtn.title = "Copy all skeletons from this image"

    const pasteSkelBtn = document.createElement("button")
    pasteSkelBtn.classList.add("btn", "btn-sm", "btn-secondary", "me-2", "skel-paste-btn")
    pasteSkelBtn.textContent = "Paste"
    pasteSkelBtn.title = "Paste skeletons from clipboard"
    pasteSkelBtn.disabled = !skeletonClipboard

    const brushBtn = document.createElement("button")
    brushBtn.classList.add("btn", "btn-sm", "btn-secondary", "me-1")
    brushBtn.textContent = "\uD83D\uDD8C\uFE0F"
    brushBtn.title = "Brush (mask area to exclude)"

    const eraserBtn = document.createElement("button")
    eraserBtn.classList.add("btn", "btn-sm", "btn-secondary", "me-1")
    eraserBtn.textContent = "\uD83E\uDDFD"
    eraserBtn.title = "Eraser (remove mask)"

    const brushSizeSelect = document.createElement("select")
    brushSizeSelect.classList.add("form-select", "form-select-sm", "me-2")
    brushSizeSelect.style.width = "70px"
    brushSizeSelect.style.display = "none"
    for (const size of [5, 10, 15, 20, 30, 50])
    {
        const opt = document.createElement("option")
        opt.value = size.toString()
        opt.textContent = `${size}px`
        brushSizeSelect.appendChild(opt)
    }
    brushSizeSelect.value = "15"

    const editPointsBtn = document.createElement("button")
    editPointsBtn.classList.add("btn", "btn-sm", "btn-primary", "me-1")
    editPointsBtn.textContent = "\u2726"
    editPointsBtn.title = "Edit skeleton points"

    const sep = document.createElement("span")
    sep.style.width = "8px"
    sep.style.display = "inline-block"

    const undoBtn = document.createElement("button")
    undoBtn.classList.add("btn", "btn-sm", "btn-secondary", "me-1")
    undoBtn.textContent = "\u21B6"
    undoBtn.title = "Undo"
    undoBtn.disabled = true

    const redoBtn = document.createElement("button")
    redoBtn.classList.add("btn", "btn-sm", "btn-secondary", "me-2")
    redoBtn.textContent = "\u21B7"
    redoBtn.title = "Redo"
    redoBtn.disabled = true

    // --- Show names checkbox ---
    const showNamesLabel = document.createElement("label")
    showNamesLabel.classList.add("form-check", "form-check-inline", "mb-0", "ms-1")
    showNamesLabel.style.fontSize = "12px"
    const showNamesCheckbox = document.createElement("input")
    showNamesCheckbox.type = "checkbox"
    showNamesCheckbox.classList.add("form-check-input")
    showNamesCheckbox.checked = false
    showNamesCheckbox.addEventListener("change", () =>
    {
        if (annotator)
        {
            annotator.setShowNames(showNamesCheckbox.checked)
        }
    })
    const showNamesText = document.createElement("span")
    showNamesText.classList.add("form-check-label")
    showNamesText.textContent = "Names"
    showNamesText.style.fontSize = "12px"
    showNamesLabel.appendChild(showNamesCheckbox)
    showNamesLabel.appendChild(showNamesText)

    const skelLabelButtons = (project.labels || []).map((labelObject) =>
    {
        const lb = document.createElement("button")
        lb.classList.add("btn", "btn-sm", "me-1")
        lb.textContent = labelObject.label.charAt(0)
        lb.style.backgroundColor = labelObject.color
        lb.style.color = "#fff"
        lb.title = labelObject.label
        lb.setAttribute("label", labelObject.label)

        addEventListenerWithId(lb, "click", labelObject.label + "_skel_select", () =>
        {
            skelLabelButtons.forEach(b => b.classList.remove("selected-label-button"))
            lb.classList.add("selected-label-button")
            imageCardDiv.setAttribute("active_label", labelObject.label)
            if (annotator)
            {
                annotator.setCurrentLabel(labelObject.label)
            }
        })

        return lb
    })

    buttons.push(
        zoomInButton, zoomOutButton,
        addSkelBtn, delSkelBtn,
        copySkelBtn, pasteSkelBtn,
        editPointsBtn, brushBtn, eraserBtn, brushSizeSelect,
        sep,
        undoBtn, redoBtn,
        showNamesLabel,
        ...skelLabelButtons,
        saveButton,
        prevImageBtn, nextImageBtn,
        closeButtonEl
    )

    // --- Tool switching ---
    function setActiveTool(tool)
    {
        activeTool = tool
        editPointsBtn.classList.toggle("btn-secondary", tool !== "skeleton")
        editPointsBtn.classList.toggle("btn-primary", tool === "skeleton")
        brushBtn.classList.toggle("btn-secondary", tool !== "brush")
        brushBtn.classList.toggle("btn-primary", tool === "brush")
        eraserBtn.classList.toggle("btn-secondary", tool !== "eraser")
        eraserBtn.classList.toggle("btn-primary", tool === "eraser")
        brushSizeSelect.style.display = (tool === "brush" || tool === "eraser") ? "inline-block" : "none"

        if (maskCanvas && vectorCanvas)
        {
            if (tool === "brush" || tool === "eraser")
            {
                maskCanvas.style.pointerEvents = null
                maskCanvas.style.zIndex = "1001"
                maskCanvas.style.cursor = "crosshair"
                vectorCanvas.style.pointerEvents = "none"
            }
            else
            {
                maskCanvas.style.pointerEvents = "none"
                maskCanvas.style.zIndex = "500"
                vectorCanvas.style.pointerEvents = null
                vectorCanvas.style.zIndex = "1000"
            }
        }
    }

    addEventListenerWithId(addSkelBtn, "click", "add_skeleton", () =>
    {
        if (!annotator)
        {
            return
        }
        setActiveTool("skeleton")
        const activeLabel = imageCardDiv.getAttribute("active_label") ||
            (project.labels && project.labels.length > 0 ? project.labels[0].label : "object")
        annotator.addSkeleton(activeLabel)
    })

    addEventListenerWithId(delSkelBtn, "click", "delete_skeleton", () =>
    {
        if (!annotator)
        {
            return
        }
        annotator.deleteSelected()
    })

    addEventListenerWithId(copySkelBtn, "click", "copy_skeleton", () =>
    {
        if (!annotator)
        {
            return
        }
        const annotations = annotator.getAnnotations()
        if (annotations.length === 0)
        {
            return
        }
        skeletonClipboard = JSON.parse(JSON.stringify(annotations))
        document.querySelectorAll(".skel-paste-btn").forEach(btn => btn.disabled = false)
    })

    addEventListenerWithId(pasteSkelBtn, "click", "paste_skeleton", () =>
    {
        if (!annotator || !skeletonClipboard)
        {
            return
        }
        pushUndo("skeleton")
        annotator.setAnnotations(JSON.parse(JSON.stringify(skeletonClipboard)))
        skelUnsaved = true
        saveButton.disabled = false
    })

    addEventListenerWithId(editPointsBtn, "click", "skel_edit_points", () =>
    {
        setActiveTool("skeleton")
    })

    addEventListenerWithId(brushBtn, "click", "skel_brush", () =>
    {
        setActiveTool(activeTool === "brush" ? "skeleton" : "brush")
    })

    addEventListenerWithId(eraserBtn, "click", "skel_eraser", () =>
    {
        setActiveTool(activeTool === "eraser" ? "skeleton" : "eraser")
    })

    addEventListenerWithId(undoBtn, "click", "skel_undo", doUndo)
    addEventListenerWithId(redoBtn, "click", "skel_redo", doRedo)

    // --- Deferred setup (wait for image load) ---
    let cleanupFn = () =>
    {
    }

    const doSetup = () =>
    {
        // Vector canvas for skeletons
        vectorCanvas = getVectorCanvas(imageBlock, fullImage, fullImageContainer, true)
        vectorCanvas.style.pointerEvents = null
        vectorCanvas.style.zIndex = "1000"

        // Mask canvas (semi-transparent overlay)
        maskCanvas = document.createElement("canvas")
        maskCanvas.classList.add("mask-canvas")
        maskCanvas.width = fullImage.naturalWidth
        maskCanvas.height = fullImage.naturalHeight
        maskCanvas.style.position = "absolute"
        maskCanvas.style.top = "0"
        maskCanvas.style.left = "0"
        maskCanvas.style.pointerEvents = "none"
        maskCanvas.style.zIndex = "500"
        maskCanvas.style.opacity = "0.3"
        updateCanvasZoom(fullImage, maskCanvas)
        fullImageContainer.appendChild(maskCanvas)
        maskCtx = maskCanvas.getContext("2d", {willReadFrequently: true})

        // Create annotator
        annotator = createSkeletonAnnotator(
            vectorCanvas, template, project.labels || [],
            () => pushUndo("skeleton"),
            () =>
            {
                skelUnsaved = true
                saveButton.disabled = false
            }
        )

        // Load saved skeletons
        fetch(`/get_skeleton_data/${project.id_project}/${encodeURIComponent(image.image)}`, {cache: "no-store"})
            .then(r => r.json())
            .then(data => annotator.setAnnotations(data.skeletons || []))

        // Load saved mask
        fetch(`/get_skeleton_mask/${project.id_project}/${encodeURIComponent(image.image)}`, {cache: "no-store"})
            .then(r =>
            {
                if (r.ok)
                {
                    return r.blob()
                }
                return null
            })
            .then(blob =>
            {
                if (!blob)
                {
                    return
                }
                const img = new Image()
                img.onload = () =>
                {
                    const tempCanvas = document.createElement("canvas")
                    tempCanvas.width = maskCanvas.width
                    tempCanvas.height = maskCanvas.height
                    const tempCtx = tempCanvas.getContext("2d")
                    tempCtx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height)

                    const imageData = tempCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
                    const data = imageData.data
                    for (let i = 0; i < data.length; i += 4)
                    {
                        if (data[i] > 128)
                        {
                            data[i] = 30
                            data[i + 1] = 100
                            data[i + 2] = 255
                            data[i + 3] = 255
                        }
                        else
                        {
                            data[i + 3] = 0
                        }
                    }
                    maskCtx.putImageData(imageData, 0, 0)
                    URL.revokeObjectURL(img.src)
                }
                img.src = URL.createObjectURL(blob)
            })
            .catch(() =>
            {
            })

        // --- Brush/Eraser mouse handling ---
        let isPainting = false
        let prevMX = null, prevMY = null

        addEventListenerWithId(maskCanvas, "mousedown", "mask_md", (e) =>
        {
            if (activeTool !== "brush" && activeTool !== "eraser")
            {
                return
            }
            pushUndo("mask")
            isPainting = true
            const {mouse_x, mouse_y} = getMouseCoordinatesCanvas(e, maskCanvas)
            prevMX = mouse_x
            prevMY = mouse_y
            const brushSize = parseInt(brushSizeSelect.value, 10)

            if (activeTool === "brush")
            {
                paintCircle(maskCtx, mouse_x, mouse_y, brushSize, MASK_PAINT_COLOR)
            }
            else
            {
                eraseCircle(maskCtx, mouse_x, mouse_y, brushSize)
            }
        })

        addEventListenerWithId(maskCanvas, "mousemove", "mask_mm", (e) =>
        {
            if (!isPainting)
            {
                return
            }
            const {mouse_x, mouse_y} = getMouseCoordinatesCanvas(e, maskCanvas)
            const brushSize = parseInt(brushSizeSelect.value, 10)

            if (activeTool === "brush")
            {
                paintCircle(maskCtx, mouse_x, mouse_y, brushSize, MASK_PAINT_COLOR, prevMX, prevMY)
            }
            else
            {
                eraseCircle(maskCtx, mouse_x, mouse_y, brushSize, prevMX, prevMY)
            }
            prevMX = mouse_x
            prevMY = mouse_y
        })

        addEventListenerWithId(maskCanvas, "mouseup", "mask_mu", () =>
        {
            if (isPainting)
            {
                isPainting = false
                prevMX = null
                prevMY = null
                maskUnsaved = true
                saveButton.disabled = false
            }
        })

        // --- Save functions ---
        const saveSkeleton = () =>
        {
            if (!skelUnsaved)
            {
                return Promise.resolve()
            }
            const data = annotator.getAnnotations()
            const formData = new FormData()
            formData.append("json_data", JSON.stringify(data))
            return fetch(`/upload_skeleton_data/${project.id_project}/${encodeURIComponent(image.image)}`,
                {method: "POST", body: formData})
                .then(r => r.json())
                .then(resp =>
                {
                    if (resp.result === "ok")
                    {
                        skelUnsaved = false
                        image.has_skeleton = data.length > 0
                    }
                })
        }

        const saveMask = () =>
        {
            if (!maskUnsaved)
            {
                return Promise.resolve()
            }
            const tempCanvas = document.createElement("canvas")
            tempCanvas.width = maskCanvas.width
            tempCanvas.height = maskCanvas.height
            const tempCtx = tempCanvas.getContext("2d")

            const imageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
            const data = imageData.data
            for (let i = 0; i < data.length; i += 4)
            {
                if (data[i + 3] > 0)
                {
                    data[i] = 255
                    data[i + 1] = 255
                    data[i + 2] = 255
                    data[i + 3] = 255
                }
                else
                {
                    data[i] = 0
                    data[i + 1] = 0
                    data[i + 2] = 0
                    data[i + 3] = 255
                }
            }
            tempCtx.putImageData(imageData, 0, 0)

            return new Promise(resolve =>
            {
                tempCanvas.toBlob(blob =>
                {
                    const formData = new FormData()
                    formData.append("image", blob, "mask.png")
                    fetch(`/upload_skeleton_mask/${project.id_project}/${encodeURIComponent(image.image)}`,
                        {method: "POST", body: formData})
                        .then(r => r.json())
                        .then(resp =>
                        {
                            if (resp.result === "ok")
                            {
                                maskUnsaved = false
                            }
                            resolve()
                        })
                        .catch(() => resolve())
                }, "image/png")
            })
        }

        const saveAll = () =>
        {
            Promise.all([saveSkeleton(), saveMask()]).then(() =>
            {
                if (!skelUnsaved && !maskUnsaved)
                {
                    saveButton.disabled = true
                }
            })
        }

        addEventListenerWithId(saveButton, "click", "save_masks", saveAll)

        const intervalId = setInterval(() =>
        {
            if (!imagesDiv || !document.body.contains(imagesDiv))
            {
                clearInterval(intervalId)
            }
            else if (skelUnsaved || maskUnsaved)
            {
                saveAll()
            }
        }, 15000)

        cleanupFn = () =>
        {
            annotator.destroy()
            clearInterval(intervalId)
            removeEventListenerWithId(maskCanvas, "mask_md")
            removeEventListenerWithId(maskCanvas, "mask_mm")
            removeEventListenerWithId(maskCanvas, "mask_mu")
            if (maskCanvas && maskCanvas.parentNode)
            {
                maskCanvas.parentNode.removeChild(maskCanvas)
            }
        }
    }

    // Defer setup until image loads (canvas needs naturalWidth/Height)
    if (fullImage.naturalWidth > 0 && fullImage.naturalHeight > 0)
    {
        doSetup()
    }
    else
    {
        fullImage.addEventListener("load", doSetup, {once: true})
    }

    return () => cleanupFn()
}
