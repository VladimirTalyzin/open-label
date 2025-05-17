// noinspection JSUnusedGlobalSymbols
function update_project(id_project)
{
    request(`get_project_data/${id_project}`, null, (response_json) =>
    {
        update_projects({projects: [response_json]})
    })
}

function update_projects(response_json, clear)
{
    const projects_container = document.getElementById("projects-container")

    if (clear)
    {
        projects_container.innerHTML = ""
    }
    // noinspection JSUnresolvedReference
    for (const project of response_json.projects)
    {
        const project_id = `project_${project.id_project}`
        const old_project_div = document.getElementById(project_id)
        const project_div = old_project_div == null ? document.createElement("div") : old_project_div
        // noinspection JSUnresolvedReference
        const images_width = project.images_width.toString() + "px"

        if (old_project_div == null)
        {
            project_div.id = project_id
            project_div.classList.add("row", "mb-3")
        }
        else
        {
            project_div.innerHTML = ""
        }

        const project_card = document.createElement("div")
        project_card.classList.add("col-md-12")
        project_card.classList.add("card")

        const project_card_body = document.createElement("div")
        project_card_body.classList.add("card-body")

        const project_uuid = document.createElement("small")
        project_uuid.textContent = project.id

        const project_name_input = document.createElement("input")
        project_name_input.type = "text"
        project_name_input.value = project.hasOwnProperty("project_name") ? project.project_name : ""
        project_name_input.placeholder = "Please enter project name"
        project_name_input.classList.add("form-control")
        project_name_input.classList.add("project-name")

        set_value_listener(project_name_input, "set_project_name", "project_name", {id_project: project.id_project})

        const images_count = document.createElement("p")
        images_count.textContent = "Images count: "

        const images_count_span = document.createElement("span")
        // noinspection JSUnresolvedReference
        images_count_span.textContent = project.images_count

        images_count.appendChild(images_count_span)

        const project_buttons = document.createElement("div")
        project_buttons.classList.add("btn-group", "mt-2")

        const images_button = document.createElement("button")
        images_button.classList.add("btn", "btn-secondary")
        images_button.textContent = "Images"
        images_button.dataset.target = "project-images"

        const labels_button = document.createElement("button")
        labels_button.classList.add("btn", "btn-secondary")
        labels_button.textContent = "Labels"
        labels_button.dataset.target = "project-labels"

        const settings_button = document.createElement("button")
        settings_button.classList.add("btn", "btn-secondary")
        settings_button.textContent = "Settings"
        settings_button.dataset.target = "project-settings"

        const images_div = document.createElement("div")
        images_div.classList.add("mt-2", "container-fluid")
        images_div.id = "project-images"
        images_div.style.display = "none"

        const labels_div = document.createElement("div")
        labels_div.classList.add("mt-2")
        labels_div.classList.add("col-md-12")
        labels_div.id = "project-labels"
        labels_div.style.display = "none"

        const labels_text_area = document.createElement("div")
        labels_text_area.contentEditable = "true"
        labels_text_area.style.whiteSpace = "pre"
        labels_text_area.classList.add("form-control")
        labels_text_area.classList.add("project-labels")
        labels_text_area.placeholder = "Enter labels here (Open-Label JSON or LabelStudio XML)"

        if (project.labels)
        {
            labels_text_area.innerHTML = JSON.stringify(project.labels, null, 2)
        }

        labels_text_area.style.height = "auto"

        labels_div.appendChild(labels_text_area)

        set_value_listener(labels_text_area, "set_project_labels", "labels", {id_project: project.id_project})

        const settings_div = document.createElement("div")
        settings_div.classList.add("mt-2", "col-md-12", "text-center")
        settings_div.id = "project-settings"
        settings_div.style.display = "none"


        const prediction_url_input = document.createElement("input")
        prediction_url_input.type = "text"
        prediction_url_input.value = project.hasOwnProperty("prediction_url") ? project.prediction_url : ""
        prediction_url_input.placeholder = "Please enter prediction url, like https://my-prediction.com/predict/{label}"
        prediction_url_input.classList.add("form-control", "project-name", "mb-3")

        set_value_listener(prediction_url_input, "set_prediction_url", "prediction_url", {id_project: project.id_project})
        settings_div.appendChild(prediction_url_input)


        const delete_button = document.createElement("button")
        delete_button.classList.add("btn", "btn-danger", "mb-4")
        delete_button.textContent = "Delete project"
        delete_button.dataset.target = "project-delete"

        add_event_listener_with_id(delete_button, "click", "delete_click", () =>
        {
            const confirm_delete = confirm("Are you sure you want to delete this project?")
            if (confirm_delete)
            {
                request(`delete_project/${project.id_project}`, null, (response_json) =>
                {
                    if (response_json.hasOwnProperty("result") && response_json["result"] == "ok")
                    {
                        project_div.remove()
                    }
                    else
                    {
                        console.log(response_json)
                    }
                })
            }
        })

        settings_div.appendChild(delete_button)

        project_card_body.appendChild(project_uuid)
        project_card_body.appendChild(project_name_input)
        project_card_body.appendChild(images_count)
        project_buttons.appendChild(images_button)
        project_buttons.appendChild(labels_button)
        project_buttons.appendChild(settings_button)
        project_card.appendChild(project_card_body)
        project_card.appendChild(project_buttons)
        project_div.appendChild(project_card)
        project_div.appendChild(images_div)
        project_div.appendChild(labels_div)
        project_div.appendChild(settings_div)
        projects_container.appendChild(project_div)

        const show_content = (current_block, on_first_open = null, on_open = null) =>
        {
            const is_open = current_block.style.display == "block"

            images_div.style.display = "none"
            labels_div.style.display = "none"
            settings_div.style.display = "none"

            if (!is_open)
            {
                if (!current_block.hasAttribute("opened"))
                {
                    current_block.setAttribute("opened", "true")
                    if (typeof on_first_open == "function")
                    {
                        on_first_open()
                    }
                }

                if (typeof on_open == "function")
                {
                    on_open()
                }

                current_block.style.display = "block"
            }
        }

        add_event_listener_with_id(images_button, "click", "show_images",() =>
            show_content(images_div, () => request(`get_images_list/${project.id_project}`,
                null, (response_json) =>
                {
                    images_div.innerHTML = ""

                    const images_list_div = document.createElement("div")
                    images_list_div.classList.add("row", "container-fluid")

                    const preview_file = response_json.hasOwnProperty("preview_file") ? response_json.preview_file : null

                    const prepare_image = (image_object, image_data, previewFile) =>
                    {
                        image_object.style.backgroundImage = `url(${previewFile})`
                        // noinspection JSUnresolvedReference
                        image_object.style.backgroundPosition = `0px -${image_data.accumulated_height}px`
                        image_object.style.backgroundRepeat = "no-repeat"
                        // noinspection JSUnresolvedReference
                        image_object.style.height = `${image_data.preview_height}px`

                        image_object.style.width = images_width
                        image_object.style.borderRadius = "2.5pt"
                        image_object.style.marginTop = "2.5pt"
                        image_object.style.marginLeft = "2.5pt"

                        image_object.style.border = "none"
                    }

                    const add_image = (imageVariable, previewFileVariable) =>
                    {
                        const image = imageVariable
                        const preview_file = previewFileVariable
                        const image_div = document.createElement("div")
                        image_div.classList.add("card", "mb-2")
                        image_div.style.width = `calc(${images_width} + 6.5pt)`
                        image_div.style.marginRight = "2.5pt"

                        const image_block = document.createElement("div")
                        prepare_image(image_block, image, preview_file)
                        image_block.classList.add("card-img-top")

                        const image_card_body = document.createElement("div")
                        image_card_body.classList.add("card-body")
                        image_card_body.style.paddingLeft = "2.5pt"
                        image_card_body.style.paddingRight = "0"
                        image_card_body.style.width = "94%"

                        const image_title = document.createElement("div")
                        image_title.classList.add("card-title", "d-flex", "justify-content-between", "align-items-center")
                        image_title.textContent = image.image
                        image_title.style.width = "100%"

                        const image_time = document.createElement("div")
                        image_time.classList.add("card-text")
                        image_time.textContent = image.time

                        const delete_button = document.createElement("button")
                        delete_button.classList.add("btn", "btn-sm")
                        delete_button.innerHTML = "🗑️"

                        add_event_listener_with_id(delete_button, "click", "delete_image",() =>
                        {
                            const confirm_delete = confirm("Are you sure you want to delete this image?")
                            if (confirm_delete)
                            {
                                request(`delete_image`,
                                    {id_project: project.id_project, image_name: image.image}, (response) =>
                                    {
                                        if (response.hasOwnProperty("result") && response.result == "ok")
                                        {
                                            image_div.remove()
                                            images_count_span.innerHTML = (Math.max(parseInt(images_count_span.innerHTML) - 1, 0)).toString()
                                        }
                                        else
                                        {
                                            alert(response)
                                        }
                                    }, null, true, delete_button)
                            }
                        })

                        image_time.appendChild(delete_button)

                        image_card_body.appendChild(image_title)
                        image_card_body.appendChild(image_time)
                        image_div.appendChild(image_block)
                        image_div.appendChild(image_card_body)
                        images_list_div.appendChild(image_div)

                        add_event_listener_with_id(image_block, "click", "show_full_image", () =>
                        {
                            if (image_div.classList.contains("expanded"))
                            {
                                return
                            }

                            image_div.classList.add("expanded")
                            image_div.style.width = "100%"
                            image_div.style.marginRight = "0"
                            image_div.style.position = "relative"

                            image_block.innerHTML = ""
                            image_block.style.backgroundImage = "none"
                            image_block.style.height = "auto"
                            image_block.style.width = "100%"
                            image_block.style.margin = "0"
                            image_block.style.border = "1px solid #ccc"

                            const full_image_container = document.createElement("div")
                            full_image_container.style.width = "100%"
                            full_image_container.style.height = "auto"
                            full_image_container.style.maxHeight = "80vh"
                            full_image_container.style.overflow = "auto"
                            full_image_container.style.position = "relative"

                            const full_image = document.createElement("img")
                            full_image.src = `/image/${project.id_project}/${image.image}`
                            full_image.style.width = "100%"
                            full_image.style.height = "auto"
                            full_image.zoom_level = 100

                            full_image_container.appendChild(full_image)
                            image_block.appendChild(full_image_container)

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

                            const block_buttons = (current_button, current_listener_id = null, on_unset = () => {}) =>
                                block_buttons_function(buttons, current_button, current_listener_id, on_unset)

                            const zoom_in_button = document.createElement("button")
                            zoom_in_button.classList.add("btn", "btn-sm", "btn-secondary", "mr-1")
                            zoom_in_button.textContent = "🔍️➕"

                            const zoom_out_button = document.createElement("button")
                            zoom_out_button.classList.add("btn", "btn-sm", "btn-secondary", "mr-4")
                            zoom_out_button.textContent = "🔍️➖"


                            const save_button = document.createElement("button")
                            save_button.classList.add("btn", "btn-sm", "btn-secondary", "ml-3")
                            save_button.textContent = "💾"
                            save_button.disabled = true
                            save_button.title = "Auto-save enabled"

                            let interval_id = null

                            const handle_save = () =>
                            {
                                if (!images_div || !document.body.contains(images_div))
                                {
                                    clearInterval(interval_id)
                                }
                                else if (image_div.hasAttribute("active_label"))
                                {
                                    const label = image_div.getAttribute("active_label")

                                    if (label !== "")
                                    {
                                        check_unsave_and_save(
                                            image_block,
                                            save_button,
                                            project.id_project,
                                            image.image,
                                            label,
                                            () =>
                                            {
                                                save_button.disabled = true
                                            },
                                            (error) =>
                                            {
                                                alert(error)
                                            }
                                        )
                                    }
                                }
                            }

                            add_event_listener_with_id(save_button, "click", "save_masks", handle_save)

                            const checkAndSave = () =>
                            {
                                if (!save_button.disabled)
                                {
                                    handle_save()
                                }
                            }

                            interval_id = setInterval(checkAndSave, 15000)

                            const clear_canvas_button = document.createElement("button")
                            clear_canvas_button.classList.add("btn", "btn-sm", "btn-secondary", "ml-3")
                            clear_canvas_button.textContent = "⎚"
                            clear_canvas_button.disabled = true
                            clear_canvas_button.title = "Clear canvas"
                            add_event_listener_with_id(clear_canvas_button, "click", "clear_canvas", () =>
                            {
                                const png_canvas = get_png_canvas(image_block, full_image, full_image_container)
                                if (png_canvas)
                                {
                                    clear_canvas(png_canvas)
                                    set_png_canvas_unsaved(png_canvas, save_button, clear_canvas_button)
                                }
                            })

                            function get_mouse_coordinates_canvas(event, canvas)
                            {
                                const rect_bounds = canvas.getBoundingClientRect()
                                const scaleX = canvas.width / rect_bounds.width
                                const scaleY = canvas.height / rect_bounds.height

                                const mouse_x = (event.clientX - rect_bounds.left) * scaleX
                                const mouse_y = (event.clientY - rect_bounds.top) * scaleY

                                return {mouse_x, mouse_y}
                            }

                            function draw_connection(canvas_context, x, y, size, color, prev_x = null, prev_y = null)
                            {
                                if (prev_x !== null && prev_y !== null)
                                {
                                    const dx = x - prev_x
                                    const dy = y - prev_y
                                    const length = Math.sqrt(dx * dx + dy * dy)
                                    const angle = Math.atan2(dy, dx)

                                    canvas_context.save()
                                    canvas_context.translate(prev_x, prev_y)
                                    canvas_context.rotate(angle)

                                    if (color)
                                    {
                                        canvas_context.fillStyle = color
                                    }

                                    canvas_context.beginPath()
                                    canvas_context.rect(0, -size, length, size * 2)
                                    canvas_context.fill()
                                    canvas_context.restore()
                                }
                            }

                            function paint_circle(canvas_context, x, y, size, color, prev_x = null, prev_y = null)
                            {
                                draw_connection(canvas_context, x, y, size, color, prev_x, prev_y)

                                canvas_context.beginPath()
                                canvas_context.arc(x, y, size, 0, 2 * Math.PI, false)
                                canvas_context.fillStyle = color
                                canvas_context.fill()
                            }

                            function erase_circle(canvas_context, x, y, size, prev_x = null, prev_y = null)
                            {
                                const prevOp = canvas_context.globalCompositeOperation
                                canvas_context.globalCompositeOperation = "destination-out"

                                draw_connection(canvas_context, x, y, size, null, prev_x, prev_y)

                                canvas_context.beginPath()
                                canvas_context.arc(x, y, size, 0, 2 * Math.PI, false)
                                canvas_context.fill()

                                canvas_context.globalCompositeOperation = prevOp
                            }


                            const brush_button = document.createElement("button")
                            brush_button.classList.add("btn", "btn-sm", "btn-secondary", "mr-1")
                            brush_button.innerHTML = "🖌️"
                            add_event_listener_with_id(brush_button, "click", "brush_mode", () =>
                            {
                                get_active_label(image_div, (active_label) =>
                                {
                                    const label_color = get_color(active_label, project.labels)
                                    const vector_canvas = get_vector_canvas(image_block, full_image, full_image_container, true)
                                    const png_canvas = get_png_canvas(image_block, full_image, full_image_container, false)

                                    let brush_slider = document.getElementById("brush_slider")

                                    block_buttons(brush_button, "brush_mode", () =>
                                    {
                                        brush_slider.remove()
                                        hide_label_buttons(label_buttons, active_label, false)

                                        remove_event_listener_with_id(png_canvas, "brush_mouse_down")
                                        remove_event_listener_with_id(png_canvas, "brush_mouse_move")
                                        remove_event_listener_with_id(png_canvas, "brush_mouse_up")
                                    })

                                    hide_label_buttons(label_buttons, active_label, true)

                                    activate_canvas(png_canvas, vector_canvas, true)

                                    const get_mouse_coordinates = (event) =>
                                            get_mouse_coordinates_canvas(event, png_canvas)

                                    if (!brush_slider)
                                    {
                                        brush_slider = document.createElement("input")
                                        brush_slider.type = "range"
                                        brush_slider.min = "1"
                                        brush_slider.max = "50"
                                        brush_slider.value = get_initial_slider_value(brush_button, "data-brush-size", "10")
                                        brush_slider.title = "Brush size"
                                        brush_slider.id = "brush_slider"
                                        brush_slider.className = "mr-1"
                                        brush_button.parentNode.insertBefore(brush_slider, brush_button.nextSibling)
                                    }

                                    let is_painting = false
                                    let brush_size = parseInt(brush_slider.value, 10)

                                    brush_slider.addEventListener("input", () =>
                                    {
                                        brush_size = parseInt(brush_slider.value, 10)

                                        set_slider_value(brush_button, "data-brush-size", brush_size)
                                    })

                                    const canvas_context = png_canvas.getContext("2d")

                                    let prev_mouse_x = null
                                    let prev_mouse_y = null

                                    function on_mouse_down(event)
                                    {
                                        const {mouse_x, mouse_y} = get_mouse_coordinates(event)
                                        is_painting = true

                                        prev_mouse_x = mouse_x
                                        prev_mouse_y = mouse_y
                                        paint_circle(canvas_context, mouse_x, mouse_y, brush_size, label_color)
                                    }

                                    function on_mouse_move(event)
                                    {
                                        if (!is_painting)
                                        {
                                            return
                                        }

                                        const {mouse_x, mouse_y} = get_mouse_coordinates(event)

                                        paint_circle(canvas_context, mouse_x, mouse_y, brush_size, label_color, prev_mouse_x, prev_mouse_y)
                                        prev_mouse_x = mouse_x
                                        prev_mouse_y = mouse_y
                                    }

                                    function on_mouse_up()
                                    {
                                        is_painting = false

                                        prev_mouse_x = null
                                        prev_mouse_y = null
                                        save_label_data(project.id_project, image.image, active_label, image_block,
                                            () => {}, () => {}, "png")
                                    }

                                    add_event_listener_with_id(png_canvas, "mousedown", "brush_mouse_down", on_mouse_down)
                                    add_event_listener_with_id(png_canvas, "mousemove", "brush_mouse_move", on_mouse_move)
                                    add_event_listener_with_id(png_canvas, "mouseup", "brush_mouse_up", on_mouse_up)
                                })
                            })

                            const eraser_button = document.createElement("button")
                            eraser_button.classList.add("btn", "btn-sm", "btn-secondary", "mr-1")
                            eraser_button.innerHTML = "🧽"
                            add_event_listener_with_id(eraser_button, "click", "eraser_mode", () =>
                            {
                                get_active_label(image_div, (active_label) =>
                                {
                                    const vector_canvas = get_vector_canvas(image_block, full_image, full_image_container, true)
                                    const png_canvas = get_png_canvas(image_block, full_image, full_image_container, false)

                                    let eraser_slider = document.getElementById("eraser_slider")

                                    block_buttons(eraser_button, "eraser_mode", () =>
                                    {
                                        eraser_slider.remove()
                                        hide_label_buttons(label_buttons, active_label, false)

                                        remove_event_listener_with_id(png_canvas, "eraser_mouse_down")
                                        remove_event_listener_with_id(png_canvas, "eraser_mouse_move")
                                        remove_event_listener_with_id(png_canvas, "eraser_mouse_up")
                                    })

                                    hide_label_buttons(label_buttons, active_label, true)

                                    activate_canvas(png_canvas, vector_canvas, true)

                                    const get_mouse_coordinates = (event) =>
                                            get_mouse_coordinates_canvas(event, png_canvas)

                                    if (!eraser_slider)
                                    {
                                        eraser_slider = document.createElement("input")
                                        eraser_slider.type = "range"
                                        eraser_slider.min = "1"
                                        eraser_slider.max = "50"
                                        eraser_slider.value = get_initial_slider_value(eraser_button, "data-eraser-size", "10")
                                        eraser_slider.title = "Eraser size"
                                        eraser_slider.id = "eraser_slider"
                                        eraser_slider.className = "mr-1"
                                        eraser_button.parentNode.insertBefore(eraser_slider, eraser_button.nextSibling)
                                    }

                                    let is_erasing = false
                                    let eraser_size = parseInt(eraser_slider.value, 10)

                                    eraser_slider.addEventListener("input", () =>
                                    {
                                        eraser_size = parseInt(eraser_slider.value, 10)
                                        set_slider_value(eraser_button, "data-eraser-size", eraser_size)
                                    })

                                    const canvas_context = png_canvas.getContext("2d")

                                    let prev_mouse_x = null
                                    let prev_mouse_y = null

                                    function on_mouse_down(event)
                                    {
                                        const {mouse_x, mouse_y} = get_mouse_coordinates(event)
                                        is_erasing = true

                                        prev_mouse_x = mouse_x
                                        prev_mouse_y = mouse_y
                                        erase_circle(canvas_context, mouse_x, mouse_y, eraser_size)
                                    }

                                    function on_mouse_move(event)
                                    {
                                        if (!is_erasing)
                                        {
                                            return
                                        }

                                        const {mouse_x, mouse_y} = get_mouse_coordinates(event)

                                        erase_circle(canvas_context, mouse_x, mouse_y, eraser_size, prev_mouse_x, prev_mouse_y)
                                        prev_mouse_x = mouse_x
                                        prev_mouse_y = mouse_y
                                    }

                                    function on_mouse_up()
                                    {
                                        is_erasing = false

                                        prev_mouse_x = null
                                        prev_mouse_y = null
                                        save_label_data(project.id_project, image.image, active_label, image_block,
                                            () => {}, () => {}, "png")
                                    }

                                    add_event_listener_with_id(png_canvas, "mousedown", "eraser_mouse_down", on_mouse_down)
                                    add_event_listener_with_id(png_canvas, "mousemove", "eraser_mouse_move", on_mouse_move)
                                    add_event_listener_with_id(png_canvas, "mouseup", "eraser_mouse_up", on_mouse_up)
                                })
                            })


                            const anti_label_button = document.createElement("button")
                            anti_label_button.classList.add("btn", "btn-sm", "btn-secondary", "mr-4")
                            anti_label_button.innerHTML = "🚫"
                            anti_label_button.title = "AntiLabel"
                            add_event_listener_with_id(anti_label_button, "click", "anti_label_mode", () =>
                                get_active_label(image_div, (active_label) =>
                                {
                                    const label_color = get_color(active_label, project.labels)
                                    const vector_canvas = get_vector_canvas(image_block, full_image, full_image_container, true)
                                    const png_canvas    = get_png_canvas(image_block, full_image, full_image_container, false)

                                    block_buttons(anti_label_button, "anti_label_mode", () =>
                                    {
                                        remove_event_listener_with_id(vector_canvas, "anti_label_mouse_down")
                                        remove_event_listener_with_id(vector_canvas, "anti_label_mouse_move")
                                        remove_event_listener_with_id(vector_canvas, "anti_label_mouse_up")
                                        remove_event_listener_with_id(vector_canvas, "anti_label_double_click")
                                    })

                                    activate_canvas(png_canvas, vector_canvas, false)

                                    if (vector_canvas)
                                    {
                                        let is_drawing = false
                                        let current_rect = null
                                        let start_x = 0
                                        let start_y = 0
                                        let vector_data = []

                                        const save_vector_data = () =>
                                        {
                                            if (vector_data.length > 0)
                                            {
                                                vector_canvas.setAttribute("vector_data", JSON.stringify(vector_data))
                                            }
                                            else
                                            {
                                                vector_canvas.removeAttribute("vector_data")
                                            }

                                            save_label_data(project.id_project, image.image, active_label, image_block,
                                                () => {}, () => {}, "vector")
                                        }

                                        const get_mouse_coordinates = (event) =>
                                            get_mouse_coordinates_canvas(event, vector_canvas)

                                        const vector_data_json = vector_canvas.getAttribute("vector_data")
                                        if (vector_data_json)
                                        {
                                            vector_data = JSON.parse(vector_data_json)
                                        }

                                        function on_mouse_down(event)
                                        {
                                            const {mouse_x, mouse_y} = get_mouse_coordinates(event)

                                            for (let index_vector = 0; index_vector < vector_data.length; index_vector++)
                                            {
                                                const shape = vector_data[index_vector]
                                                if (shape.type === "anti-rectangle")
                                                {
                                                    const handles = get_rectangle_handles(shape)
                                                    for (let index_handle = 0; index_handle < handles.length; index_handle++)
                                                    {
                                                        const handle = handles[index_handle]
                                                        if (point_in_rect(mouse_x, mouse_y, handle.x, handle.y, handle.size, handle.size))
                                                        {
                                                            is_drawing = true
                                                            current_rect = shape
                                                            current_rect.resizing = true
                                                            current_rect.resize_handle = handle.position
                                                            return
                                                        }
                                                    }
                                                }
                                            }

                                            for (let index_vector = 0; index_vector < vector_data.length; index_vector++)
                                            {
                                                const shape = vector_data[index_vector]
                                                if (shape.type === "anti-rectangle")
                                                {
                                                    if (point_in_rect(mouse_x, mouse_y, shape.x, shape.y, shape.width, shape.height))
                                                    {
                                                        return
                                                    }
                                                }
                                            }

                                            is_drawing = true
                                            start_x = mouse_x
                                            start_y = mouse_y
                                            current_rect =
                                            {
                                                type: "anti-rectangle",
                                                x: start_x,
                                                y: start_y,
                                                width: 0,
                                                height: 0,
                                                color: label_color,
                                                lineWidth: 2
                                            }
                                            vector_data.push(current_rect)
                                        }

                                        function on_mouse_move(event)
                                        {
                                            if (!is_drawing || !current_rect)
                                            {
                                                return
                                            }

                                            const {mouse_x, mouse_y} = get_mouse_coordinates(event)

                                            if (current_rect.resizing)
                                            {
                                                resize_rectangle(current_rect, mouse_x, mouse_y)
                                            }
                                            else
                                            {
                                                current_rect.width = mouse_x - start_x
                                                current_rect.height = mouse_y - start_y
                                            }
                                            render_vector_data(vector_data, vector_canvas)
                                        }

                                        function on_mouse_up()
                                        {
                                            if (is_drawing)
                                            {
                                                is_drawing = false
                                                if (current_rect)
                                                {
                                                    current_rect.resizing = false
                                                    current_rect.resize_handle = null
                                                    current_rect = null
                                                }

                                                vector_data = vector_data.filter(shape =>
                                                {
                                                    if (shape.type === "anti-rectangle")
                                                    {
                                                        return shape.width > 1 && shape.height > 1
                                                    }

                                                    return true
                                                })

                                                save_vector_data()
                                            }
                                        }

                                        function on_double_click(event)
                                        {
                                            const {mouse_x, mouse_y} = get_mouse_coordinates(event)

                                            for (let index_vector = 0; index_vector < vector_data.length; index_vector++)
                                            {
                                                const shape = vector_data[index_vector]
                                                if (shape.type === "anti-rectangle")
                                                {
                                                    if (point_in_rect(mouse_x, mouse_y, shape.x, shape.y, shape.width, shape.height))
                                                    {
                                                        vector_data.splice(index_vector, 1)
                                                        render_vector_data(vector_data, vector_canvas)

                                                        save_vector_data()
                                                        return
                                                    }
                                                }
                                            }
                                        }

                                        add_event_listener_with_id(vector_canvas, "mousedown", "anti_label_mouse_down", on_mouse_down)
                                        add_event_listener_with_id(vector_canvas, "mousemove", "anti_label_mouse_move", on_mouse_move)
                                        add_event_listener_with_id(vector_canvas, "mouseup", "anti_label_mouse_up", on_mouse_up)
                                        add_event_listener_with_id(vector_canvas, "dblclick", "anti_label_double_click", on_double_click)
                                    }
                                }))

                            const undo_button = document.createElement("button")
                            undo_button.classList.add("btn", "btn-sm", "btn-secondary", "mr-4")
                            undo_button.innerHTML = "↶"
                            undo_button.title = "Undo"
                            add_event_listener_with_id(undo_button, "click", "undo_button", () =>
                                get_active_label(image_div, (active_label) =>
                                {
                                    block_buttons(null)
                                    const undo_url = `/undo_png_mask/${project.id_project}/${encodeURIComponent(image.image)}/${encodeURIComponent(active_label)}`

                                    fetch(undo_url, {cache: "no-store"})
                                        .then(response =>
                                        {
                                            if (!response.ok)
                                            {
                                                return response.json().then(err =>
                                                {
                                                    const errorMsg = err.detail || "Unknown error during Undo operation"
                                                    throw new Error(errorMsg)
                                                }).catch(() =>
                                                {
                                                    throw new Error("Unknown error during Undo operation")
                                                })
                                            }
                                            return response.json()
                                        })
                                        .then(data =>
                                        {
                                            if (data.result === "ok")
                                            {
                                                clear_canvas(get_png_canvas(image_block, full_image, full_image_container))
                                                activate_label(
                                                    project.id_project,
                                                    image.image,
                                                    active_label,
                                                    image_block,
                                                    full_image,
                                                    full_image_container,
                                                    project.labels,
                                                    clear_canvas_button,
                                                    () =>
                                                    {
                                                    },
                                                    (error) =>
                                                    {
                                                        alert(error)
                                                    }
                                                )
                                            }
                                            else if (data.result == "no-undo")
                                            {
                                                alert(data.message)
                                            }
                                            else
                                            {
                                                const errorMsg = data.message || "Unknown error during Undo operation"
                                                throw new Error(errorMsg)
                                            }
                                        })
                                        .catch(error =>
                                        {
                                            alert(error.message)
                                        })
                                }))


                            const label_buttons = project.labels.map((label_object) =>
                            {
                                const label_button = document.createElement("button")
                                label_button.classList.add("btn", "btn-sm", "mr-1")
                                label_button.textContent = label_object.label.charAt(0)
                                label_button.style.backgroundColor = label_object.color
                                label_button.style.color = "#fff"
                                label_button.title = label_object.label
                                label_button.setAttribute("label", label_object.label)

                                add_event_listener_with_id(label_button, "click", label_object.label + "_select", () =>
                                {
                                    block_buttons(null)

                                    const active_label = image_div.getAttribute("active_label")
                                    const new_label = label_button.getAttribute("label")

                                    const enable_controls = (enabled) =>
                                    {
                                        label_buttons.forEach((label_button) =>
                                        {
                                            label_button.disabled = !enabled
                                        })
                                    }

                                    enable_controls(false)

                                    check_unsave_and_save(image_block, save_button, project.id_project, image.image, active_label, () =>
                                    {
                                        const vector_canvas = image_block.querySelector("canvas.vector-canvas")
                                        if (vector_canvas)
                                        {
                                            vector_canvas.remove()
                                        }

                                        const png_canvas = get_png_canvas(image_block, full_image, full_image_container)
                                        if (png_canvas)
                                        {
                                            png_canvas.remove()
                                        }

                                        if (active_label === new_label)
                                        {
                                            label_button.classList.remove("selected-label-button")
                                            image_div.removeAttribute("active_label")

                                            enable_controls(true)
                                        }
                                        else
                                        {
                                            label_buttons.forEach((label_button) =>
                                            {
                                                label_button.classList.remove("selected-label-button")
                                            })

                                            label_button.classList.add("selected-label-button")
                                            image_div.setAttribute("active_label", new_label)

                                            activate_label(project.id_project, image.image, new_label, image_block, full_image,
                                                full_image_container, project.labels, clear_canvas_button,
                                                () => enable_controls(true), (error) => alert(error))
                                        }
                                    },
                                    (error) => alert(error))
                                })

                                return label_button
                            })

                            const predict_objects_button = document.createElement("button")
                            predict_objects_button.classList.add("btn", "btn-sm", "btn-secondary", "ml-4", "mr-1")
                            predict_objects_button.innerHTML = "🤖"
                            predict_objects_button.title = "Predict Objects"
                            add_event_listener_with_id(predict_objects_button, "click", "predict", () =>
                                get_active_label(image_div, (active_label) =>
                                {
                                    block_buttons(null)
                                    predict_objects(project, active_label, image_div, image_block, full_image, full_image_container, save_button,
                                        clear_canvas_button, null)
                                }))

                            const predict_rectangle_button = document.createElement("button")
                            predict_rectangle_button.classList.add("btn", "btn-sm", "btn-secondary", "mr-1")
                            predict_rectangle_button.innerHTML = "▣"
                            predict_rectangle_button.title = "Predict Objects in Rectangular Area"
                            add_event_listener_with_id(predict_rectangle_button, "click", "predict_area", () =>
                            {
                                get_active_label(image_div, (active_label) =>
                                {
                                    block_buttons(null)

                                    const png_canvas = get_png_canvas(image_block, full_image, full_image_container)
                                    const vector_canvas = get_vector_canvas(image_block, full_image, full_image_container, true)

                                    if (vector_canvas)
                                    {
                                        activate_canvas(png_canvas, vector_canvas, false)

                                        let is_drawing = false
                                        let start_x
                                        let start_y
                                        let rect = null
                                        let predict_area_button = null
                                        let close_button = null

                                        function remove_rectangle_and_button()
                                        {
                                            if (rect)
                                            {
                                                full_image_container.removeChild(rect)
                                                rect = null
                                            }

                                            if (predict_area_button)
                                            {
                                                full_image_container.removeChild(predict_area_button)
                                                predict_area_button = null
                                            }

                                            if (close_button)
                                            {
                                                full_image_container.removeChild(close_button)
                                                close_button = null
                                            }
                                        }

                                        function onMouseDown(event)
                                        {
                                            if (predict_area_button != null || rect != null)
                                            {
                                                remove_rectangle_and_button()
                                            }

                                            is_drawing = true
                                            const rect_bounds = vector_canvas.getBoundingClientRect()
                                            start_x = event.clientX - rect_bounds.left
                                            start_y = event.clientY - rect_bounds.top

                                            rect = document.createElement("div")
                                            rect.style.position = "absolute"
                                            rect.style.border = "2px dashed #000"
                                            rect.style.left = start_x + "px"
                                            rect.style.top = start_y + "px"
                                            full_image_container.appendChild(rect)
                                        }

                                        function onMouseMove(event)
                                        {
                                            if (!is_drawing)
                                            {
                                                return
                                            }
                                            const rect_bounds = vector_canvas.getBoundingClientRect()
                                            const mouse_x = event.clientX - rect_bounds.left
                                            const mouse_y = event.clientY - rect_bounds.top

                                            const width = mouse_x - start_x
                                            const height = mouse_y - start_y

                                            rect.style.width = Math.abs(width) + "px"
                                            rect.style.height = Math.abs(height) + "px"
                                            rect.style.left = (width < 0 ? mouse_x : start_x) + "px"
                                            rect.style.top = (height < 0 ? mouse_y : start_y) + "px"
                                            rect.style.zIndex = "500"

                                            const rect_left = parseFloat(rect.style.left)
                                            const rect_top = parseFloat(rect.style.top)

                                            if (!predict_area_button)
                                            {
                                                predict_area_button = document.createElement("button")
                                                predict_area_button.textContent = "Predict"
                                                predict_area_button.style.position = "absolute"
                                                predict_area_button.style.left = (rect_left + 10) + "px"
                                                predict_area_button.style.top = (rect_top + 10) + "px"
                                                predict_area_button.style.zIndex = "1100"
                                                full_image_container.appendChild(predict_area_button)

                                                close_button = document.createElement("button")
                                                close_button.textContent = "⨉"
                                                close_button.style.position = "absolute"
                                                close_button.style.color = "red"
                                                close_button.style.left = (rect_left + predict_area_button.offsetWidth + 20) + "px"
                                                close_button.style.top = (rect_top + 10) + "px"
                                                close_button.style.zIndex = "1100"
                                                full_image_container.appendChild(close_button)

                                                add_event_listener_with_id(close_button, "click", "close_predict_area", () =>
                                                {
                                                    remove_rectangle_and_button()
                                                })

                                                add_event_listener_with_id(predict_area_button, "click", "execute_predict_area", () =>
                                                {
                                                    const element_area = rect.getBoundingClientRect()
                                                    const container_area = image_block.getBoundingClientRect()

                                                    const relative_x = element_area.left - container_area.left
                                                    const relative_y = element_area.top - container_area.top
                                                    const relative_width = element_area.width
                                                    const relative_height = element_area.height

                                                    const crop_area =
                                                    {
                                                        x: to_percentage(relative_x, container_area.width),
                                                        y: to_percentage(relative_y, container_area.height),
                                                        width: to_percentage(relative_width, container_area.width),
                                                        height: to_percentage(relative_height, container_area.height)
                                                    }

                                                    remove_event_listeners()

                                                    predict_objects(
                                                        project,
                                                        active_label,
                                                        image_div,
                                                        image_block,
                                                        full_image,
                                                        full_image_container,
                                                        save_button,
                                                        clear_canvas_button,
                                                        crop_area,
                                                        () => remove_rectangle_and_button()
                                                    )
                                                })
                                            }
                                            else
                                            {
                                                predict_area_button.style.left = (rect_left + 10) + "px"
                                                predict_area_button.style.top = (rect_top + 10) + "px"

                                                close_button.style.left = (rect_left + predict_area_button.offsetWidth + 20) + "px"
                                                close_button.style.top = (rect_top + 10) + "px"
                                            }
                                        }

                                        function on_mouse_up()
                                        {
                                            if (!is_drawing)
                                            {
                                                return
                                            }
                                            is_drawing = false
                                        }

                                        function on_key_up(event)
                                        {
                                            if (event.key === "Escape")
                                            {
                                                remove_rectangle_and_button()
                                                remove_event_listeners()
                                            }
                                        }

                                        function on_click_outside(event)
                                        {
                                            const rect_bounds = vector_canvas.getBoundingClientRect()
                                            const mouse_x = event.clientX
                                            const mouse_y = event.clientY

                                            const scrollX = window.scrollX
                                            const scrollY = window.scrollY

                                            const canvas_left = rect_bounds.left + scrollX
                                            const canvas_top = rect_bounds.top + scrollY
                                            const canvas_right = rect_bounds.right + scrollX
                                            const canvas_bottom = rect_bounds.bottom + scrollY

                                            if (
                                                mouse_x < canvas_left ||
                                                mouse_x > canvas_right ||
                                                mouse_y < canvas_top ||
                                                mouse_y > canvas_bottom
                                            )
                                            {
                                                remove_rectangle_and_button()
                                                remove_event_listeners()
                                            }
                                        }

                                        function remove_event_listeners()
                                        {
                                            remove_event_listener_with_id(vector_canvas, "predict_area_mouse_down")
                                            remove_event_listener_with_id(vector_canvas, "predict_area_mouse_move")
                                            remove_event_listener_with_id(vector_canvas, "predict_area_mouse_up")
                                            remove_event_listener_with_id(document, "predict_area_key_up")
                                            remove_event_listener_with_id(document, "predict_area_finalize")
                                        }

                                        add_event_listener_with_id(vector_canvas, "mousedown", "predict_area_mouse_down", onMouseDown)
                                        add_event_listener_with_id(vector_canvas, "mousemove", "predict_area_mouse_move", onMouseMove)
                                        add_event_listener_with_id(vector_canvas, "mouseup", "predict_area_mouse_up", on_mouse_up)
                                        add_event_listener_with_id(document, "keyup", "predict_area_key_up", on_key_up)

                                        setTimeout(() =>
                                            add_event_listener_with_id(document, "click", "predict_area_finalize", on_click_outside), 0)

                                    }
                                })
                            })

                            const close_button = document.createElement("button")
                            close_button.classList.add("btn", "btn-sm", "ml-auto")
                            close_button.textContent = "✖"
                            add_event_listener_with_id(close_button, "click", "close_full_image", () =>
                            {
                                block_buttons(null)

                                full_image.zoom_level = 100
                                full_image.style.width = "100%"

                                image_div.classList.remove("expanded")
                                image_div.style.width = `calc(${images_width} + 6.5pt)`
                                image_div.style.marginRight = "2.5pt"
                                prepare_image(image_block, image, preview_file)
                                image_block.style.cursor = "pointer"
                                image_block.innerHTML = ""
                                toolbar.remove()
                            })

                            buttons.push(...[zoom_in_button, zoom_out_button, brush_button, eraser_button, anti_label_button, undo_button,
                                ...label_buttons, predict_objects_button, predict_rectangle_button, clear_canvas_button, save_button, close_button])

                            for (const button of buttons)
                            {
                                toolbar.appendChild(button)
                            }

                            image_div.appendChild(toolbar)

                            const zoom = (change) =>
                            {
                                full_image.zoom_level += change

                                if (full_image.zoom_level > 1000)
                                {
                                    full_image.zoom_level = 1000
                                }

                                if (full_image.zoom_level < 30)
                                {
                                    full_image.zoom_level = 30
                                }

                                full_image.style.width = full_image.zoom_level + "%"

                                const canvases = image_block.querySelectorAll("canvas")
                                for (const canvas of canvases)
                                {
                                    update_canvas_zoom(full_image, canvas)
                                }

                                if (full_image.zoom_level >= 95 && full_image.zoom_level <= 105)
                                {
                                    full_image.zoom_level = 100
                                    full_image.style.width = "100%"

                                    for (const canvas of canvases)
                                    {
                                        canvas.style.width = "100%"
                                        canvas.style.height = "auto"
                                    }
                                }
                            }

                            add_event_listener_with_id(zoom_in_button, "click", "zoom_in", () => zoom(30))

                            add_event_listener_with_id(zoom_out_button, "click", "zoom_out", () => zoom(-30))
                        })
                    }


                    for (const image of response_json.images)
                    {
                        add_image(image, preview_file)
                    }
                    images_div.style.display = "block"

                    const add_image_button = document.createElement("button")
                    add_image_button.classList.add("btn", "btn-primary", "mt-3")
                    add_image_button.textContent = "Add image"

                    add_event_listener_with_id(add_image_button, "click", "add_image", () =>
                    {
                        const input = document.createElement("input")
                        input.type = "file"
                        input.accept = "image/*"
                        input.style.display = "none"
                        add_event_listener_with_id(input, "change", "upload_image", () =>
                        {
                            const formData = new FormData()
                            formData.append("image", input.files[0])

                            fetch(`/upload_image/${project.id_project}`, {
                                method: "POST",
                                body: formData
                            })
                                .then(response => response.json())
                                .then(answer =>
                                {
                                    if (answer.hasOwnProperty("result") && answer["result"] == "ok")
                                    {
                                        // noinspection JSUnresolvedReference
                                        add_image(answer["image_data"], `${response_json.preview_file}?t=${new Date().getTime()}`)
                                        images_count_span.innerHTML = (parseInt(images_count_span.innerHTML) + 1).toString()
                                    }
                                    else
                                    {
                                        console.error(answer)
                                    }
                                })
                                .catch(error =>
                                {
                                    console.error("Error uploading image:", error)
                                })
                        })
                        input.click()
                    })

                    images_div.appendChild(images_list_div)
                    images_div.appendChild(add_image_button)
                },
                (error_text) =>
                {
                    console.log(error_text)
                })))


        add_event_listener_with_id(labels_button, "click", "show_labels", () => show_content(labels_div))
        add_event_listener_with_id(settings_button, "click",  "show_settings", () => show_content(settings_div))
    }
}

add_event_listener_with_id(document, "DOMContentLoaded", "startup", () =>
{
    request("get_projects_list", null, (response_json) =>
        {
            update_projects(response_json)
        },
        (error_text) =>
        {
            console.log(error_text)
        }, false)

    const add_project_button = document.getElementById("add-project-button")
    add_event_listener_with_id(add_project_button, "click", "add_project", () =>
        request("add_project", null, (response_json) =>
            {
                update_projects(response_json)
            },
            (error_text) =>
            {
                console.log(error_text)
            }, false, add_project_button))
})