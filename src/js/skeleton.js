import {addEventListenerWithId, removeEventListenerWithId} from "./events.js"
import {getMouseCoordinatesCanvas} from "./canvas.js"

const EDITOR_WIDTH = 500
const EDITOR_HEIGHT = 400
const POINT_RADIUS_EDITOR = 10
const POINT_RADIUS_ANNOT = 10
const HANDLE_SIZE = 10
const ROTATION_OFFSET = 30
const PAD = 12
const BBOX_MIN_PAD = 2

function getSkeletonBBox(points)
{
    if (!points || points.length === 0)
    {
        return null
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of points)
    {
        if (p.x < minX)
        {
            minX = p.x
        }
        if (p.y < minY)
        {
            minY = p.y
        }
        if (p.x > maxX)
        {
            maxX = p.x
        }
        if (p.y > maxY)
        {
            maxY = p.y
        }
    }
    return {minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY}
}

function dist(x1, y1, x2, y2)
{
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
}

function rotatePoint(px, py, cx, cy, angle)
{
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const dx = px - cx, dy = py - cy
    return {x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos}
}

function getLabelColor(labels, labelName)
{
    if (!labels)
    {
        return "#2196F3"
    }
    const l = labels.find(lb => lb.label === labelName)
    return l ? l.color : "#2196F3"
}

function getBBoxHandles(bbox)
{
    const {minX, minY, maxX, maxY} = bbox
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2
    return [
        {id: "tl", x: minX, y: minY, ax: maxX, ay: maxY, sx: true, sy: true},
        {id: "tr", x: maxX, y: minY, ax: minX, ay: maxY, sx: true, sy: true},
        {id: "bl", x: minX, y: maxY, ax: maxX, ay: minY, sx: true, sy: true},
        {id: "br", x: maxX, y: maxY, ax: minX, ay: minY, sx: true, sy: true},
        {id: "t", x: midX, y: minY, ax: midX, ay: maxY, sx: false, sy: true},
        {id: "b", x: midX, y: maxY, ax: midX, ay: minY, sx: false, sy: true},
        {id: "l", x: minX, y: midY, ax: maxX, ay: midY, sx: true, sy: false},
        {id: "r", x: maxX, y: midY, ax: minX, ay: midY, sx: true, sy: false}
    ]
}

function getAnnotBBox(skel)
{
    const pb = getSkeletonBBox(skel.points)
    if (!pb)
    {
        return null
    }
    const pad = skel.bboxPad || {left: PAD, top: PAD, right: PAD, bottom: PAD}
    return {
        x: pb.minX - pad.left,
        y: pb.minY - pad.top,
        w: Math.max(20, pb.width + pad.left + pad.right),
        h: Math.max(20, pb.height + pad.top + pad.bottom)
    }
}

// ==================== SKELETON TEMPLATE EDITOR ====================

export function renderSkeletonEditor(container, skeletonData, onSave)
{
    container.innerHTML = ""

    let points = skeletonData && skeletonData.points ? skeletonData.points.map(p => ({name: p.name || "", x: p.x, y: p.y})) : []
    let connections = skeletonData && skeletonData.connections ? skeletonData.connections.map(c => [...c]) : []
    let mode = "add_point"
    let connectFirstIdx = null
    let draggingIdx = null
    let showNames = false
    let canvasW = EDITOR_WIDTH
    let canvasH = EDITOR_HEIGHT
    let panX = 0, panY = 0, zoomLevel = 1
    let panning = false, panStartX = 0, panStartY = 0, panStartPanX = 0, panStartPanY = 0

    // --- Undo / Redo ---
    const MAX_HISTORY = 50
    let undoStack = []
    let redoStack = []

    function snapshot()
    {
        undoStack.push({
            points: points.map(p => ({...p})),
            connections: connections.map(c => [...c])
        })
        if (undoStack.length > MAX_HISTORY)
        {
            undoStack.shift()
        }
        redoStack = []
        updateUndoRedoBtns()
    }

    function undo()
    {
        if (undoStack.length === 0)
        {
            return
        }
        redoStack.push({points: points.map(p => ({...p})), connections: connections.map(c => [...c])})
        const state = undoStack.pop()
        points = state.points
        connections = state.connections
        render()
        updatePointList()
        updateUndoRedoBtns()
        debouncedSave()
    }

    function redo()
    {
        if (redoStack.length === 0)
        {
            return
        }
        undoStack.push({points: points.map(p => ({...p})), connections: connections.map(c => [...c])})
        const state = redoStack.pop()
        points = state.points
        connections = state.connections
        render()
        updatePointList()
        updateUndoRedoBtns()
        debouncedSave()
    }

    function updateUndoRedoBtns()
    {
        if (undoBtn)
        {
            undoBtn.disabled = undoStack.length === 0
        }
        if (redoBtn)
        {
            redoBtn.disabled = redoStack.length === 0
        }
    }

    // --- Debounced auto-save ---
    let saveTimer = null

    function debouncedSave()
    {
        if (saveTimer)
        {
            clearTimeout(saveTimer)
        }
        saveTimer = setTimeout(() => onSave({points, connections}), 600)
    }

    function commitAction()
    {
        debouncedSave()
    }

    // --- UI ---
    const wrapper = document.createElement("div")
    wrapper.style.display = "flex"
    wrapper.style.gap = "1rem"
    wrapper.style.flexWrap = "wrap"
    wrapper.style.alignItems = "flex-start"

    const leftPanel = document.createElement("div")

    const toolbar = document.createElement("div")
    toolbar.style.display = "flex"
    toolbar.style.gap = "4px"
    toolbar.style.marginBottom = "8px"
    toolbar.style.flexWrap = "wrap"
    toolbar.style.alignItems = "center"

    const canvas = document.createElement("canvas")
    canvas.width = canvasW
    canvas.height = canvasH
    canvas.style.border = "1px solid #ccc"
    canvas.style.borderRadius = "4px"
    canvas.style.cursor = "crosshair"
    canvas.style.background = "#fafafa"
    canvas.style.display = "block"

    // --- Resize handle ---
    const canvasContainer = document.createElement("div")
    canvasContainer.style.position = "relative"
    canvasContainer.style.display = "inline-block"

    const resizeHandle = document.createElement("div")
    resizeHandle.style.cssText = "position:absolute;right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,#aaa 50%);border-radius:0 0 4px 0;z-index:2"

    let resizing = false
    let resizeStartX = 0, resizeStartY = 0, resizeStartW = 0, resizeStartH = 0

    resizeHandle.addEventListener("mousedown", (e) =>
    {
        e.preventDefault()
        resizing = true
        resizeStartX = e.clientX
        resizeStartY = e.clientY
        resizeStartW = canvasW
        resizeStartH = canvasH
    })

    document.addEventListener("mousemove", (e) =>
    {
        if (!resizing)
        {
            return
        }
        const dx = e.clientX - resizeStartX
        const ratio = canvasH / canvasW
        const newW = Math.max(200, resizeStartW + dx)
        const newH = Math.round(newW * ratio)
        const scaleX = newW / canvasW
        const scaleY = newH / canvasH
        canvasW = newW
        canvasH = newH
        canvas.width = canvasW
        canvas.height = canvasH
        for (const p of points)
        {
            p.x *= scaleX
            p.y *= scaleY
        }
        panX *= scaleX
        panY *= scaleY
        rightPanel.style.maxHeight = (canvasH + 40) + "px"
        render()
    })

    document.addEventListener("mouseup", () =>
    {
        if (resizing)
        {
            resizing = false
            commitAction()
        }
    })

    canvasContainer.appendChild(canvas)
    canvasContainer.appendChild(resizeHandle)

    // --- Right panel ---
    const rightPanel = document.createElement("div")
    rightPanel.style.minWidth = "200px"
    rightPanel.style.maxWidth = "280px"
    rightPanel.style.maxHeight = (canvasH + 40) + "px"
    rightPanel.style.overflowY = "auto"

    const title = document.createElement("h6")
    title.textContent = "Keypoints"
    title.classList.add("mb-2")
    rightPanel.appendChild(title)

    const pointListDiv = document.createElement("div")
    rightPanel.appendChild(pointListDiv)

    // --- Text mode toggle ---
    const textToggleBtn = document.createElement("button")
    textToggleBtn.classList.add("btn", "btn-sm", "btn-outline-secondary", "me-2")
    textToggleBtn.textContent = "\u270E Text"
    textToggleBtn.title = "Switch to text editor"
    toolbar.appendChild(textToggleBtn)

    // --- Toolbar buttons ---
    const tools = [
        {id: "add_point", label: "Add Point", icon: "+"},
        {id: "connect", label: "Connect", icon: "\u2014"},
        {id: "select", label: "Move", icon: "\u2725"},
        {id: "pan", label: "Pan", icon: "\u270B"}
    ]
    const toolBtns = {}

    for (const t of tools)
    {
        const btn = document.createElement("button")
        btn.classList.add("btn", "btn-sm", t.id === mode ? "btn-secondary" : "btn-outline-secondary")
        btn.textContent = `${t.icon} ${t.label}`
        addEventListenerWithId(btn, "click", `skel_tool_${t.id}`, () =>
        {
            mode = t.id
            connectFirstIdx = null
            for (const [id, b] of Object.entries(toolBtns))
            {
                b.classList.toggle("btn-secondary", id === mode)
                b.classList.toggle("btn-outline-secondary", id !== mode)
            }
            const cursors = {add_point: "crosshair", connect: "pointer", select: "grab", pan: "grab"}
            canvas.style.cursor = cursors[mode] || "default"
        })
        toolbar.appendChild(btn)
        toolBtns[t.id] = btn
    }

    // Separator
    const sep1 = document.createElement("span")
    sep1.style.width = "8px"
    toolbar.appendChild(sep1)

    // Undo
    const undoBtn = document.createElement("button")
    undoBtn.classList.add("btn", "btn-sm", "btn-outline-secondary")
    undoBtn.textContent = "\u21B6"
    undoBtn.title = "Undo"
    undoBtn.disabled = true
    addEventListenerWithId(undoBtn, "click", "skel_undo", undo)
    toolbar.appendChild(undoBtn)

    // Redo
    const redoBtn = document.createElement("button")
    redoBtn.classList.add("btn", "btn-sm", "btn-outline-secondary")
    redoBtn.textContent = "\u21B7"
    redoBtn.title = "Redo"
    redoBtn.disabled = true
    addEventListenerWithId(redoBtn, "click", "skel_redo", redo)
    toolbar.appendChild(redoBtn)

    // Separator
    const sep2 = document.createElement("span")
    sep2.style.width = "8px"
    toolbar.appendChild(sep2)

    // Fit to center button
    const fitBtn = document.createElement("button")
    fitBtn.classList.add("btn", "btn-sm", "btn-outline-secondary")
    fitBtn.textContent = "\u2316"
    fitBtn.title = "Fit skeleton to view"
    addEventListenerWithId(fitBtn, "click", "skel_fit", () =>
    {
        fitToCenter()
    })
    toolbar.appendChild(fitBtn)

    // Separator
    const sep3 = document.createElement("span")
    sep3.style.width = "8px"
    toolbar.appendChild(sep3)

    // Show names checkbox
    const namesLabel = document.createElement("label")
    namesLabel.classList.add("form-check", "form-check-inline", "mb-0", "ms-1")
    namesLabel.style.fontSize = "12px"
    const namesCheckbox = document.createElement("input")
    namesCheckbox.type = "checkbox"
    namesCheckbox.classList.add("form-check-input")
    namesCheckbox.checked = showNames
    namesCheckbox.addEventListener("change", () =>
    {
        showNames = namesCheckbox.checked
        render()
    })
    const namesText = document.createElement("span")
    namesText.classList.add("form-check-label")
    namesText.textContent = "Show names"
    namesText.style.fontSize = "12px"
    namesLabel.appendChild(namesCheckbox)
    namesLabel.appendChild(namesText)
    toolbar.appendChild(namesLabel)

    // --- Pan / Zoom ---
    function fitToCenter()
    {
        if (points.length === 0)
        {
            panX = 0
            panY = 0
            zoomLevel = 1
            render()
            return
        }
        const bbox = getSkeletonBBox(points)
        if (!bbox)
        {
            return
        }
        const padding = 40
        const availW = canvasW - padding * 2
        const availH = canvasH - padding * 2
        const scaleX = bbox.width > 0 ? availW / bbox.width : 1
        const scaleY = bbox.height > 0 ? availH / bbox.height : 1
        zoomLevel = Math.min(scaleX, scaleY, 3)
        const cx = bbox.minX + bbox.width / 2
        const cy = bbox.minY + bbox.height / 2
        panX = canvasW / 2 - cx * zoomLevel
        panY = canvasH / 2 - cy * zoomLevel
        render()
    }

    function applyZoom(delta, centerX, centerY)
    {
        const oldZoom = zoomLevel
        const factor = delta > 0 ? 0.9 : 1.1
        zoomLevel = Math.max(0.1, Math.min(10, zoomLevel * factor))
        panX = centerX - (centerX - panX) * (zoomLevel / oldZoom)
        panY = centerY - (centerY - panY) * (zoomLevel / oldZoom)
        render()
    }

    // --- Render ---
    function render()
    {
        const ctx = canvas.getContext("2d")
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        ctx.strokeStyle = "#eee"
        ctx.lineWidth = 0.5
        for (let x = 0; x <= canvas.width; x += 20)
        {
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, canvas.height)
            ctx.stroke()
        }
        for (let y = 0; y <= canvas.height; y += 20)
        {
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(canvas.width, y)
            ctx.stroke()
        }

        ctx.save()
        ctx.translate(panX, panY)
        ctx.scale(zoomLevel, zoomLevel)

        ctx.strokeStyle = "#888"
        ctx.lineWidth = 2 / zoomLevel
        for (const [idx1, idx2] of connections)
        {
            const p1 = points[idx1]
            const p2 = points[idx2]
            if (p1 && p2)
            {
                ctx.beginPath()
                ctx.moveTo(p1.x, p1.y)
                ctx.lineTo(p2.x, p2.y)
                ctx.stroke()
            }
        }

        const r = POINT_RADIUS_EDITOR / zoomLevel
        for (let i = 0; i < points.length; i++)
        {
            const p = points[i]
            ctx.beginPath()
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
            ctx.fillStyle = i === connectFirstIdx ? "#4CAF50" : "#2196F3"
            ctx.fill()
            ctx.strokeStyle = "#fff"
            ctx.lineWidth = 2 / zoomLevel
            ctx.stroke()

            ctx.fillStyle = "#fff"
            ctx.font = `bold ${10 / zoomLevel}px sans-serif`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(i.toString(), p.x, p.y)

            if (showNames && p.name)
            {
                const nameFontSize = Math.max(9, Math.min(18, Math.round(Math.min(canvasW, canvasH) / 30))) / zoomLevel
                ctx.font = `${nameFontSize}px sans-serif`
                ctx.textAlign = "left"
                ctx.textBaseline = "middle"
                const nameX = p.x + r + 4 / zoomLevel
                const nameY = p.y
                const tm = ctx.measureText(p.name)
                const padX = 3 / zoomLevel, padY = 2 / zoomLevel
                ctx.fillStyle = "rgba(255,255,255,0.7)"
                ctx.fillRect(nameX - padX, nameY - nameFontSize / 2 - padY, tm.width + padX * 2, nameFontSize + padY * 2)
                ctx.fillStyle = "#222"
                ctx.fillText(p.name, nameX, nameY)
            }
        }
        ctx.restore()
    }

    function deletePoint(idx)
    {
        snapshot()
        points.splice(idx, 1)
        connections = connections
            .filter(([a, b]) => a !== idx && b !== idx)
            .map(([a, b]) => [a > idx ? a - 1 : a, b > idx ? b - 1 : b])
        render()
        updatePointList()
        commitAction()
    }

    function updatePointList()
    {
        pointListDiv.innerHTML = ""
        for (let i = 0; i < points.length; i++)
        {
            const p = points[i]
            const idx = i

            const row = document.createElement("div")
            row.style.display = "flex"
            row.style.alignItems = "center"
            row.style.gap = "4px"
            row.style.marginBottom = "4px"

            const badge = document.createElement("span")
            badge.classList.add("badge", "bg-primary")
            badge.textContent = i.toString()
            badge.style.minWidth = "24px"
            badge.style.textAlign = "center"

            const input = document.createElement("input")
            input.type = "text"
            input.value = p.name || ""
            input.placeholder = `Point ${i}`
            input.classList.add("form-control", "form-control-sm")
            input.style.width = "120px"

            let nameTimer = null
            input.addEventListener("input", () =>
            {
                p.name = input.value
                render()
                if (nameTimer)
                {
                    clearTimeout(nameTimer)
                }
                nameTimer = setTimeout(() => debouncedSave(), 300)
            })

            const delBtn = document.createElement("button")
            delBtn.classList.add("btn", "btn-sm", "btn-outline-danger", "px-1", "py-0")
            delBtn.textContent = "\u2715"
            delBtn.title = "Delete point"
            delBtn.style.lineHeight = "1"
            delBtn.addEventListener("click", () => deletePoint(idx))

            row.appendChild(badge)
            row.appendChild(input)
            row.appendChild(delBtn)
            pointListDiv.appendChild(row)
        }
    }

    function coords(e)
    {
        const r = canvas.getBoundingClientRect()
        const scaleX = canvas.width / r.width
        const scaleY = canvas.height / r.height
        const cx = (e.clientX - r.left) * scaleX
        const cy = (e.clientY - r.top) * scaleY
        return {x: (cx - panX) / zoomLevel, y: (cy - panY) / zoomLevel}
    }

    function canvasCoords(e)
    {
        const r = canvas.getBoundingClientRect()
        const scaleX = canvas.width / r.width
        const scaleY = canvas.height / r.height
        return {x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY}
    }

    function findAt(x, y)
    {
        const hitR = POINT_RADIUS_EDITOR * 1.5 / zoomLevel
        for (let i = points.length - 1; i >= 0; i--)
        {
            if (dist(points[i].x, points[i].y, x, y) <= hitR)
            {
                return i
            }
        }
        return -1
    }

    addEventListenerWithId(canvas, "mousedown", "skel_ed_md", (e) =>
    {
        const {x, y} = coords(e)
        const foundIdx = findAt(x, y)

        if (mode === "add_point" && foundIdx === -1)
        {
            snapshot()
            points.push({name: "", x: Math.round(x), y: Math.round(y)})
            render()
            updatePointList()
            commitAction()
        }
        else if (mode === "connect" && foundIdx >= 0)
        {
            if (connectFirstIdx === null)
            {
                connectFirstIdx = foundIdx
            }
            else
            {
                if (connectFirstIdx !== foundIdx)
                {
                    snapshot()
                    const ci = connections.findIndex(([a, b]) =>
                        (a === connectFirstIdx && b === foundIdx) || (a === foundIdx && b === connectFirstIdx))
                    if (ci === -1)
                    {
                        connections.push([connectFirstIdx, foundIdx])
                    }
                    else
                    {
                        connections.splice(ci, 1)
                    }
                    commitAction()
                }
                connectFirstIdx = null
            }
            render()
        }
        else if (mode === "connect" && foundIdx === -1)
        {
            connectFirstIdx = null
            render()
        }
        else if (mode === "select" && foundIdx >= 0)
        {
            snapshot()
            draggingIdx = foundIdx
            canvas.style.cursor = "grabbing"
        }
        else if (mode === "pan")
        {
            panning = true
            const cc = canvasCoords(e)
            panStartX = cc.x
            panStartY = cc.y
            panStartPanX = panX
            panStartPanY = panY
            canvas.style.cursor = "grabbing"
        }
    })

    addEventListenerWithId(canvas, "mousemove", "skel_ed_mm", (e) =>
    {
        if (mode === "select" && draggingIdx !== null)
        {
            const {x, y} = coords(e)
            const pt = points[draggingIdx]
            if (pt)
            {
                pt.x = Math.round(x)
                pt.y = Math.round(y)
                render()
            }
        }
        else if (mode === "pan" && panning)
        {
            const cc = canvasCoords(e)
            panX = panStartPanX + (cc.x - panStartX)
            panY = panStartPanY + (cc.y - panStartY)
            render()
        }
    })

    addEventListenerWithId(canvas, "mouseup", "skel_ed_mu", () =>
    {
        if (mode === "select" && draggingIdx !== null)
        {
            draggingIdx = null
            canvas.style.cursor = "grab"
            commitAction()
        }
        if (panning)
        {
            panning = false
            canvas.style.cursor = "grab"
        }
    })

    canvas.addEventListener("wheel", (e) =>
    {
        e.preventDefault()
        const cc = canvasCoords(e)
        applyZoom(e.deltaY, cc.x, cc.y)
    }, {passive: false})

    // --- Text editor ---
    const textArea = document.createElement("textarea")
    textArea.classList.add("form-control")
    textArea.style.display = "none"
    textArea.style.width = "100%"
    textArea.style.minHeight = canvasH + "px"
    textArea.style.fontFamily = "monospace"
    textArea.style.fontSize = "13px"
    textArea.style.whiteSpace = "pre"

    let textMode = false
    addEventListenerWithId(textToggleBtn, "click", "skel_text_toggle", () =>
    {
        textMode = !textMode
        if (textMode)
        {
            canvasContainer.style.display = "none"
            rightPanel.style.display = "none"
            textArea.style.display = "block"
            textArea.value = JSON.stringify({points, connections}, null, 2)
            textToggleBtn.textContent = "\u25A3 Graphic"
            textToggleBtn.classList.replace("btn-outline-secondary", "btn-outline-primary")
            for (const [, b] of Object.entries(toolBtns))
            {
                b.style.display = "none"
            }
            undoBtn.style.display = "none"
            redoBtn.style.display = "none"
            fitBtn.style.display = "none"
            namesLabel.style.display = "none"
        }
        else
        {
            try
            {
                const data = JSON.parse(textArea.value)
                if (Array.isArray(data.points))
                {
                    snapshot()
                    points = data.points.map(p => ({name: p.name || "", x: p.x, y: p.y}))
                    if (Array.isArray(data.connections))
                    {
                        connections = data.connections.map(c => [...c])
                    }
                    commitAction()
                }
            }
            catch (e)
            { /* keep current state */
            }
            canvasContainer.style.display = ""
            rightPanel.style.display = ""
            textArea.style.display = "none"
            textToggleBtn.textContent = "\u270E Text"
            textToggleBtn.classList.replace("btn-outline-primary", "btn-outline-secondary")
            for (const [, b] of Object.entries(toolBtns))
            {
                b.style.display = ""
            }
            undoBtn.style.display = ""
            redoBtn.style.display = ""
            fitBtn.style.display = ""
            namesLabel.style.display = ""
            render()
            updatePointList()
        }
    })

    let textSaveTimer = null
    textArea.addEventListener("input", () =>
    {
        try
        {
            JSON.parse(textArea.value)
            textArea.style.borderColor = ""
            if (textSaveTimer)
            {
                clearTimeout(textSaveTimer)
            }
            textSaveTimer = setTimeout(() =>
            {
                try
                {
                    const data = JSON.parse(textArea.value)
                    if (Array.isArray(data.points) && Array.isArray(data.connections))
                    {
                        points = data.points.map(p => ({name: p.name || "", x: p.x, y: p.y}))
                        connections = data.connections.map(c => [...c])
                        onSave({points, connections})
                    }
                }
                catch (e)
                {
                }
            }, 800)
        }
        catch (e)
        {
            textArea.style.borderColor = "red"
        }
    })

    leftPanel.appendChild(toolbar)
    leftPanel.appendChild(canvasContainer)
    wrapper.appendChild(leftPanel)
    wrapper.appendChild(rightPanel)
    container.appendChild(wrapper)
    container.appendChild(textArea)
    render()
    updatePointList()
}

// ==================== SKELETON ANNOTATOR ====================

function reconcileAnnotationPoints(savedPoints, templatePoints)
{
    if (!templatePoints || templatePoints.length === 0)
    {
        return []
    }
    if (!savedPoints || savedPoints.length === 0)
    {
        return templatePoints.map(tp => ({name: tp.name || "", x: tp.x, y: tp.y, visible: 2}))
    }

    // Build mapping: for each template point, find matching saved point
    const usedSavedIndices = new Set()
    const result = []

    // First pass: match by name
    const savedByName = {}
    for (let si = 0; si < savedPoints.length; si++)
    {
        const name = savedPoints[si].name
        if (name)
        {
            if (!savedByName[name])
            {
                savedByName[name] = []
            }
            savedByName[name].push(si)
        }
    }

    const matched = new Array(templatePoints.length).fill(null)

    for (let ti = 0; ti < templatePoints.length; ti++)
    {
        const tName = templatePoints[ti].name
        if (tName && savedByName[tName] && savedByName[tName].length > 0)
        {
            const si = savedByName[tName].shift()
            matched[ti] = si
            usedSavedIndices.add(si)
        }
    }

    // Second pass: match remaining by index
    for (let ti = 0; ti < templatePoints.length; ti++)
    {
        if (matched[ti] !== null)
        {
            continue
        }
        if (ti < savedPoints.length && !usedSavedIndices.has(ti))
        {
            matched[ti] = ti
            usedSavedIndices.add(ti)
        }
    }

    // Compute transform from template to saved annotation for matched points
    // We use matched points to derive scale + translate
    const matchedPairs = []
    for (let ti = 0; ti < templatePoints.length; ti++)
    {
        if (matched[ti] !== null)
        {
            matchedPairs.push({
                tx: templatePoints[ti].x, ty: templatePoints[ti].y,
                sx: savedPoints[matched[ti]].x, sy: savedPoints[matched[ti]].y
            })
        }
    }

    let offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1
    if (matchedPairs.length >= 2)
    {
        // Compute bounding box of template matched points and saved matched points
        let tMinX = Infinity, tMinY = Infinity, tMaxX = -Infinity, tMaxY = -Infinity
        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity
        for (const mp of matchedPairs)
        {
            tMinX = Math.min(tMinX, mp.tx); tMinY = Math.min(tMinY, mp.ty)
            tMaxX = Math.max(tMaxX, mp.tx); tMaxY = Math.max(tMaxY, mp.ty)
            sMinX = Math.min(sMinX, mp.sx); sMinY = Math.min(sMinY, mp.sy)
            sMaxX = Math.max(sMaxX, mp.sx); sMaxY = Math.max(sMaxY, mp.sy)
        }
        const tW = tMaxX - tMinX, tH = tMaxY - tMinY
        const sW = sMaxX - sMinX, sH = sMaxY - sMinY
        scaleX = tW > 0.01 ? sW / tW : 1
        scaleY = tH > 0.01 ? sH / tH : 1
        const tCX = (tMinX + tMaxX) / 2, tCY = (tMinY + tMaxY) / 2
        const sCX = (sMinX + sMaxX) / 2, sCY = (sMinY + sMaxY) / 2
        offsetX = sCX - tCX * scaleX
        offsetY = sCY - tCY * scaleY
    }
    else if (matchedPairs.length === 1)
    {
        offsetX = matchedPairs[0].sx - matchedPairs[0].tx
        offsetY = matchedPairs[0].sy - matchedPairs[0].ty
    }

    for (let ti = 0; ti < templatePoints.length; ti++)
    {
        if (matched[ti] !== null)
        {
            const sp = savedPoints[matched[ti]]
            result.push({
                name: templatePoints[ti].name || sp.name || "",
                x: sp.x, y: sp.y,
                visible: sp.visible !== undefined ? sp.visible : 2
            })
        }
        else
        {
            // New point: position using computed transform
            result.push({
                name: templatePoints[ti].name || "",
                x: templatePoints[ti].x * scaleX + offsetX,
                y: templatePoints[ti].y * scaleY + offsetY,
                visible: 2
            })
        }
    }

    return result
}

export function createSkeletonAnnotator(canvas, template, labels, onBeforeChange, onChanged)
{
    let annotations = []
    let selectedIdx = -1
    let currentLabel = null
    let dragState = null
    let showNames = false

    const POINT_HIT = 14
    const HANDLE_HIT = 10
    const DEFAULT_PAD = {left: PAD, top: PAD, right: PAD, bottom: PAD}

    function clampSkeleton(skel)
    {
        const cw = canvas.width, ch = canvas.height
        const pb = getSkeletonBBox(skel.points)
        if (!pb) return
        const pad = skel.bboxPad || {left: PAD, top: PAD, right: PAD, bottom: PAD}

        // Clamp padding so bbox doesn't exceed canvas even when points are inside
        pad.left = Math.min(pad.left, pb.minX)
        pad.top = Math.min(pad.top, pb.minY)
        pad.right = Math.min(pad.right, cw - pb.maxX)
        pad.bottom = Math.min(pad.bottom, ch - pb.maxY)

        // Enforce minimum padding
        pad.left = Math.max(BBOX_MIN_PAD, pad.left)
        pad.top = Math.max(BBOX_MIN_PAD, pad.top)
        pad.right = Math.max(BBOX_MIN_PAD, pad.right)
        pad.bottom = Math.max(BBOX_MIN_PAD, pad.bottom)
        skel.bboxPad = pad

        // Recalculate bbox and shift points if bbox is still out of bounds
        const bbox = getAnnotBBox(skel)
        if (!bbox) return
        let dx = 0, dy = 0
        if (bbox.x < 0) dx = -bbox.x
        else if (bbox.x + bbox.w > cw) dx = cw - (bbox.x + bbox.w)
        if (bbox.y < 0) dy = -bbox.y
        else if (bbox.y + bbox.h > ch) dy = ch - (bbox.y + bbox.h)
        if (dx !== 0 || dy !== 0)
        {
            for (const p of skel.points)
            {
                p.x += dx
                p.y += dy
            }
        }
    }

    function clampAllSkeletons()
    {
        for (const skel of annotations)
        {
            clampSkeleton(skel)
        }
    }

    function setAnnotations(data)
    {
        const tplPoints = template && template.points ? template.points : []
        annotations = (data || []).map(a => {
            const savedPts = (a.points || []).map(p => ({name: p.name || "", x: p.x, y: p.y, visible: p.visible !== undefined ? p.visible : 2}))
            const reconciledPts = tplPoints.length > 0 ? reconcileAnnotationPoints(savedPts, tplPoints) : savedPts
            return {
                label: a.label || "object",
                points: reconciledPts,
                bboxPad: a.bboxPad || {...DEFAULT_PAD}
            }
        })
        clampAllSkeletons()
        selectedIdx = -1
        render()
    }

    function getAnnotations()
    {
        return annotations
    }

    function setCurrentLabel(label)
    {
        currentLabel = label
    }

    function setShowNames(val)
    {
        showNames = val
        render()
    }

    function addSkeleton(label)
    {
        if (!template || !template.points || template.points.length === 0)
        {
            return
        }
        const tbbox = getSkeletonBBox(template.points)
        if (!tbbox)
        {
            return
        }

        onBeforeChange()
        const targetH = canvas.height * 0.3
        const scale = tbbox.height > 0 ? targetH / tbbox.height : (tbbox.width > 0 ? targetH / tbbox.width : 1)
        const cx = canvas.width / 2, cy = canvas.height / 2
        const tcx = tbbox.minX + tbbox.width / 2, tcy = tbbox.minY + tbbox.height / 2

        const pts = template.points.map(tp => ({
            name: tp.name || "",
            x: cx + (tp.x - tcx) * scale,
            y: cy + (tp.y - tcy) * scale,
            visible: 2
        }))

        const newSkel = {
            label: label || currentLabel || "object",
            points: pts,
            bboxPad: {...DEFAULT_PAD}
        }
        clampSkeleton(newSkel)
        annotations.push(newSkel)
        selectedIdx = annotations.length - 1
        render()
        onChanged()
    }

    function deleteSelected()
    {
        if (selectedIdx >= 0 && selectedIdx < annotations.length)
        {
            onBeforeChange()
            annotations.splice(selectedIdx, 1)
            selectedIdx = -1
            render()
            onChanged()
        }
    }

    function render()
    {
        const ctx = canvas.getContext("2d")
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (!template)
        {
            return
        }
        const conns = template.connections || []

        for (let i = 0; i < annotations.length; i++)
        {
            const skel = annotations[i]
            const color = getLabelColor(labels, skel.label)
            const sel = i === selectedIdx

            // --- YOLO bounding box ---
            const abbox = getAnnotBBox(skel)
            if (abbox)
            {
                ctx.save()
                ctx.globalAlpha = sel ? 0.9 : 0.35
                ctx.strokeStyle = color
                ctx.lineWidth = sel ? 2.5 : 1.5
                ctx.strokeRect(abbox.x, abbox.y, abbox.w, abbox.h)
                ctx.font = "11px sans-serif"
                ctx.fillStyle = color
                ctx.textAlign = "left"
                ctx.textBaseline = "bottom"
                ctx.fillText(skel.label, abbox.x + 3, abbox.y - 3)
                ctx.restore()
            }

            // --- Connections ---
            ctx.strokeStyle = color
            ctx.lineWidth = sel ? 3 : 2
            for (const [idx1, idx2] of conns)
            {
                const p1 = skel.points[idx1]
                const p2 = skel.points[idx2]
                if (p1 && p2)
                {
                    const anyHidden = (p1.visible !== undefined && p1.visible < 2) || (p2.visible !== undefined && p2.visible < 2)
                    ctx.globalAlpha = anyHidden ? (sel ? 0.45 : 0.25) : (sel ? 1.0 : 0.6)
                    ctx.setLineDash(anyHidden ? [6, 4] : [])
                    ctx.beginPath()
                    ctx.moveTo(p1.x, p1.y)
                    ctx.lineTo(p2.x, p2.y)
                    ctx.stroke()
                }
            }
            ctx.setLineDash([])

            // --- Points ---
            const pr = sel ? POINT_RADIUS_ANNOT + 2 : POINT_RADIUS_ANNOT
            for (let pi = 0; pi < skel.points.length; pi++)
            {
                const p = skel.points[pi]
                const isHidden = p.visible !== undefined && p.visible < 2

                ctx.beginPath()
                ctx.arc(p.x, p.y, pr, 0, Math.PI * 2)
                if (isHidden)
                {
                    ctx.fillStyle = "rgba(0,0,0,0.25)"
                    ctx.globalAlpha = sel ? 0.7 : 0.4
                    ctx.fill()
                    ctx.strokeStyle = color
                    ctx.lineWidth = 2
                    ctx.setLineDash([3, 2])
                    ctx.stroke()
                    ctx.setLineDash([])

                    // Draw X mark
                    const xr = pr * 0.5
                    ctx.beginPath()
                    ctx.moveTo(p.x - xr, p.y - xr)
                    ctx.lineTo(p.x + xr, p.y + xr)
                    ctx.moveTo(p.x + xr, p.y - xr)
                    ctx.lineTo(p.x - xr, p.y + xr)
                    ctx.strokeStyle = "#fff"
                    ctx.lineWidth = 1.5
                    ctx.globalAlpha = 1.0
                    ctx.stroke()
                }
                else
                {
                    ctx.fillStyle = color
                    ctx.globalAlpha = sel ? 1.0 : 0.6
                    ctx.fill()
                    ctx.strokeStyle = "#fff"
                    ctx.lineWidth = 1.5
                    ctx.stroke()
                }

                if (!isHidden)
                {
                    ctx.fillStyle = "#fff"
                    ctx.font = `bold ${sel ? 14 : 12}px sans-serif`
                    ctx.textAlign = "center"
                    ctx.textBaseline = "middle"
                    ctx.globalAlpha = 1.0
                    ctx.fillText(pi.toString(), p.x, p.y)
                }

                if (showNames && p.name)
                {
                    const nameFontSize = Math.max(13, Math.min(22, Math.round(Math.min(canvas.width, canvas.height) / 40)))
                    ctx.font = `${nameFontSize}px sans-serif`
                    ctx.textAlign = "left"
                    ctx.textBaseline = "middle"
                    ctx.globalAlpha = 1.0
                    const nameX = p.x + pr + 4
                    const nameY = p.y
                    const tm = ctx.measureText(p.name)
                    const padX = 3, padY = 2
                    ctx.fillStyle = "rgba(255,255,255,0.7)"
                    ctx.fillRect(nameX - padX, nameY - nameFontSize / 2 - padY, tm.width + padX * 2, nameFontSize + padY * 2)
                    ctx.fillStyle = "#222"
                    ctx.fillText(p.name, nameX, nameY)
                }
            }

            // --- Handles for selected skeleton ---
            if (sel && abbox)
            {
                ctx.globalAlpha = 1.0

                // Corner handles (scale)
                const corners = [
                    {x: abbox.x, y: abbox.y},
                    {x: abbox.x + abbox.w, y: abbox.y},
                    {x: abbox.x, y: abbox.y + abbox.h},
                    {x: abbox.x + abbox.w, y: abbox.y + abbox.h}
                ]
                for (const c of corners)
                {
                    ctx.fillStyle = "#fff"
                    ctx.strokeStyle = color
                    ctx.lineWidth = 2
                    ctx.fillRect(c.x - HANDLE_SIZE / 2, c.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
                    ctx.strokeRect(c.x - HANDLE_SIZE / 2, c.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
                }

                // Edge handles (bbox padding)
                const edges = [
                    {x: abbox.x, y: abbox.y + abbox.h / 2},
                    {x: abbox.x + abbox.w, y: abbox.y + abbox.h / 2},
                    {x: abbox.x + abbox.w / 2, y: abbox.y},
                    {x: abbox.x + abbox.w / 2, y: abbox.y + abbox.h}
                ]
                for (const e of edges)
                {
                    ctx.beginPath()
                    ctx.arc(e.x, e.y, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2)
                    ctx.fillStyle = color
                    ctx.fill()
                    ctx.strokeStyle = "#fff"
                    ctx.lineWidth = 1.5
                    ctx.stroke()
                }

                // Rotation handle
                const rx = abbox.x + abbox.w / 2, ry = abbox.y - ROTATION_OFFSET
                ctx.strokeStyle = color
                ctx.lineWidth = 1.5
                ctx.globalAlpha = 0.8
                ctx.beginPath()
                ctx.moveTo(abbox.x + abbox.w / 2, abbox.y)
                ctx.lineTo(rx, ry)
                ctx.stroke()

                ctx.beginPath()
                ctx.arc(rx, ry, 6, 0, Math.PI * 2)
                ctx.fillStyle = "#fff"
                ctx.fill()
                ctx.strokeStyle = color
                ctx.lineWidth = 2
                ctx.globalAlpha = 1.0
                ctx.stroke()
            }

            ctx.globalAlpha = 1.0
        }
    }

    function hitTest(x, y)
    {
        if (selectedIdx >= 0 && selectedIdx < annotations.length)
        {
            const skel = annotations[selectedIdx]
            const abbox = getAnnotBBox(skel)

            if (abbox)
            {
                // Rotation handle
                const rx = abbox.x + abbox.w / 2, ry = abbox.y - ROTATION_OFFSET
                if (dist(x, y, rx, ry) <= HANDLE_HIT)
                {
                    return {type: "rotate", idx: selectedIdx}
                }

                // Corner handles (scale)
                const corners = [
                    {id: "tl", x: abbox.x, y: abbox.y, ax: abbox.x + abbox.w, ay: abbox.y + abbox.h},
                    {id: "tr", x: abbox.x + abbox.w, y: abbox.y, ax: abbox.x, ay: abbox.y + abbox.h},
                    {id: "bl", x: abbox.x, y: abbox.y + abbox.h, ax: abbox.x + abbox.w, ay: abbox.y},
                    {id: "br", x: abbox.x + abbox.w, y: abbox.y + abbox.h, ax: abbox.x, ay: abbox.y}
                ]
                for (const c of corners)
                {
                    if (dist(x, y, c.x, c.y) <= HANDLE_HIT)
                    {
                        return {type: "scale", idx: selectedIdx, handle: c}
                    }
                }

                // Edge handles (bbox padding)
                const edgesList = [
                    {x: abbox.x, y: abbox.y + abbox.h / 2, side: "left"},
                    {x: abbox.x + abbox.w, y: abbox.y + abbox.h / 2, side: "right"},
                    {x: abbox.x + abbox.w / 2, y: abbox.y, side: "top"},
                    {x: abbox.x + abbox.w / 2, y: abbox.y + abbox.h, side: "bottom"}
                ]
                for (const e of edgesList)
                {
                    if (dist(x, y, e.x, e.y) <= HANDLE_HIT)
                    {
                        return {type: "bbox_edge", idx: selectedIdx, side: e.side}
                    }
                }
            }

            // Individual points
            for (let pi = skel.points.length - 1; pi >= 0; pi--)
            {
                if (dist(x, y, skel.points[pi].x, skel.points[pi].y) <= POINT_HIT)
                {
                    return {type: "point", idx: selectedIdx, pi}
                }
            }

            // Move (inside bbox)
            if (abbox && x >= abbox.x && x <= abbox.x + abbox.w && y >= abbox.y && y <= abbox.y + abbox.h)
            {
                return {type: "move", idx: selectedIdx}
            }
        }

        // Other skeletons
        for (let i = annotations.length - 1; i >= 0; i--)
        {
            if (i === selectedIdx)
            {
                continue
            }
            const skel = annotations[i]

            for (let pi = skel.points.length - 1; pi >= 0; pi--)
            {
                if (dist(x, y, skel.points[pi].x, skel.points[pi].y) <= POINT_HIT)
                {
                    return {type: "select", idx: i}
                }
            }

            const abbox = getAnnotBBox(skel)
            if (abbox && x >= abbox.x && x <= abbox.x + abbox.w && y >= abbox.y && y <= abbox.y + abbox.h)
            {
                return {type: "select", idx: i}
            }
        }

        return {type: "none"}
    }

    addEventListenerWithId(canvas, "mousedown", "sk_md", (e) =>
    {
        const {mouse_x: mx, mouse_y: my} = getMouseCoordinatesCanvas(e, canvas)
        const hit = hitTest(mx, my)

        if (hit.type === "point")
        {
            onBeforeChange()
            const pt = annotations[hit.idx].points[hit.pi]
            dragState = {type: "point", idx: hit.idx, pi: hit.pi, ox: pt.x - mx, oy: pt.y - my}
        }
        else if (hit.type === "move")
        {
            onBeforeChange()
            dragState = {
                type: "move", idx: hit.idx, sx: mx, sy: my,
                orig: annotations[hit.idx].points.map(p => ({...p}))
            }
        }
        else if (hit.type === "scale")
        {
            onBeforeChange()
            const skel = annotations[hit.idx]
            dragState = {
                type: "scale", idx: hit.idx, handle: hit.handle,
                orig: skel.points.map(p => ({...p})),
                origPad: {...skel.bboxPad}
            }
        }
        else if (hit.type === "rotate")
        {
            onBeforeChange()
            const skel = annotations[hit.idx]
            const pb = getSkeletonBBox(skel.points)
            const cx = (pb.minX + pb.maxX) / 2, cy = (pb.minY + pb.maxY) / 2
            dragState = {
                type: "rotate", idx: hit.idx, cx, cy,
                sa: Math.atan2(my - cy, mx - cx),
                orig: skel.points.map(p => ({...p}))
            }
        }
        else if (hit.type === "bbox_edge")
        {
            onBeforeChange()
            dragState = {type: "bbox_edge", idx: hit.idx, side: hit.side}
        }
        else if (hit.type === "select")
        {
            selectedIdx = hit.idx
            render()
        }
        else
        {
            if (selectedIdx !== -1)
            {
                selectedIdx = -1
                render()
            }
        }
    })

    addEventListenerWithId(canvas, "mousemove", "sk_mm", (e) =>
    {
        if (!dragState)
        {
            return
        }
        const {mouse_x: mx, mouse_y: my} = getMouseCoordinatesCanvas(e, canvas)
        const skel = annotations[dragState.idx]

        if (dragState.type === "point")
        {
            skel.points[dragState.pi].x = mx + dragState.ox
            skel.points[dragState.pi].y = my + dragState.oy
        }
        else if (dragState.type === "move")
        {
            const dx = mx - dragState.sx, dy = my - dragState.sy
            for (let i = 0; i < skel.points.length; i++)
            {
                skel.points[i].x = dragState.orig[i].x + dx
                skel.points[i].y = dragState.orig[i].y + dy
            }
        }
        else if (dragState.type === "scale")
        {
            const {handle, orig, origPad} = dragState
            const odx = handle.x - handle.ax, ody = handle.y - handle.ay
            const ndx = mx - handle.ax, ndy = my - handle.ay
            const sx = Math.abs(odx) > 0.01 ? ndx / odx : 1
            const sy = Math.abs(ody) > 0.01 ? ndy / ody : 1

            for (let i = 0; i < skel.points.length; i++)
            {
                skel.points[i].x = handle.ax + (orig[i].x - handle.ax) * sx
                skel.points[i].y = handle.ay + (orig[i].y - handle.ay) * sy
            }

            // Scale padding proportionally, swap on flip
            const absSx = Math.abs(sx), absSy = Math.abs(sy)
            const pL = Math.max(BBOX_MIN_PAD, origPad.left * absSx)
            const pR = Math.max(BBOX_MIN_PAD, origPad.right * absSx)
            const pT = Math.max(BBOX_MIN_PAD, origPad.top * absSy)
            const pB = Math.max(BBOX_MIN_PAD, origPad.bottom * absSy)
            skel.bboxPad = {
                left: sx >= 0 ? pL : pR,
                right: sx >= 0 ? pR : pL,
                top: sy >= 0 ? pT : pB,
                bottom: sy >= 0 ? pB : pT
            }
        }
        else if (dragState.type === "rotate")
        {
            const {cx, cy, sa, orig} = dragState
            const ca = Math.atan2(my - cy, mx - cx)
            const da = ca - sa
            for (let i = 0; i < skel.points.length; i++)
            {
                const r = rotatePoint(orig[i].x, orig[i].y, cx, cy, da)
                skel.points[i].x = r.x
                skel.points[i].y = r.y
            }
        }
        else if (dragState.type === "bbox_edge")
        {
            const pb = getSkeletonBBox(skel.points)
            if (!pb)
            {
                return
            }
            if (dragState.side === "left")
            {
                skel.bboxPad.left = Math.max(BBOX_MIN_PAD, pb.minX - mx)
            }
            else if (dragState.side === "right")
            {
                skel.bboxPad.right = Math.max(BBOX_MIN_PAD, mx - pb.maxX)
            }
            else if (dragState.side === "top")
            {
                skel.bboxPad.top = Math.max(BBOX_MIN_PAD, pb.minY - my)
            }
            else if (dragState.side === "bottom")
            {
                skel.bboxPad.bottom = Math.max(BBOX_MIN_PAD, my - pb.maxY)
            }
        }

        clampSkeleton(skel)
        render()
    })

    addEventListenerWithId(canvas, "mouseup", "sk_mu", () =>
    {
        if (dragState)
        {
            dragState = null
            onChanged()
        }
    })

    addEventListenerWithId(canvas, "dblclick", "sk_dc", (e) =>
    {
        const {mouse_x: mx, mouse_y: my} = getMouseCoordinatesCanvas(e, canvas)
        const hit = hitTest(mx, my)
        if (hit.type === "point" || hit.type === "move" || hit.type === "scale" ||
            hit.type === "rotate" || hit.type === "bbox_edge")
        {
            onBeforeChange()
            annotations.splice(hit.idx, 1)
            selectedIdx = -1
            render()
            onChanged()
        }
    })

    addEventListenerWithId(canvas, "contextmenu", "sk_ctx", (e) =>
    {
        e.preventDefault()
        const {mouse_x: mx, mouse_y: my} = getMouseCoordinatesCanvas(e, canvas)
        // Check all skeletons for point hit
        for (let i = annotations.length - 1; i >= 0; i--)
        {
            const skel = annotations[i]
            for (let pi = skel.points.length - 1; pi >= 0; pi--)
            {
                if (dist(mx, my, skel.points[pi].x, skel.points[pi].y) <= POINT_HIT)
                {
                    onBeforeChange()
                    const p = skel.points[pi]
                    p.visible = (p.visible === undefined || p.visible === 2) ? 1 : 2
                    selectedIdx = i
                    render()
                    onChanged()
                    return
                }
            }
        }
    })

    function destroy()
    {
        removeEventListenerWithId(canvas, "sk_md")
        removeEventListenerWithId(canvas, "sk_mm")
        removeEventListenerWithId(canvas, "sk_mu")
        removeEventListenerWithId(canvas, "sk_dc")
        removeEventListenerWithId(canvas, "sk_ctx")
    }

    return {setAnnotations, getAnnotations, setCurrentLabel, setShowNames, addSkeleton, deleteSelected, render, destroy}
}
