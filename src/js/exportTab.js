import {addEventListenerWithId} from "./events.js"

export function createExportTab(project)
{
    const li = document.createElement("li")
    li.classList.add("nav-item")

    const isVisible = (project.project_type || "segmentation") === "yolo-skeleton" && project.annotated_count > 0
    li.style.display = isVisible ? "" : "none"

    const button = document.createElement("a")
    button.classList.add("nav-link")
    button.href = "#"
    button.textContent = "Export"
    li.appendChild(button)

    const div = document.createElement("div")
    div.id = "project-export"
    div.style.display = "none"

    return {li, button, div}
}

function createSvgIcon(paths, viewBox = "0 0 24 24")
{
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("viewBox", viewBox)
    svg.setAttribute("width", "40")
    svg.setAttribute("height", "40")
    svg.style.cssText = "flex-shrink:0;"

    for (const d of paths)
    {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path")
        p.setAttribute("d", d)
        p.setAttribute("fill", "none")
        p.setAttribute("stroke", "#0d6efd")
        p.setAttribute("stroke-width", "1.5")
        p.setAttribute("stroke-linecap", "round")
        p.setAttribute("stroke-linejoin", "round")
        svg.appendChild(p)
    }

    return svg
}

function svgFlip()
{
    return createSvgIcon([
        "M12 3v18",
        "M4 8l4-4 4 4",
        "M4 8h8",
        "M20 16l-4 4-4-4",
        "M20 16h-8",
    ])
}

function svgRotate()
{
    return createSvgIcon([
        "M1 4v6h6",
        "M3.51 15a9 9 0 1 0 2.13-9.36L1 10",
    ])
}

function svgBrightness()
{
    return createSvgIcon([
        "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42",
        "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    ])
}

function svgCrop()
{
    return createSvgIcon([
        "M6 2v4M6 18v4M18 2v4M18 18v4M2 6h4M18 6h4M2 18h4M18 18h4",
        "M6 6h12v12H6z",
    ])
}

function buildFormatSection()
{
    const card = document.createElement("div")
    card.classList.add("card", "mb-3")

    const header = document.createElement("div")
    header.classList.add("card-header")
    header.innerHTML = "<strong>Export Format</strong>"

    const body = document.createElement("div")
    body.classList.add("card-body")

    const formats = [
        {value: "yolo", label: "YOLO Pose TXT", desc: "YOLOv8-pose (.txt + data.yaml)"},
        {value: "coco", label: "COCO Keypoints JSON", desc: "MMPose, ViTPose (.json)"},
        {value: "dlc", label: "DeepLabCut CSV", desc: "DeepLabCut (.csv + config.yaml)"},
    ]

    let selectedFormat = "yolo"
    const radios = []

    for (const fmt of formats)
    {
        const wrapper = document.createElement("div")
        wrapper.classList.add("form-check", "mb-2")

        const radio = document.createElement("input")
        radio.classList.add("form-check-input")
        radio.type = "radio"
        radio.name = "export-format"
        radio.value = fmt.value
        radio.id = `fmt-${fmt.value}`
        radio.checked = fmt.value === "yolo"

        const label = document.createElement("label")
        label.classList.add("form-check-label")
        label.htmlFor = radio.id

        const strong = document.createElement("strong")
        strong.textContent = fmt.label

        const small = document.createElement("small")
        small.classList.add("text-muted", "ms-2")
        small.textContent = fmt.desc

        label.appendChild(strong)
        label.appendChild(small)
        wrapper.appendChild(radio)
        wrapper.appendChild(label)
        body.appendChild(wrapper)

        radios.push(radio)
    }

    card.appendChild(header)
    card.appendChild(body)

    return {
        element: card,
        radios,
        getFormat: () =>
        {
            for (const r of radios)
            {
                if (r.checked) return r.value
            }
            return "yolo"
        }
    }
}

function buildAugmentationSection()
{
    const card = document.createElement("div")
    card.classList.add("card", "mb-3")

    const header = document.createElement("div")
    header.classList.add("card-header")
    header.innerHTML = "<strong>Augmentation</strong>"

    const body = document.createElement("div")
    body.classList.add("card-body")

    // Percentage slider
    const pctRow = document.createElement("div")
    pctRow.classList.add("mb-3")

    const pctLabel = document.createElement("label")
    pctLabel.classList.add("form-label")
    pctLabel.textContent = "Additional augmented images: 0%"

    const pctSlider = document.createElement("input")
    pctSlider.type = "range"
    pctSlider.classList.add("form-range")
    pctSlider.min = "0"
    pctSlider.max = "200"
    pctSlider.value = "0"
    pctSlider.step = "10"

    pctSlider.addEventListener("input", () =>
    {
        pctLabel.textContent = `Additional augmented images: ${pctSlider.value}%`
        togglesContainer.style.opacity = parseInt(pctSlider.value) > 0 ? "1" : "0.5"
    })

    pctRow.appendChild(pctLabel)
    pctRow.appendChild(pctSlider)

    const helpText = document.createElement("small")
    helpText.classList.add("text-muted")
    helpText.textContent = "Original images are always included. Augmented copies are added on top."
    pctRow.appendChild(helpText)

    body.appendChild(pctRow)

    // Toggle switches
    const togglesContainer = document.createElement("div")
    togglesContainer.style.opacity = "0.5"
    togglesContainer.style.transition = "opacity 0.2s"

    const augTypes = [
        {key: "flip", label: "Horizontal Flip", desc: "Mirror image horizontally", icon: svgFlip()},
        {key: "rotate", label: "Random Rotation", desc: "Rotate \u00b115\u00b0", icon: svgRotate()},
        {key: "brightness", label: "Brightness / Contrast", desc: "Random adjustment", icon: svgBrightness()},
        {key: "crop", label: "Random Crop", desc: "Crop around keypoints", icon: svgCrop()},
    ]

    const toggles = {}

    for (const aug of augTypes)
    {
        const row = document.createElement("div")
        row.style.cssText = "display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #eee;"

        row.appendChild(aug.icon)

        const textCol = document.createElement("div")
        textCol.style.cssText = "flex:1;"

        const name = document.createElement("div")
        name.innerHTML = `<strong>${aug.label}</strong>`

        const desc = document.createElement("small")
        desc.classList.add("text-muted")
        desc.textContent = aug.desc

        textCol.appendChild(name)
        textCol.appendChild(desc)
        row.appendChild(textCol)

        const switchWrapper = document.createElement("div")
        switchWrapper.classList.add("form-check", "form-switch")

        const switchInput = document.createElement("input")
        switchInput.classList.add("form-check-input")
        switchInput.type = "checkbox"
        switchInput.checked = true
        switchInput.id = `aug-${aug.key}`

        switchWrapper.appendChild(switchInput)
        row.appendChild(switchWrapper)

        togglesContainer.appendChild(row)
        toggles[aug.key] = switchInput
    }

    body.appendChild(togglesContainer)
    card.appendChild(header)
    card.appendChild(body)

    return {
        element: card,
        getPct: () => parseInt(pctSlider.value),
        getToggles: () =>
        {
            const result = {}
            for (const [key, input] of Object.entries(toggles))
            {
                result[key] = input.checked
            }
            return result
        }
    }
}

function buildSplitSection(initialFormat)
{
    const card = document.createElement("div")
    card.classList.add("card", "mb-3")

    const header = document.createElement("div")
    header.classList.add("card-header")
    header.innerHTML = "<strong>Train / Validation / Test Split</strong>"

    const body = document.createElement("div")
    body.classList.add("card-body")

    const makeRow = (labelText, defaultVal, id) =>
    {
        const row = document.createElement("div")
        row.classList.add("mb-2", "d-flex", "align-items-center", "gap-2")

        const label = document.createElement("label")
        label.classList.add("form-label", "mb-0")
        label.style.width = "100px"
        label.textContent = labelText

        const slider = document.createElement("input")
        slider.type = "range"
        slider.classList.add("form-range", "flex-grow-1")
        slider.min = "0"
        slider.max = "100"
        slider.value = defaultVal.toString()
        slider.step = "5"
        slider.id = id

        const valueSpan = document.createElement("span")
        valueSpan.style.cssText = "min-width:40px;text-align:right;font-weight:bold;"
        valueSpan.textContent = `${defaultVal}%`

        slider.addEventListener("input", () =>
        {
            valueSpan.textContent = `${slider.value}%`
            updateValidation()
        })

        row.appendChild(label)
        row.appendChild(slider)
        row.appendChild(valueSpan)
        return {row, slider, valueSpan}
    }

    const train = makeRow("Train", initialFormat === "yolo" ? 70 : 80, "split-train")
    const val = makeRow("Validation", 20, "split-val")
    const test = makeRow("Test", 10, "split-test")

    test.row.style.display = initialFormat === "yolo" ? "flex" : "none"

    const validationMsg = document.createElement("div")
    validationMsg.style.cssText = "margin-top:4px;font-size:0.85rem;"

    const updateValidation = () =>
    {
        const t = parseInt(train.slider.value)
        const v = parseInt(val.slider.value)
        const te = test.row.style.display !== "none" ? parseInt(test.slider.value) : 0
        const sum = t + v + te

        if (sum === 100)
        {
            validationMsg.textContent = ""
            validationMsg.className = "text-success"
            validationMsg.textContent = "Sum: 100%"
        }
        else
        {
            validationMsg.className = "text-danger"
            validationMsg.textContent = `Sum: ${sum}% (must equal 100%)`
        }
    }

    body.appendChild(train.row)
    body.appendChild(val.row)
    body.appendChild(test.row)
    body.appendChild(validationMsg)
    card.appendChild(header)
    card.appendChild(body)

    updateValidation()

    return {
        element: card,
        testRow: test.row,
        setFormat: (fmt) =>
        {
            if (fmt === "yolo")
            {
                test.row.style.display = "flex"
                train.slider.value = "70"
                train.valueSpan.textContent = "70%"
                val.slider.value = "20"
                val.valueSpan.textContent = "20%"
                test.slider.value = "10"
                test.valueSpan.textContent = "10%"
            }
            else
            {
                test.row.style.display = "none"
                train.slider.value = "80"
                train.valueSpan.textContent = "80%"
                val.slider.value = "20"
                val.valueSpan.textContent = "20%"
            }
            updateValidation()
        },
        getValues: () =>
        {
            const t = parseInt(train.slider.value)
            const v = parseInt(val.slider.value)
            const te = test.row.style.display !== "none" ? parseInt(test.slider.value) : 0
            return {train: t, val: v, test: te}
        },
        isValid: () =>
        {
            const {train: t, val: v, test: te} = {
                train: parseInt(train.slider.value),
                val: parseInt(val.slider.value),
                test: test.row.style.display !== "none" ? parseInt(test.slider.value) : 0,
            }
            return (t + v + te) === 100
        },
    }
}

function buildShapeSection()
{
    const card = document.createElement("div")
    card.classList.add("card", "mb-3")

    const header = document.createElement("div")
    header.classList.add("card-header")
    header.innerHTML = "<strong>Image Aspect Ratio</strong>"

    const body = document.createElement("div")
    body.classList.add("card-body")

    const modes = [
        {
            value: "crop_square",
            label: "Crop to square around object",
            desc: "Builds the largest square centred on the bounding box. Pads with black if needed.",
            svgPaths: [
                "M3 3h18v18H3z",
                "M7 8h10v8H7z",
            ],
        },
        {
            value: "pad_square",
            label: "Pad to square (letterbox)",
            desc: "Adds black bars to make the image 1\u00d71, no distortion.",
            svgPaths: [
                "M1 4h22v16H1z",
                "M1 1h22v2H1zM1 21h22v2H1z",
            ],
        },
        {
            value: "as_is",
            label: "As is (keep original proportions)",
            desc: "No changes to the aspect ratio. The model framework will handle it.",
            svgPaths: [
                "M2 4h20v16H2z",
            ],
        },
        {
            value: "stretch_square",
            label: "Stretch to square",
            desc: "Resizes to 1\u00d71 by stretching. Distorts proportions.",
            warn: true,
            svgPaths: [
                "M3 3h18v18H3z",
                "M8 9l-4 3 4 3M16 9l4 3-4 3",
            ],
        },
    ]

    const radios = []

    for (const mode of modes)
    {
        const wrapper = document.createElement("div")
        wrapper.classList.add("form-check", "mb-2")
        wrapper.style.cssText = "display:flex;align-items:flex-start;gap:10px;"

        const radio = document.createElement("input")
        radio.classList.add("form-check-input")
        radio.type = "radio"
        radio.name = "shape-mode"
        radio.value = mode.value
        radio.id = `shape-${mode.value}`
        radio.checked = mode.value === "crop_square"
        radio.style.marginTop = "6px"

        const labelCol = document.createElement("div")
        labelCol.style.flex = "1"

        const svg = createSvgIcon(mode.svgPaths)
        svg.setAttribute("width", "32")
        svg.setAttribute("height", "32")
        if (mode.warn)
        {
            svg.querySelectorAll("path").forEach(p => p.setAttribute("stroke", "#dc3545"))
        }

        const nameRow = document.createElement("div")
        nameRow.style.cssText = "display:flex;align-items:center;gap:8px;"

        const label = document.createElement("label")
        label.htmlFor = radio.id
        label.style.cursor = "pointer"

        const strong = document.createElement("strong")
        strong.textContent = mode.label
        label.appendChild(strong)

        if (mode.warn)
        {
            const badge = document.createElement("span")
            badge.classList.add("badge", "bg-danger", "ms-2")
            badge.textContent = "not recommended"
            label.appendChild(badge)
        }

        nameRow.appendChild(svg)
        nameRow.appendChild(label)

        const desc = document.createElement("small")
        desc.classList.add("text-muted")
        desc.style.display = "block"
        desc.style.marginLeft = "40px"
        desc.textContent = mode.desc

        labelCol.appendChild(nameRow)
        labelCol.appendChild(desc)

        wrapper.appendChild(radio)
        wrapper.appendChild(labelCol)
        body.appendChild(wrapper)

        radios.push(radio)
    }

    card.appendChild(header)
    card.appendChild(body)

    return {
        element: card,
        getMode: () =>
        {
            for (const r of radios) if (r.checked) return r.value
            return "as_is"
        }
    }
}

function buildResizeSection()
{
    const card = document.createElement("div")
    card.classList.add("card", "mb-3")

    const header = document.createElement("div")
    header.classList.add("card-header")
    header.innerHTML = "<strong>Image Size (longest side)</strong>"

    const body = document.createElement("div")
    body.classList.add("card-body")

    const asIsWrapper = document.createElement("div")
    asIsWrapper.classList.add("form-check", "mb-2")

    const asIsRadio = document.createElement("input")
    asIsRadio.classList.add("form-check-input")
    asIsRadio.type = "radio"
    asIsRadio.name = "resize-mode"
    asIsRadio.value = "as_is"
    asIsRadio.id = "resize-as-is"
    asIsRadio.checked = true

    const asIsLabel = document.createElement("label")
    asIsLabel.classList.add("form-check-label")
    asIsLabel.htmlFor = "resize-as-is"
    asIsLabel.textContent = "Keep original resolution"

    asIsWrapper.appendChild(asIsRadio)
    asIsWrapper.appendChild(asIsLabel)
    body.appendChild(asIsWrapper)

    const customWrapper = document.createElement("div")
    customWrapper.classList.add("form-check", "mb-2")

    const customRadio = document.createElement("input")
    customRadio.classList.add("form-check-input")
    customRadio.type = "radio"
    customRadio.name = "resize-mode"
    customRadio.value = "custom"
    customRadio.id = "resize-custom"

    const customLabel = document.createElement("label")
    customLabel.classList.add("form-check-label")
    customLabel.htmlFor = "resize-custom"
    customLabel.textContent = "Resize longest side to:"

    const sizeInput = document.createElement("input")
    sizeInput.type = "number"
    sizeInput.classList.add("form-control", "form-control-sm", "d-inline-block", "ms-2")
    sizeInput.style.width = "100px"
    sizeInput.value = "1280"
    sizeInput.min = "64"
    sizeInput.max = "8192"
    sizeInput.disabled = true

    const pxLabel = document.createElement("span")
    pxLabel.classList.add("ms-1", "text-muted")
    pxLabel.textContent = "px"

    customWrapper.appendChild(customRadio)
    customWrapper.appendChild(customLabel)
    customWrapper.appendChild(sizeInput)
    customWrapper.appendChild(pxLabel)
    body.appendChild(customWrapper)

    const helpText = document.createElement("small")
    helpText.classList.add("text-muted", "d-block", "mt-1")
    helpText.textContent = "Resizes proportionally by the longest side. Applied after aspect ratio transform."
    body.appendChild(helpText)

    asIsRadio.addEventListener("change", () => { sizeInput.disabled = true })
    customRadio.addEventListener("change", () => { sizeInput.disabled = false; sizeInput.focus() })

    card.appendChild(header)
    card.appendChild(body)

    return {
        element: card,
        getMode: () => customRadio.checked ? "custom" : "as_is",
        getSize: () => parseInt(sizeInput.value) || 1280,
    }
}

function startExport(project, format, splitValues, augPct, augToggles, shapeMode, resizeMode, resizeSize, trainingOpts)
{
    const overlay = document.createElement("div")
    overlay.classList.add("upload-progress-overlay")

    const panel = document.createElement("div")
    panel.classList.add("upload-progress-panel")

    const title = document.createElement("h5")
    title.textContent = "Export Dataset"

    const progressWrapper = document.createElement("div")
    progressWrapper.classList.add("progress")

    const progressBar = document.createElement("div")
    progressBar.classList.add("progress-bar", "progress-bar-striped", "progress-bar-animated")
    progressBar.style.width = "0%"
    progressBar.textContent = "0%"
    progressWrapper.appendChild(progressBar)

    const statusText = document.createElement("div")
    statusText.classList.add("upload-status")
    statusText.textContent = "Preparing dataset..."

    const cancelBtn = document.createElement("button")
    cancelBtn.classList.add("btn", "btn-outline-danger", "btn-sm", "mt-2")
    cancelBtn.textContent = "Cancel"

    panel.appendChild(title)
    panel.appendChild(progressWrapper)
    panel.appendChild(statusText)
    panel.appendChild(cancelBtn)
    overlay.appendChild(panel)
    document.body.appendChild(overlay)

    const params = new URLSearchParams({
        format,
        train_pct: splitValues.train,
        val_pct: splitValues.val,
        test_pct: splitValues.test,
        aug_pct: augPct,
        aug_flip: augToggles.flip,
        aug_rotate: augToggles.rotate,
        aug_brightness: augToggles.brightness,
        aug_crop: augToggles.crop,
        shape_mode: shapeMode,
        resize_mode: resizeMode,
        resize_size: resizeSize,
    })

    if (trainingOpts && trainingOpts.enabled)
    {
        params.set("train_script", "true")
        params.set("device", trainingOpts.device)
        params.set("model_variant", trainingOpts.modelVariant || "mmpose")
        params.set("epochs", trainingOpts.epochs)
        params.set("batch_size", trainingOpts.batchSize)
        params.set("imgsz", trainingOpts.imgsz)
        params.set("lr", trainingOpts.lr)
        params.set("patience", trainingOpts.patience)
    }

    const eventSource = new EventSource(`/export_dataset/${project.id_project}?${params}`)

    cancelBtn.addEventListener("click", () =>
    {
        eventSource.close()
        progressBar.classList.remove("progress-bar-animated")
        progressBar.classList.add("bg-warning")
        progressBar.style.width = "100%"
        progressBar.textContent = "Cancelled"
        statusText.textContent = "Export cancelled by user"
        cancelBtn.disabled = true
        setTimeout(() => overlay.remove(), 1500)
    })

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
            cancelBtn.style.display = "none"

            const stats = [`Total: ${data.total}`]
            if (data.train) stats.push(`Train: ${data.train}`)
            if (data.val) stats.push(`Val: ${data.val}`)
            if (data.test) stats.push(`Test: ${data.test}`)
            statusText.textContent = `Done! ${stats.join(", ")}. Downloading...`

            const a = document.createElement("a")
            a.href = `/download_dataset/${data.token}`
            a.download = (project.project_name || `project_${project.id_project}`) + "_dataset.zip"
            a.click()

            setTimeout(() => overlay.remove(), 3000)
        }
        else
        {
            const percent = Math.round((data.current / data.total) * 100)
            progressBar.style.width = `${percent}%`
            progressBar.textContent = `${percent}%`
            statusText.textContent = `${data.current} / ${data.total}: ${data.file}`
        }
    }

    eventSource.onerror = () =>
    {
        eventSource.close()
        progressBar.classList.remove("progress-bar-animated")
        progressBar.classList.add("bg-danger")
        statusText.textContent = "Export error"
        cancelBtn.style.display = "none"
        setTimeout(() => overlay.remove(), 3000)
    }
}

function svgGpu()
{
    return createSvgIcon([
        "M4 6h16v10H4z",
        "M1 10h2M21 10h2",
        "M8 16v2M16 16v2",
        "M7 9h4v4H7z",
        "M14 9h3M14 11h3M14 13h2",
    ])
}

function buildTrainingSection(getFormat)
{
    const card = document.createElement("div")
    card.classList.add("card", "mb-3")

    const header = document.createElement("div")
    header.classList.add("card-header", "d-flex", "align-items-center", "gap-2")

    const enableCheck = document.createElement("input")
    enableCheck.type = "checkbox"
    enableCheck.classList.add("form-check-input")
    enableCheck.id = "train-script-enable"

    const headerLabel = document.createElement("label")
    headerLabel.htmlFor = enableCheck.id
    headerLabel.style.cursor = "pointer"
    headerLabel.innerHTML = "<strong>Include Training Script</strong>"

    header.appendChild(enableCheck)
    header.appendChild(headerLabel)

    const icon = svgGpu()
    icon.setAttribute("width", "28")
    icon.setAttribute("height", "28")
    icon.style.marginLeft = "auto"
    header.appendChild(icon)

    const body = document.createElement("div")
    body.classList.add("card-body")
    body.style.display = "none"

    enableCheck.addEventListener("change", () =>
    {
        body.style.display = enableCheck.checked ? "block" : "none"
    })

    const helpText = document.createElement("small")
    helpText.classList.add("text-muted", "d-block", "mb-3")
    helpText.textContent = "A ready-to-run train.py will be added to the archive. Just run it to start training."

    body.appendChild(helpText)

    // Device
    const deviceRow = document.createElement("div")
    deviceRow.classList.add("mb-3")

    const deviceLabel = document.createElement("label")
    deviceLabel.classList.add("form-label")
    deviceLabel.textContent = "Device"

    const deviceSelect = document.createElement("select")
    deviceSelect.classList.add("form-select", "form-select-sm")
    deviceSelect.style.width = "280px"

    const devices = [
        {value: "gpu", label: "NVIDIA GPU (CUDA)"},
        {value: "mps", label: "Apple Metal (MPS)"},
        {value: "rocm", label: "AMD GPU (ROCm)"},
        {value: "cpu", label: "CPU"},
    ]

    for (const d of devices)
    {
        const opt = document.createElement("option")
        opt.value = d.value
        opt.textContent = d.label
        deviceSelect.appendChild(opt)
    }

    deviceRow.appendChild(deviceLabel)
    deviceRow.appendChild(deviceSelect)
    body.appendChild(deviceRow)

    // Model variant (shown only for COCO format)
    const modelRow = document.createElement("div")
    modelRow.classList.add("mb-3")
    modelRow.style.display = "none"

    const modelLabel = document.createElement("label")
    modelLabel.classList.add("form-label")
    modelLabel.textContent = "Model architecture"

    const modelSelect = document.createElement("select")
    modelSelect.classList.add("form-select", "form-select-sm")
    modelSelect.style.width = "280px"

    const modelVariants = [
        {value: "mmpose", label: "MMPose (HRNet-W48)", desc: "recommended"},
        {value: "vitpose", label: "ViTPose (ViT-B)", desc: "state-of-the-art"},
        {value: "resnet", label: "PyTorch ResNet50 + Heatmap", desc: "lightweight, no extra deps"},
    ]

    for (const m of modelVariants)
    {
        const opt = document.createElement("option")
        opt.value = m.value
        opt.textContent = `${m.label}  \u2014  ${m.desc}`
        modelSelect.appendChild(opt)
    }

    modelRow.appendChild(modelLabel)
    modelRow.appendChild(modelSelect)
    body.appendChild(modelRow)

    // Epochs
    const epochsRow = document.createElement("div")
    epochsRow.classList.add("mb-3", "d-flex", "align-items-center", "gap-2")

    const epochsLabel = document.createElement("label")
    epochsLabel.classList.add("form-label", "mb-0")
    epochsLabel.style.width = "120px"
    epochsLabel.textContent = "Epochs"

    const epochsInput = document.createElement("input")
    epochsInput.type = "number"
    epochsInput.classList.add("form-control", "form-control-sm")
    epochsInput.style.width = "100px"
    epochsInput.value = "100"
    epochsInput.min = "1"

    epochsRow.appendChild(epochsLabel)
    epochsRow.appendChild(epochsInput)
    body.appendChild(epochsRow)

    // Batch size
    const batchRow = document.createElement("div")
    batchRow.classList.add("mb-3", "d-flex", "align-items-center", "gap-2")

    const batchLabel = document.createElement("label")
    batchLabel.classList.add("form-label", "mb-0")
    batchLabel.style.width = "120px"
    batchLabel.textContent = "Batch size"

    const batchInput = document.createElement("input")
    batchInput.type = "number"
    batchInput.classList.add("form-control", "form-control-sm")
    batchInput.style.width = "100px"
    batchInput.value = "16"
    batchInput.min = "1"

    batchRow.appendChild(batchLabel)
    batchRow.appendChild(batchInput)
    body.appendChild(batchRow)

    // Image size (training)
    const imgszRow = document.createElement("div")
    imgszRow.classList.add("mb-3", "d-flex", "align-items-center", "gap-2")

    const imgszLabel = document.createElement("label")
    imgszLabel.classList.add("form-label", "mb-0")
    imgszLabel.style.width = "120px"
    imgszLabel.textContent = "Train image size"

    const imgszInput = document.createElement("input")
    imgszInput.type = "number"
    imgszInput.classList.add("form-control", "form-control-sm")
    imgszInput.style.width = "100px"
    imgszInput.value = "640"
    imgszInput.min = "64"
    imgszInput.step = "32"

    const imgszHelp = document.createElement("small")
    imgszHelp.classList.add("text-muted")
    imgszHelp.textContent = "px (YOLO resizes internally)"

    imgszRow.appendChild(imgszLabel)
    imgszRow.appendChild(imgszInput)
    imgszRow.appendChild(imgszHelp)
    body.appendChild(imgszRow)

    // Learning rate
    const lrRow = document.createElement("div")
    lrRow.classList.add("mb-3", "d-flex", "align-items-center", "gap-2")

    const lrLabel = document.createElement("label")
    lrLabel.classList.add("form-label", "mb-0")
    lrLabel.style.width = "120px"
    lrLabel.textContent = "Learning rate"

    const lrInput = document.createElement("input")
    lrInput.type = "number"
    lrInput.classList.add("form-control", "form-control-sm")
    lrInput.style.width = "100px"
    lrInput.value = "0.01"
    lrInput.min = "0.0001"
    lrInput.step = "0.001"

    lrRow.appendChild(lrLabel)
    lrRow.appendChild(lrInput)
    body.appendChild(lrRow)

    // Patience (early stopping)
    const patienceRow = document.createElement("div")
    patienceRow.classList.add("mb-3", "d-flex", "align-items-center", "gap-2")

    const patienceLabel = document.createElement("label")
    patienceLabel.classList.add("form-label", "mb-0")
    patienceLabel.style.width = "120px"
    patienceLabel.textContent = "Patience"

    const patienceInput = document.createElement("input")
    patienceInput.type = "number"
    patienceInput.classList.add("form-control", "form-control-sm")
    patienceInput.style.width = "100px"
    patienceInput.value = "50"
    patienceInput.min = "1"

    const patienceHelp = document.createElement("small")
    patienceHelp.classList.add("text-muted")
    patienceHelp.textContent = "epochs without improvement"

    patienceRow.appendChild(patienceLabel)
    patienceRow.appendChild(patienceInput)
    patienceRow.appendChild(patienceHelp)
    body.appendChild(patienceRow)

    // Update defaults based on format
    const updateDefaults = () =>
    {
        const fmt = getFormat()
        if (fmt === "yolo")
        {
            lrInput.value = "0.01"
            imgszRow.style.display = "flex"
            modelRow.style.display = "none"
        }
        else if (fmt === "coco")
        {
            lrInput.value = "0.001"
            imgszRow.style.display = "flex"
            modelRow.style.display = "block"
        }
        else
        {
            lrInput.value = "0.005"
            imgszRow.style.display = "none"
            modelRow.style.display = "none"
        }
    }
    updateDefaults()

    card.appendChild(header)
    card.appendChild(body)

    return {
        element: card,
        updateDefaults,
        getOpts: () =>
        {
            if (!enableCheck.checked) return null
            return {
                enabled: true,
                device: deviceSelect.value,
                modelVariant: modelSelect.value,
                epochs: parseInt(epochsInput.value) || 100,
                batchSize: parseInt(batchInput.value) || 16,
                imgsz: parseInt(imgszInput.value) || 640,
                lr: parseFloat(lrInput.value) || 0.01,
                patience: parseInt(patienceInput.value) || 50,
            }
        }
    }
}

export function initExportTabHandler(exportButton, exportDiv, showContent, project)
{
    addEventListenerWithId(exportButton, "click", "show_export", (e) =>
    {
        e.preventDefault()
        showContent(exportDiv, () =>
        {
            exportDiv.innerHTML = ""
            exportDiv.style.padding = "1rem"
            exportDiv.style.maxWidth = "700px"

            const heading = document.createElement("h4")
            heading.textContent = "Export Dataset"
            heading.classList.add("mb-3")
            exportDiv.appendChild(heading)

            const formatSection = buildFormatSection()
            exportDiv.appendChild(formatSection.element)

            const shapeSection = buildShapeSection()
            exportDiv.appendChild(shapeSection.element)

            const resizeSection = buildResizeSection()
            exportDiv.appendChild(resizeSection.element)

            const augSection = buildAugmentationSection()
            exportDiv.appendChild(augSection.element)

            const splitSection = buildSplitSection(formatSection.getFormat())
            exportDiv.appendChild(splitSection.element)

            const trainingSection = buildTrainingSection(formatSection.getFormat)
            exportDiv.appendChild(trainingSection.element)

            // Update split and training defaults when format changes
            for (const radio of formatSection.radios)
            {
                radio.addEventListener("change", () =>
                {
                    splitSection.setFormat(formatSection.getFormat())
                    trainingSection.updateDefaults()
                })
            }

            // Export button
            const exportBtn = document.createElement("button")
            exportBtn.classList.add("btn", "btn-primary", "btn-lg", "w-100", "mt-2", "mb-3")
            exportBtn.textContent = "Export Dataset"

            addEventListenerWithId(exportBtn, "click", "export_dataset_click", () =>
            {
                if (!splitSection.isValid())
                {
                    alert("Train + Validation + Test percentages must equal 100%")
                    return
                }

                exportBtn.disabled = true
                startExport(
                    project,
                    formatSection.getFormat(),
                    splitSection.getValues(),
                    augSection.getPct(),
                    augSection.getToggles(),
                    shapeSection.getMode(),
                    resizeSection.getMode(),
                    resizeSection.getSize(),
                    trainingSection.getOpts()
                )
                setTimeout(() => { exportBtn.disabled = false }, 3000)
            })

            exportDiv.appendChild(exportBtn)
        })
    })
}
