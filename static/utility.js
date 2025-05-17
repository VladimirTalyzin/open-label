function disable_button(button)
{
    if (typeof button == "object")
    {
        button.enabled = false
        const old_background = button.style.background
        button.style.background = "#AAAAAA"

        return {
            "enable_button": () =>
            {
                button.enabled = true
                button.style.background = old_background
            }
        }
    }
    else
    {
        return {
            "enable_button": () =>
            {
            }
        }
    }
}


function request(command, parameters, on_load, on_error, is_post, button)
{
    const url = "/" + command
    const disable_data = disable_button(button)

    const options =
    {
        method: is_post ? "POST" : "GET",
        cache: "no-store"
    }

    let final_url = url

    if (is_post)
    {
        const form_data = new FormData()
        if (parameters && typeof parameters === "object")
        {
            Object.keys(parameters).forEach(key =>
            {
                form_data.append(key, parameters[key])
            })
        }
        options.body = form_data
    }
    else
    {
        if (parameters && typeof parameters === "object")
        {
            const query = Object.keys(parameters)
                .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(parameters[key])}`)
                .join("&")
            final_url += "?" + query
        }
    }

    fetch(final_url, options).then(response =>
    {
        if (response.status === 200)
        {
            return response.json()
        }
        else
        {
            if (typeof on_error === "function")
            {
                on_error("HTTP status != 200")
            }

            throw new Error("HTTP status != 200")
        }
    })
    .then(data =>
    {
        if (typeof on_load === "function")
        {
            on_load(data)
        }
    })
    .catch(error =>
    {
        if (typeof on_error === "function")
        {
            on_error(error.message)
        }
    })
    .finally(() =>
    {
        disable_data.enable_button()
    })
}



function add_event_listener_with_id(element, event_type, listener_id, listener_function)
{
    if (!element.saved_event_listeners)
    {
        element.saved_event_listeners = {}
    }

    if (element.saved_event_listeners[listener_id])
    {
        const {event_type: prev_event_type, listener_function: prev_listener_function} = element.saved_event_listeners[listener_id]
        element.removeEventListener(prev_event_type, prev_listener_function)
    }

    element.addEventListener(event_type, listener_function)
    element.saved_event_listeners[listener_id] =
    {
        event_type: event_type,
        listener_function: listener_function
    }
}

function remove_event_listener_with_id(element, listener_id)
{
    if (element.saved_event_listeners && element.saved_event_listeners[listener_id])
    {
        const {event_type, listener_function} = element.saved_event_listeners[listener_id]
        element.removeEventListener(event_type, listener_function)
        delete element.saved_event_listeners[listener_id]

        return listener_function
    }

    return null
}


function update_text_input(text_input, error)
{
    text_input.style.borderColor = error ? "red" : "green"
    text_input.style.borderWidth = "3px"

    setTimeout(() =>
    {
        text_input.style.borderColor = ""
        text_input.style.borderWidth = ""
    }, 1000)
}

function set_value_listener(value_control, command, parameter_name, additional_parameters)
{
    const control = value_control
    const current_command = command
    const current_parameter_name = parameter_name
    const current_parameters = additional_parameters

    function get_value()
    {
        return control.tagName == "INPUT" ? control.value : control.innerHTML
    }

    function set_value(value)
    {
        if (control.tagName == "INPUT")
        {
            control.value = value
        }
        else
        {
            control.innerHTML = value
        }
    }

    add_event_listener_with_id(control, "focus", parameter_name + "_focus", () =>
    {
        control.dataset.previousValue = get_value()
    })

    add_event_listener_with_id(control, "blur", parameter_name + "_blur", () =>
    {
        if (get_value() !== control.dataset.previousValue)
        {
            current_parameters[current_parameter_name] = get_value()
            request(current_command, current_parameters, (response_json) =>
                {
                    if (response_json.result === "ok")
                    {
                        if (typeof response_json.value == "object" && response_json.value !== null)
                        {
                            set_value(JSON.stringify(response_json.value, null, 2))
                        }
                        else
                        {
                            set_value(response_json.value)
                        }
                        update_text_input(control)
                    }
                    else
                    {
                        console.log("Error updating command", current_command, ":", response_json)
                        update_text_input(control, true)
                    }
                },
                (error_text) =>
                {
                    console.log("Error:", error_text)
                }, true, control)
        }
    })
}

function active_label_color(labels, labelName)
{
    const label_data = labels.find((label) => label.label === labelName)
    if (!label_data)
    {
        return [255, 0, 0]
    }

    const hex_color = label_data.color
    const bigint = parseInt(hex_color.slice(1), 16)
    const red = (bigint >> 16) & 255
    const green = (bigint >> 8) & 255
    const blue = bigint & 255

    return [red, green, blue]
}

function update_canvas_zoom(full_image, canvas)
{
    canvas.style.width = full_image.style.width
    canvas.style.height = "auto"
    canvas.style.overflow = "hidden"
}

function activate_label(id_project, image_name, label, image_block, full_image, full_image_container, labels, clear_canvas_button,
                        on_activate = () => {}, on_error = (_) => {})
{
    const vector_data_url = `/get_vector_mask/${id_project}/${encodeURIComponent(image_name)}/${encodeURIComponent(label)}`

    fetch(vector_data_url, {cache: "no-store"})
        .then(response =>
        {
            if (response.status === 200)
            {
                return response.json()
            }
            else
            {
                on_error(response.statusText)
            }
        })
        .then(data =>
        {
            const vector_data = data["json-data"]
            const has_png_mask = data["has-png-mask"]

            if (vector_data)
            {
                let vector_canvas = get_vector_canvas(image_block, full_image, full_image_container)

                vector_canvas.setAttribute("vector_data", JSON.stringify(vector_data))

                render_vector_data(vector_data, vector_canvas)
            }

            if (has_png_mask)
            {
                const mask_url = `/get_png_mask/${id_project}/${encodeURIComponent(image_name)}/${encodeURIComponent(label)}`

                return fetch(mask_url, {cache: "no-store"})
                    .then(response =>
                    {
                        if (response.status === 200)
                        {
                            return response.blob()
                        }
                        else if (response.status === 204)
                        {
                            return null
                        }
                        else
                        {
                            on_error(response.statusText)
                        }
                    })
                    .then(async blob =>
                    {
                        if (blob)
                        {
                            const mask_url = URL.createObjectURL(await blob)
                            overlay_mask_on_image(image_block, full_image, full_image_container, mask_url, labels, label, false,
                                null, clear_canvas_button)
                        }
                    })
            }
        })
        .then(() =>
        {
            on_activate()
        })
        .catch(error =>
        {
            on_error(error)
        })
}


function check_unsave_and_save(image_block, save_button, id_project, image_name, label, on_after = () => {}, on_error = (_) => {})
{
    const vector_canvas = image_block.querySelector("canvas.vector-canvas")
    const png_canvas = image_block.querySelector("canvas.png-canvas")
    if (label !== null && label !== "" && (vector_canvas && vector_canvas.hasAttribute("unsaved"))
        || (png_canvas && png_canvas.hasAttribute("unsaved")))
    {
        save_label_data(id_project, image_name, label, image_block, on_after, on_error)
    }
    else
    {
        on_after()
    }
}


function save_label_data(id_project, image_name, label, image_block, on_save = () => {}, on_error = () => {}, type_save = "all")
{
    let savePromises = []

    const vector_canvas = image_block.querySelector("canvas.vector-canvas")
    if (vector_canvas && (type_save == "all" || type_save == "vector"))
    {
        const vector_data = vector_canvas.getAttribute("vector_data")

        if (vector_data && vector_data.length > 0)
        {
            const form_data = new FormData()
            form_data.append("json_data", vector_data)

            const vectorSavePromise = fetch(`/upload_vector_mask/${id_project}/${encodeURIComponent(image_name)}/${encodeURIComponent(label)}`, {
                method: "POST",
                body: form_data
            })
                .then(response => response.json())
                .then(data =>
                {
                    if (data.result === "ok")
                    {
                        resolve()
                    }
                    else
                    {
                        on_error(new Error(data.message))
                    }
                })
                .catch(error =>
                {
                    on_error(error)
                })

            savePromises.push(vectorSavePromise)
        }
    }

    const png_canvas = image_block.querySelector("canvas.png-canvas")
    if (png_canvas && (type_save == "all" || type_save == "png"))
    {
        const pngSavePromise = new Promise((resolve, reject) =>
        {
            png_canvas.toBlob(blob =>
            {
                if (blob)
                {
                    const form_data = new FormData()
                    form_data.append("image", blob, "mask.png")

                    fetch(`/upload_png_mask/${id_project}/${encodeURIComponent(image_name)}/${encodeURIComponent(label)}`, {
                        method: "POST",
                        body: form_data
                    })
                        .then(response => response.json())
                        .then(data =>
                        {
                            if (data.result === "ok")
                            {
                                console.log(data.message)
                            }
                            else
                            {
                                reject(new Error(data.message))
                            }
                            resolve()
                        })
                        .catch(error =>
                        {
                            reject(error)
                        })
                }
                else
                {
                    resolve()
                }
            }, "image/png")
        })

        savePromises.push(pngSavePromise)
    }

    if (savePromises.length === 0)
    {
        on_save()
        return
    }

    Promise.all(savePromises)
        .then(() =>
        {
            on_save()
        })
        .catch(error =>
        {
            console.error("One of the saves failed:", error)
            on_error(error)
        })
}


function set_png_canvas_unsaved(png_canvas, save_button, clear_canvas_button)
{
    png_canvas.setAttribute("unsaved", "true")

    if (save_button)
    {
        save_button.disabled = false
    }

    if (clear_canvas_button)
    {
        clear_canvas_button.disabled = false
    }
}

function get_png_canvas(image_block, full_image, full_image_container, with_create = true)
{
    let png_canvas = image_block.querySelector("canvas.png-canvas")

    if (with_create && !png_canvas)
    {
        png_canvas = document.createElement("canvas")
        png_canvas.classList.add("png-canvas")
        png_canvas.width = full_image.naturalWidth
        png_canvas.height = full_image.naturalHeight
        png_canvas.style.position = "absolute"
        png_canvas.style.top = "0"
        png_canvas.style.left = "0"
        png_canvas.style.pointerEvents = "none"
        image_block.style.position = "relative"
        update_canvas_zoom(full_image, png_canvas)
        full_image_container.appendChild(png_canvas)
    }
    return png_canvas
}

function get_vector_canvas(image_block, full_image, full_image_container, with_create = true)
{
    let vector_canvas = image_block.querySelector("canvas.vector-canvas")

    if (with_create && !vector_canvas)
    {
        vector_canvas = document.createElement("canvas")
        vector_canvas.classList.add("vector-canvas")
        vector_canvas.width = full_image.naturalWidth
        vector_canvas.height = full_image.naturalHeight
        vector_canvas.style.position = "absolute"
        vector_canvas.style.top = "0"
        vector_canvas.style.left = "0"
        vector_canvas.style.pointerEvents = "none"
        image_block.style.position = "relative"
        update_canvas_zoom(full_image, vector_canvas)
        full_image_container.appendChild(vector_canvas)
    }
    return vector_canvas
}

function get_active_label(image_div, on_label, on_error = (error) => alert(error))
{
    const active_label = image_div.getAttribute("active_label")
    if (active_label)
    {
        if (typeof on_label == "function")
        {
            on_label(active_label)
        }
    }
    else
    {
        if (typeof on_error == "function")
        {
            on_error("Please select a label.")
        }
    }
}

function get_color(label, labels, default_color = "#ff0000")
{
    const labelObject = labels.find(label_object => label_object.label === label)
    return labelObject ? labelObject.color : default_color
}

function predict_objects(project, active_label, image_div, image_block, full_image, full_image_container, save_button, clear_canvas_button,
                         crop_area = null, on_predict = () => {}, on_error = (error) => alert(error))
{
    let prediction_url

    if (crop_area === null)
    {
        prediction_url = `/predict/${project.id_project}/${active_label}`
    }
    else
    {
        const {x, y, width, height} = crop_area
        prediction_url = `/predict_with_crop/${project.id_project}/${active_label}?x=${x}&y=${y}&width=${width}&height=${height}`
    }

    const image_url = full_image.src

    fetch(image_url)
        .then(response => response.blob())
        .then(blob =>
        {
            const form_data = new FormData()
            const fileName = "full_image.png"
            form_data.append("file", blob, fileName)

            return fetch(prediction_url, {
                method: "POST",
                body: form_data
            })
        })
        .then(response =>
        {
            if (!response.ok)
            {
                const error = new Error("Prediction API returned an error.")
                on_error(error.message)
                throw error
            }
            return response.blob()
        })
        .then(blob =>
        {
            const mask_url = URL.createObjectURL(blob)
            overlay_mask_on_image(
                image_block,
                full_image,
                full_image_container,
                mask_url,
                project.labels,
                active_label,
                true,
                save_button,
                clear_canvas_button
            )

            on_predict()
        })
        .catch(error =>
        {
            on_error("Error during prediction:" + error)
        })
}


function overlay_mask_on_image(
    image_block,
    full_image,
    full_image_container,
    maskUrl,
    labels,
    activeLabel,
    is_new_data,
    save_button,
    clear_canvas_button
)
{
    const png_canvas = get_png_canvas(image_block, full_image, full_image_container)
    const canvas_context = png_canvas.getContext("2d", {willReadFrequently: true})

    const mask_image = new Image()

    mask_image.crossOrigin = "Anonymous"
    mask_image.onload = () =>
    {
        const temp_canvas = document.createElement("canvas")
        temp_canvas.width = png_canvas.width
        temp_canvas.height = png_canvas.height
        const temp_canvas_context = temp_canvas.getContext("2d", {willReadFrequently: true})
        temp_canvas_context.drawImage(mask_image, 0, 0, png_canvas.width, png_canvas.height)

        const mask_data = temp_canvas_context.getImageData(0, 0, png_canvas.width, png_canvas.height)
        const image_data = canvas_context.getImageData(0, 0, png_canvas.width, png_canvas.height)

        const color = active_label_color(labels, activeLabel)

        const data = image_data.data
        const mask = mask_data.data

        for (let indexMaskBits = 0; indexMaskBits < mask.length; indexMaskBits += 4)
        {
            if (mask[indexMaskBits] > 200 && mask[indexMaskBits + 1] > 200 && mask[indexMaskBits + 2] > 200)
            {
                data[indexMaskBits] = color[0]     // Red
                data[indexMaskBits + 1] = color[1] // Green
                data[indexMaskBits + 2] = color[2] // Blue
                data[indexMaskBits + 3] = 200      // Alpha (0-255)
            }
        }

        canvas_context.putImageData(image_data, 0, 0)

        if (is_new_data)
        {
            set_png_canvas_unsaved(png_canvas, save_button, clear_canvas_button)
        }
        else
        {
            clear_canvas_button.disabled = false
        }

        URL.revokeObjectURL(maskUrl)
    }

    mask_image.src = maskUrl
}

function render_vector_data(vector_data, canvas)
{
    const canvas_context = canvas.getContext("2d", {willReadFrequently: true})

    canvas_context.clearRect(0, 0, canvas.width, canvas.height)

    vector_data.forEach(shape =>
    {
        if (shape.type === "anti-rectangle")
        {
            canvas_context.fillStyle = hex_to_rgba(shape.color || "#ff0000", 0.2)
            canvas_context.fillRect(shape.x, shape.y, shape.width, shape.height)

            canvas_context.strokeStyle = shape.color || "red"
            canvas_context.lineWidth = shape.lineWidth || 2
            canvas_context.strokeRect(shape.x, shape.y, shape.width, shape.height)

            const handles = get_rectangle_handles(shape)
            handles.forEach(handle =>
            {
                canvas_context.fillStyle = "blue"
                canvas_context.fillRect(handle.x, handle.y, handle.size, handle.size)
            })
        }
    })
}

function get_rectangle_handles(shape)
{
    const size = 10
    const half_size = size / 2

    const handles = []

    const positions = ["top-left", "top-right", "bottom-left", "bottom-right", "left", "right", "top", "bottom"]

    positions.forEach(position =>
    {
        let x
        let y

        switch (position)
        {
            case "top-left":
                x = shape.x - half_size
                y = shape.y - half_size
                break
            case "top-right":
                x = shape.x + shape.width - half_size
                y = shape.y - half_size
                break
            case "bottom-left":
                x = shape.x - half_size
                y = shape.y + shape.height - half_size
                break
            case "bottom-right":
                x = shape.x + shape.width - half_size
                y = shape.y + shape.height - half_size
                break
            case "left":
                x = shape.x - half_size
                y = shape.y + shape.height / 2 - half_size
                break
            case "right":
                x = shape.x + shape.width - half_size
                y = shape.y + shape.height / 2 - half_size
                break
            case "top":
                x = shape.x + shape.width / 2 - half_size
                y = shape.y - half_size
                break
            case "bottom":
                x = shape.x + shape.width / 2 - half_size
                y = shape.y + shape.height - half_size
                break
        }

        handles.push({x: x, y: y, size: size, position: position})
    })

    return handles
}

function point_in_rect(point_x, point_y, rect_x, rect_y, rect_width, rect_height)
{
    return point_x >= rect_x && point_x <= rect_x + rect_width && point_y >= rect_y && point_y <= rect_y + rect_height
}

function resize_rectangle(shape, mouse_x, mouse_y)
{
    const position = shape.resize_handle
    switch (position)
    {
        case "top-left":
            shape.width += shape.x - mouse_x
            shape.height += shape.y - mouse_y
            shape.x = mouse_x
            shape.y = mouse_y
            break
        case "top-right":
            shape.width = mouse_x - shape.x
            shape.height += shape.y - mouse_y
            shape.y = mouse_y
            break
        case "bottom-left":
            shape.width += shape.x - mouse_x
            shape.x = mouse_x
            shape.height = mouse_y - shape.y
            break
        case "bottom-right":
            shape.width = mouse_x - shape.x
            shape.height = mouse_y - shape.y
            break
        case "left":
            shape.width += shape.x - mouse_x
            shape.x = mouse_x
            break
        case "right":
            shape.width = mouse_x - shape.x
            break
        case "top":
            shape.height += shape.y - mouse_y
            shape.y = mouse_y
            break
        case "bottom":
            shape.height = mouse_y - shape.y
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

function activate_canvas(png_canvas, vector_canvas, activate_png)
{
    if (png_canvas)
    {
        if (activate_png)
        {
            png_canvas.style.pointerEvents = null
            png_canvas.style.zIndex = "1000"
        }
        else
        {
            png_canvas.style.pointerEvents = "none"
            png_canvas.style.zIndex = "100"
        }
    }

    if (vector_canvas)
    {
        if (activate_png)
        {
            vector_canvas.style.pointerEvents = "none"
            vector_canvas.style.zIndex = "100"
        }
        else
        {
            vector_canvas.style.pointerEvents = null
            vector_canvas.style.zIndex = "1000"
        }
    }
}

function to_percentage(value, total)
{
    if (total === 0)
    {
        return "0.0000%"
    }
    return ((value / total) * 100).toFixed(4) + "%"
}

function clear_canvas(png_canvas)
{
    const png_canvas_context = png_canvas.getContext("2d", {willReadFrequently: true})
    png_canvas_context.clearRect(0, 0, png_canvas.width, png_canvas.height)
}

function hex_to_rgba(hex, alpha)
{
    hex = hex.replace("#", "")

    let red
    let green
    let blue

    if (hex.length === 3)
    {
        red   = parseInt(hex[0] + hex[0], 16)
        green = parseInt(hex[1] + hex[1], 16)
        blue  = parseInt(hex[2] + hex[2], 16)
    }
    else if (hex.length === 6)
    {
        red   = parseInt(hex.substring(0, 2), 16)
        green = parseInt(hex.substring(2, 4), 16)
        blue  = parseInt(hex.substring(4, 6), 16)
    }
    else
    {
        throw new Error("Incorrect HEX color format #rrggbb")
    }

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function hide_label_buttons(buttons, except_label, hide)
{
    buttons.map((button) =>
    {
        if (button.getAttribute("label") !== except_label)
        {
            button.style.display = hide ? "none" : null
        }
    })
}

function block_buttons_function(buttons, current_button, listener_id = null, on_unset = () => {})
{
    const active_button = current_button
    const active_unset = on_unset
    const current_listener_id = listener_id
    const current_buttons = buttons

    const enable_button = (button) =>
    {
        button.style.pointerEvents = null
        button.disabled = false
    }

    const disable_button = (button) =>
    {
        button.style.pointerEvents = "none"
        button.disabled = true
    }

    current_buttons.map((array_button) =>
    {
        const button = array_button
        if (active_button == null || button === active_button)
        {
            enable_button(button)

            if (button === active_button)
            {
                button.style.border = "1pt solid gray"

                let current_button_listener = null

                if (current_listener_id != null)
                {
                    current_button_listener = remove_event_listener_with_id(active_button, current_listener_id)
                }

                add_event_listener_with_id(active_button, "click", "active_button_unset", () =>
                {
                    current_buttons.map((button) =>
                    {
                        enable_button(button)
                    })

                    remove_event_listener_with_id(active_button, "active_button_unset")

                    if (current_button_listener)
                    {
                        add_event_listener_with_id(active_button, "click", current_listener_id, current_button_listener)
                    }

                    active_unset()
                })
            }
            else
            {
                button.style.border = null
            }
        }
        else
        {
            disable_button(button)
        }
    })
}

function get_initial_slider_value(button, attribute_name, default_value = "10")
{
    return button.getAttribute(attribute_name) || default_value
}

function set_slider_value(button, attribute_name, value)
{
    button.setAttribute(attribute_name, value.toString())
}