export function hexToRgba(hex, alpha)
{
    hex = hex.replace("#", "")

    let red, green, blue

    if (hex.length === 3)
    {
        red = parseInt(hex[0] + hex[0], 16)
        green = parseInt(hex[1] + hex[1], 16)
        blue = parseInt(hex[2] + hex[2], 16)
    }
    else if (hex.length === 6)
    {
        red = parseInt(hex.substring(0, 2), 16)
        green = parseInt(hex.substring(2, 4), 16)
        blue = parseInt(hex.substring(4, 6), 16)
    }
    else
    {
        throw new Error("Incorrect HEX color format #rrggbb")
    }

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function getRectangleHandles(shape)
{
    const size = 10
    const halfSize = size / 2
    const handles = []

    const positions = ["top-left", "top-right", "bottom-left", "bottom-right", "left", "right", "top", "bottom"]

    positions.forEach((position) =>
    {
        let x, y

        switch (position)
        {
            case "top-left":
                x = shape.x - halfSize
                y = shape.y - halfSize
                break
            case "top-right":
                x = shape.x + shape.width - halfSize
                y = shape.y - halfSize
                break
            case "bottom-left":
                x = shape.x - halfSize
                y = shape.y + shape.height - halfSize
                break
            case "bottom-right":
                x = shape.x + shape.width - halfSize
                y = shape.y + shape.height - halfSize
                break
            case "left":
                x = shape.x - halfSize
                y = shape.y + shape.height / 2 - halfSize
                break
            case "right":
                x = shape.x + shape.width - halfSize
                y = shape.y + shape.height / 2 - halfSize
                break
            case "top":
                x = shape.x + shape.width / 2 - halfSize
                y = shape.y - halfSize
                break
            case "bottom":
                x = shape.x + shape.width / 2 - halfSize
                y = shape.y + shape.height - halfSize
                break
        }

        handles.push({x, y, size, position})
    })

    return handles
}

export function pointInRect(pointX, pointY, rectX, rectY, rectWidth, rectHeight)
{
    return pointX >= rectX && pointX <= rectX + rectWidth && pointY >= rectY && pointY <= rectY + rectHeight
}

export function resizeRectangle(shape, mouseX, mouseY)
{
    const position = shape.resize_handle
    switch (position)
    {
        case "top-left":
            shape.width += shape.x - mouseX
            shape.height += shape.y - mouseY
            shape.x = mouseX
            shape.y = mouseY
            break
        case "top-right":
            shape.width = mouseX - shape.x
            shape.height += shape.y - mouseY
            shape.y = mouseY
            break
        case "bottom-left":
            shape.width += shape.x - mouseX
            shape.x = mouseX
            shape.height = mouseY - shape.y
            break
        case "bottom-right":
            shape.width = mouseX - shape.x
            shape.height = mouseY - shape.y
            break
        case "left":
            shape.width += shape.x - mouseX
            shape.x = mouseX
            break
        case "right":
            shape.width = mouseX - shape.x
            break
        case "top":
            shape.height += shape.y - mouseY
            shape.y = mouseY
            break
        case "bottom":
            shape.height = mouseY - shape.y
            break
    }

    if (shape.width < 0)
    {
        shape.x += shape.width
        shape.width = Math.abs(shape.width)
    }

    if (shape.height < 0)
    {
        shape.y += shape.height
        shape.height = Math.abs(shape.height)
    }
}

export function renderVectorData(vectorData, canvas)
{
    const ctx = canvas.getContext("2d", {willReadFrequently: true})
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    vectorData.forEach((shape) =>
    {
        if (shape.type === "anti-rectangle")
        {
            ctx.fillStyle = hexToRgba(shape.color || "#ff0000", 0.2)
            ctx.fillRect(shape.x, shape.y, shape.width, shape.height)

            ctx.strokeStyle = shape.color || "red"
            ctx.lineWidth = shape.lineWidth || 2
            ctx.strokeRect(shape.x, shape.y, shape.width, shape.height)

            const handles = getRectangleHandles(shape)
            handles.forEach((handle) =>
            {
                ctx.fillStyle = "blue"
                ctx.fillRect(handle.x, handle.y, handle.size, handle.size)
            })
        }
    })
}
