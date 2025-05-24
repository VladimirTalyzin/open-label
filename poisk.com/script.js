const createSettingsPanel = (classNameInput, classDataInput) =>
{
    const className = classNameInput
    const classData = classDataInput

    const settingsPanel = document.createElement("div")
    settingsPanel.style.display = "none"
    settingsPanel.style.width = "90%"
    settingsPanel.style.marginBottom = "5pt"
    settingsPanel.className = "settings-panel border rounded p-3 bg-light"

    // Color input
    const colorDiv = document.createElement("div")
    colorDiv.className = "form-group"
    const colorLabel = document.createElement("label")
    colorLabel.htmlFor = `${className}-color`
    colorLabel.textContent = "Color"
    const colorInput = document.createElement("input")
    colorInput.className = "form-control"
    colorInput.type = "color"
    colorInput.id = `${className}-color`
    colorInput.value = classData.color
    colorInput.addEventListener("input", () => updateClassSettings(className))
    colorDiv.appendChild(colorLabel)
    colorDiv.appendChild(colorInput)
    settingsPanel.appendChild(colorDiv)

    // Operations settings
    // noinspection JSUnresolvedReference
    if (typeof classData.operations == "object")
    {
        const ol = document.createElement("ol")
        ol.style.paddingInlineStart = "10pt";
        // noinspection JSUnresolvedReference
        classData.operations.forEach((operation, index) =>
        {
            const li = document.createElement("li")
            li.className = "mb-3"

            // Container for checkbox and command header
            const headerContainer = document.createElement("div")
            headerContainer.className = "d-flex align-items-center ml-4"

            const enabledCheckbox = document.createElement("input")
            enabledCheckbox.className = "form-check-input"
            enabledCheckbox.type = "checkbox"
            enabledCheckbox.id = `${className}-${index}-enabled`
            enabledCheckbox.checked = operation.hasOwnProperty("enabled") ? operation.enabled : true
            enabledCheckbox.style.marginBottom = "10pt"
            enabledCheckbox.addEventListener("change", () =>
            {
                updateClassSettings(className)
                settingsPanel.style.backgroundColor = enabledCheckbox.checked ? "white" : "#f8f9fa"
            })
            headerContainer.appendChild(enabledCheckbox)

            // Command header
            const commandHeader = document.createElement("h6")
            // noinspection JSUnresolvedReference
            commandHeader.innerHTML = `${getCommandIcon(operation.command)} ${capitalizeFirstLetter(operation.command)}`
            headerContainer.appendChild(commandHeader)

            li.appendChild(headerContainer)

            // Parameter inputs
            const parameterDiv = document.createElement("div")
            parameterDiv.className = "form-group d-flex align-items-center"

            // Parameter label
            const parameterLabel = document.createElement("label")
            parameterLabel.htmlFor = `${className}-parameter-${index}`
            // noinspection JSUnresolvedReference
            parameterLabel.textContent = getParameterLabel(operation.command)
            parameterLabel.style.width = "20%"
            parameterLabel.style.minWidth = "20%"
            parameterLabel.className = "mr-2"
            parameterLabel.style.fontSize = "0.875em"

            // Parameter input
            const parameterInput = document.createElement("input")
            parameterInput.className = "form-control mr-2"
            parameterInput.type = "number"
            parameterInput.id = `${className}-parameter-${index}`
            parameterInput.value = operation.parameter
            parameterInput.style.width = "80%"
            parameterInput.addEventListener("input", () => updateClassSettings(className))

            // Unit dropdown
            const unitDropdown = createUnitDropdown(operation.unit, `${className}-unit-${index}`)

            // Append elements
            parameterDiv.appendChild(parameterLabel)
            parameterDiv.appendChild(parameterInput)
            parameterDiv.appendChild(unitDropdown)
            li.appendChild(parameterDiv)

            // Additional Parameters (if any)
            if (operation.parameter2 !== undefined && operation.unit2 !== undefined)
            {
                const parameter2Div = document.createElement("div")
                parameter2Div.className = "form-group d-flex align-items-center"

                const parameter2Label = document.createElement("label")
                parameter2Label.htmlFor = `${className}-parameter2-${index}`
                // noinspection JSUnresolvedReference
                parameter2Label.textContent = getParameter2Label(operation.command)
                parameter2Label.style.width = "20%"
                parameter2Label.style.minWidth = "20%"
                parameter2Label.className = "mr-2"

                parameter2Label.style.fontSize = "0.875em"

                const parameter2Input = document.createElement("input")
                parameter2Input.className = "form-control mr-2"
                parameter2Input.type = "number"
                parameter2Input.id = `${className}-parameter2-${index}`
                parameter2Input.value = operation.parameter2
                parameter2Input.style.width = "80%"
                parameter2Input.addEventListener("input", () => updateClassSettings(className))

                const unit2Dropdown = createUnitDropdown(operation.unit2, `${className}-unit2-${index}`)

                parameter2Div.appendChild(parameter2Label)
                parameter2Div.appendChild(parameter2Input)
                parameter2Div.appendChild(unit2Dropdown)
                li.appendChild(parameter2Div)
            }


            ol.appendChild(li)
        })
        settingsPanel.appendChild(ol)
    }

    return settingsPanel
}

const getCommandIcon = (command) =>
{
    switch (command)
    {
        case "connect":
            return "🔗"
        case "min_square":
            return "⇲"
        case "max_square":
            return "⇱"
        case "linearity":
            return "📏"
        case "ovality":
            return "🔵"
        default:
            return "🔧"
    }
}

const getParameterLabel = (command) =>
{
    switch (command)
    {
        case "connect":
            return "Min. Distance"
        case "min_square":
        case "max_square":
            return "Square"
        case "linearity":
            return "Line Gap"
        case "ovality":
            return "Sensitivity"
        default:
            return "Parameter"
    }
}

const getParameter2Label = (command) =>
{
    switch (command)
    {
        case "linearity":
            return "Min. Line Length"
        case "ovality":
            return "Min. Perimeter"
        default:
            return "Parameter 2"
    }
}

const createUnitDropdown = (selectedUnit, elementId) =>
{
    const unitOptions = {
        "pixel": "px",
        "meter": "m",
        "meter2": "m²"
    }

    const select = document.createElement("select")
    select.className = "form-control"
    select.style.width = "auto"
    select.id = elementId

    for (const [unit, label] of Object.entries(unitOptions))
    {
        const option = document.createElement("option")
        option.value = unit
        option.textContent = label
        if (unit === selectedUnit)
        {
            option.selected = true
        }
        select.appendChild(option)
    }

    select.addEventListener("change", () => updateClassSettings(className))

    return select
}

const capitalizeFirstLetter = (string) =>
{
    return string.charAt(0).toUpperCase() + string.slice(1)
}

const getClasses = () => JSON.parse(document.getElementById("jsonInput").value)
const setClasses = (json) =>
{
    const jsonString = JSON.stringify(json, null, 2)
    document.getElementById("jsonInput").value = jsonString
    saveSettingsToCookie(jsonString)
}

const updateClassSettings = (className) =>
{
    const classes = getClasses()
    const classSettings = classes[className]
    const colorInput = document.getElementById(`${className}-color`)
    classSettings.color = colorInput.value

    // noinspection JSUnresolvedReference
    classSettings.operations.forEach((operation, index) =>
    {
        const enabledCheckbox = document.getElementById(`${className}-${index}-enabled`)
        operation.enabled = enabledCheckbox.checked
        const parameterInput = document.getElementById(`${className}-parameter-${index}`)
        operation.parameter = parseFloat(parameterInput.value)

        const parameterUnit = document.getElementById(`${className}-unit-${index}`)
        if (parameterUnit)
        {
            operation.unit = parameterUnit.value
        }

        const parameter2Input = document.getElementById(`${className}-parameter2-${index}`)
        if (parameter2Input)
        {
            operation.parameter2 = parseFloat(parameter2Input.value)

            const parameter2Unit = document.getElementById(`${className}-unit2-${index}`)
            if (parameter2Unit)
            {
                operation.unit2 = parameter2Unit.value
            }
        }
    })

    setClasses(classes)
}

document.addEventListener("DOMContentLoaded", async function ()
{
    try
    {
        let classes = loadSettingsFormCookie()

        if (classes)
        {
            classes = JSON.parse(classes)
        }
        else if (!classes)
        {
            const response = await fetch("https://jork.poisk.com/get_classes")
            if (!response.ok)
            {
                console.log("Network response was not ok")
                return
            }
            classes = await response.json()
        }

        const classesContainer = document.getElementById("classesContainer")
        const jsonInput = document.getElementById("jsonInput")

        for (const className in classes)
        {
            const classData = classes[className]

            const formCheckDiv = document.createElement("div")
            formCheckDiv.className = "form-check"

            const checkbox = document.createElement("input")
            checkbox.className = "form-check-input form-check-input-large"
            checkbox.type = "checkbox"
            checkbox.id = className
            checkbox.name = "classes"
            checkbox.value = className
            checkbox.setAttribute("is-label", "true")

            if (!document.cookie.includes("selectedClasses=") && (className === "Old road" || className === "Shoreline"))
            {
                checkbox.checked = true
            }

            checkbox.addEventListener("change", saveCheckboxStatesToCookie)

            const label = document.createElement("label")
            label.className = "form-check-label"
            label.htmlFor = className
            label.textContent = className
            label.style.marginLeft = "10pt"

            const settingsButton = document.createElement("button")
            settingsButton.className = "btn btn-secondary btn-sm"
            settingsButton.type = "button"
            settingsButton.textContent = "⚙️"
            settingsButton.style.marginRight = "20pt"
            settingsButton.style.marginBottom = "3pt"

            const settingsPanel = createSettingsPanel(className, classData)
            formCheckDiv.appendChild(settingsPanel)

            settingsButton.addEventListener("click", () =>
            {
                settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none"
            })

            formCheckDiv.appendChild(settingsButton)
            formCheckDiv.appendChild(checkbox)
            formCheckDiv.appendChild(label)
            formCheckDiv.appendChild(settingsPanel)

            classesContainer.appendChild(formCheckDiv)
        }

        setCheckboxStatesFromCookie()

        jsonInput.value = JSON.stringify(classes, null, 2)
    }
    catch (error)
    {
        console.error("Failed to fetch classes:", error)
    }
})


document.getElementById("settingsButton").addEventListener("click", function ()
{
    const settingsPanel = document.getElementById("settingsPanel")
    settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none"
})

document.getElementById("uploadForm").addEventListener("submit", function (event)
{
    event.preventDefault()
    const form = event.target
    const loadingSpinner = document.getElementById("loadingSpinner")
    const beforeImage = document.getElementById("beforeImage")
    const afterImage = document.getElementById("afterImage")
    const twentytwentyContainer = document.getElementById("twentytwenty-container")
    const preloadContainer = document.getElementById("preload-container")
    const preload = document.getElementById("preload")

    // Мануальное создание FormData
    const formData = new FormData()
    formData.append("scale", form.scale.value == "" ? "13z" : form.scale.value)
    // noinspection JSUnresolvedReference
    formData.append("use_rules", form.use_rules.checked.toString())
    // noinspection JSUnresolvedReference
    formData.append("classes", form.jsonInput.value)

    // Формирование search_classes
    const searchClasses = {}
    const checkboxes = document.querySelectorAll("input[type='checkbox'][is-label='true']")
    checkboxes.forEach(checkbox =>
    {
        if (checkbox.checked)
        {
            searchClasses[checkbox.id] = true
        }
    })
    formData.append("search_classes", JSON.stringify(searchClasses))

    // Добавление файла в FormData
    const fileInput = form.file
    if (fileInput.files.length > 0)
    {
        formData.append("file", fileInput.files[0])
    }

    loadingSpinner.style.display = "block"

    fetch("https://jork.poisk.com/segmentation", {mode: "cors", method: "POST", body: formData})
        .then(response =>
        {
            if (!response.ok)
            {
                throw new Error("Network response was not ok")
            }
            return response.blob()
        })
        .then(blob =>
        {
            afterImage.src = URL.createObjectURL(blob)
            afterImage.onload = () =>
            {
                loadingSpinner.style.display = "none"
                preloadContainer.style.display = "none"
                twentytwentyContainer.style.display = "block"
                // noinspection JSUnresolvedReference
                $(twentytwentyContainer).twentytwenty(
                    {
                        default_offset_pct: 0.1
                    })
            }
        })
        .catch(error =>
        {
            console.error("Error:", error)
            loadingSpinner.style.display = "none"
        })

    // Загрузка исходного изображения
    const file = fileInput.files[0]
    const reader = new FileReader()
    reader.onloadend = () =>
    {
        if (twentytwentyContainer.style.display != "block")
        {
            preloadContainer.style.display = "block"
            beforeImage.src = reader.result
            preload.src = reader.result
        }
    }
    reader.readAsDataURL(file)
})
