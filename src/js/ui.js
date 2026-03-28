import {addEventListenerWithId, removeEventListenerWithId} from "./events.js"
import {request} from "./api.js"

export function updateTextInput(textInput, error)
{
    textInput.style.borderColor = error ? "red" : "green"
    textInput.style.borderWidth = "3px"

    setTimeout(() =>
    {
        textInput.style.borderColor = ""
        textInput.style.borderWidth = ""
    }, 1000)
}

export function setValueListener(valueControl, command, parameterName, additionalParameters)
{
    const control = valueControl
    const currentCommand = command
    const currentParameterName = parameterName
    const currentParameters = additionalParameters

    function getValue()
    {
        return control.tagName === "INPUT" ? control.value : control.innerHTML
    }

    function setValue(value)
    {
        if (control.tagName === "INPUT")
        {
            control.value = value
        }
        else
        {
            control.innerHTML = value
        }
    }

    addEventListenerWithId(control, "focus", parameterName + "_focus", () =>
    {
        control.dataset.previousValue = getValue()
    })

    addEventListenerWithId(control, "blur", parameterName + "_blur", () =>
    {
        if (getValue() !== control.dataset.previousValue)
        {
            currentParameters[currentParameterName] = getValue()

            request(
                currentCommand,
                currentParameters,
                (responseJson) =>
                {
                    if (responseJson.result === "ok")
                    {
                        if (typeof responseJson.value === "object" && responseJson.value !== null)
                        {
                            setValue(JSON.stringify(responseJson.value, null, 2))
                        }
                        else
                        {
                            setValue(responseJson.value)
                        }
                        updateTextInput(control)
                    }
                    else
                    {
                        console.log("Error updating command", currentCommand, ":", responseJson)
                        updateTextInput(control, true)
                    }
                },
                (errorText) =>
                {
                    console.log("Error:", errorText)
                },
                true,
                control
            )
        }
    })
}

export function hideLabelButtons(buttons, exceptLabel, hide)
{
    buttons.forEach((button) =>
    {
        if (button.getAttribute("label") !== exceptLabel)
        {
            button.style.display = hide ? "none" : null
        }
    })
}

export function blockButtonsFunction(buttons, currentButton, listenerId = null, onUnset = () =>
{
})
{
    const activeButton = currentButton
    const activeUnset = onUnset
    const currentListenerId = listenerId
    const currentButtons = buttons

    const enableButton = (button) =>
    {
        button.style.pointerEvents = null
        button.disabled = false
    }

    const disableButton = (button) =>
    {
        button.style.pointerEvents = "none"
        button.disabled = true
    }

    currentButtons.forEach((button) =>
    {
        if (activeButton == null || button === activeButton)
        {
            enableButton(button)

            if (button === activeButton)
            {
                button.style.border = "1pt solid gray"

                let currentButtonListener = null

                if (currentListenerId != null)
                {
                    currentButtonListener = removeEventListenerWithId(activeButton, currentListenerId)
                }

                addEventListenerWithId(activeButton, "click", "active_button_unset", () =>
                {
                    currentButtons.forEach((btn) => enableButton(btn))
                    removeEventListenerWithId(activeButton, "active_button_unset")

                    if (currentButtonListener)
                    {
                        addEventListenerWithId(activeButton, "click", currentListenerId, currentButtonListener)
                    }

                    activeUnset()
                })
            }
            else
            {
                button.style.border = null
            }
        }
        else
        {
            disableButton(button)
        }
    })
}

export function getInitialSliderValue(button, attributeName, defaultValue = "10")
{
    return button.getAttribute(attributeName) || defaultValue
}

export function setSliderValue(button, attributeName, value)
{
    button.setAttribute(attributeName, value.toString())
}

export function toPercentage(value, total)
{
    if (total === 0)
    {
        return "0.0000%"
    }
    return ((value / total) * 100).toFixed(4) + "%"
}
