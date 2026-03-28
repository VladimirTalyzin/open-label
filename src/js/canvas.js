export function activeLabelColor(labels, labelName)
{
    const labelData = labels.find((label) => label.label === labelName)
    if (!labelData)
    {
        return [255, 0, 0]
    }

    const hexColor = labelData.color
    const bigint = parseInt(hexColor.slice(1), 16)
    const red = (bigint >> 16) & 255
    const green = (bigint >> 8) & 255
    const blue = bigint & 255

    return [red, green, blue]
}

export function updateCanvasZoom(fullImage, canvas)
{
    canvas.style.width = fullImage.style.width
    canvas.style.height = "auto"
    canvas.style.overflow = "hidden"
}

export function getPngCanvas(imageBlock, fullImage, fullImageContainer, withCreate = true)
{
    let pngCanvas = imageBlock.querySelector("canvas.png-canvas")

    if (withCreate && !pngCanvas)
    {
        pngCanvas = document.createElement("canvas")
        pngCanvas.classList.add("png-canvas")
        pngCanvas.width = fullImage.naturalWidth
        pngCanvas.height = fullImage.naturalHeight
        pngCanvas.style.position = "absolute"
        pngCanvas.style.top = "0"
        pngCanvas.style.left = "0"
        pngCanvas.style.pointerEvents = "none"
        imageBlock.style.position = "relative"
        updateCanvasZoom(fullImage, pngCanvas)
        fullImageContainer.appendChild(pngCanvas)
    }
    return pngCanvas
}

export function getVectorCanvas(imageBlock, fullImage, fullImageContainer, withCreate = true)
{
    let vectorCanvas = imageBlock.querySelector("canvas.vector-canvas")

    if (withCreate && !vectorCanvas)
    {
        vectorCanvas = document.createElement("canvas")
        vectorCanvas.classList.add("vector-canvas")
        vectorCanvas.width = fullImage.naturalWidth
        vectorCanvas.height = fullImage.naturalHeight
        vectorCanvas.style.position = "absolute"
        vectorCanvas.style.top = "0"
        vectorCanvas.style.left = "0"
        vectorCanvas.style.pointerEvents = "none"
        imageBlock.style.position = "relative"
        updateCanvasZoom(fullImage, vectorCanvas)
        fullImageContainer.appendChild(vectorCanvas)
    }
    return vectorCanvas
}

export function clearCanvas(pngCanvas)
{
    const ctx = pngCanvas.getContext("2d", {willReadFrequently: true})
    ctx.clearRect(0, 0, pngCanvas.width, pngCanvas.height)
}

export function activateCanvas(pngCanvas, vectorCanvas, activatePng)
{
    if (pngCanvas)
    {
        if (activatePng)
        {
            pngCanvas.style.pointerEvents = null
            pngCanvas.style.zIndex = "1000"
        }
        else
        {
            pngCanvas.style.pointerEvents = "none"
            pngCanvas.style.zIndex = "100"
        }
    }

    if (vectorCanvas)
    {
        if (activatePng)
        {
            vectorCanvas.style.pointerEvents = "none"
            vectorCanvas.style.zIndex = "100"
        }
        else
        {
            vectorCanvas.style.pointerEvents = null
            vectorCanvas.style.zIndex = "1000"
        }
    }
}

export function setPngCanvasUnsaved(pngCanvas, saveButton, clearCanvasButton)
{
    pngCanvas.setAttribute("unsaved", "true")

    if (saveButton)
    {
        saveButton.disabled = false
    }

    if (clearCanvasButton)
    {
        clearCanvasButton.disabled = false
    }
}

export function overlayMaskOnImage(
    imageBlock,
    fullImage,
    fullImageContainer,
    maskUrl,
    labels,
    activeLabel,
    isNewData,
    saveButton,
    clearCanvasButton
)
{
    const pngCanvas = getPngCanvas(imageBlock, fullImage, fullImageContainer)
    const canvasContext = pngCanvas.getContext("2d", {willReadFrequently: true})

    const maskImage = new Image()
    maskImage.crossOrigin = "Anonymous"
    maskImage.onload = () =>
    {
        const tempCanvas = document.createElement("canvas")
        tempCanvas.width = pngCanvas.width
        tempCanvas.height = pngCanvas.height
        const tempCtx = tempCanvas.getContext("2d", {willReadFrequently: true})
        tempCtx.drawImage(maskImage, 0, 0, pngCanvas.width, pngCanvas.height)

        const maskData = tempCtx.getImageData(0, 0, pngCanvas.width, pngCanvas.height)
        const imageData = canvasContext.getImageData(0, 0, pngCanvas.width, pngCanvas.height)

        const color = activeLabelColor(labels, activeLabel)

        const data = imageData.data
        const mask = maskData.data

        for (let i = 0; i < mask.length; i += 4)
        {
            if (mask[i] > 200 && mask[i + 1] > 200 && mask[i + 2] > 200)
            {
                data[i] = color[0]
                data[i + 1] = color[1]
                data[i + 2] = color[2]
                data[i + 3] = 200
            }
        }

        canvasContext.putImageData(imageData, 0, 0)

        if (isNewData)
        {
            setPngCanvasUnsaved(pngCanvas, saveButton, clearCanvasButton)
        }
        else
        {
            clearCanvasButton.disabled = false
        }

        URL.revokeObjectURL(maskUrl)
    }

    maskImage.src = maskUrl
}

export function getMouseCoordinatesCanvas(event, canvas)
{
    const rectBounds = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rectBounds.width
    const scaleY = canvas.height / rectBounds.height

    const mouseX = (event.clientX - rectBounds.left) * scaleX
    const mouseY = (event.clientY - rectBounds.top) * scaleY

    return {mouse_x: mouseX, mouse_y: mouseY}
}

export function drawConnection(canvasContext, x, y, size, color, prevX = null, prevY = null)
{
    if (prevX !== null && prevY !== null)
    {
        const dx = x - prevX
        const dy = y - prevY
        const length = Math.sqrt(dx * dx + dy * dy)
        const angle = Math.atan2(dy, dx)

        canvasContext.save()
        canvasContext.translate(prevX, prevY)
        canvasContext.rotate(angle)

        if (color)
        {
            canvasContext.fillStyle = color
        }

        canvasContext.beginPath()
        canvasContext.rect(0, -size, length, size * 2)
        canvasContext.fill()
        canvasContext.restore()
    }
}

export function paintCircle(canvasContext, x, y, size, color, prevX = null, prevY = null)
{
    drawConnection(canvasContext, x, y, size, color, prevX, prevY)

    canvasContext.beginPath()
    canvasContext.arc(x, y, size, 0, 2 * Math.PI, false)
    canvasContext.fillStyle = color
    canvasContext.fill()
}

export function eraseCircle(canvasContext, x, y, size, prevX = null, prevY = null)
{
    const prevOp = canvasContext.globalCompositeOperation
    canvasContext.globalCompositeOperation = "destination-out"

    drawConnection(canvasContext, x, y, size, null, prevX, prevY)

    canvasContext.beginPath()
    canvasContext.arc(x, y, size, 0, 2 * Math.PI, false)
    canvasContext.fill()

    canvasContext.globalCompositeOperation = prevOp
}
