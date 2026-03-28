export function disableButton(button)
{
    if (typeof button === "object" && button !== null)
    {
        button.enabled = false
        const oldBackground = button.style.background
        button.style.background = "#AAAAAA"

        return {
            enableButton: () =>
            {
                button.enabled = true
                button.style.background = oldBackground
            }
        }
    }
    return {
        enableButton: () =>
        {
        }
    }
}

export function request(command, parameters, onLoad, onError, isPost, button)
{
    const url = "/" + command
    const disableData = disableButton(button)

    const options = {
        method: isPost ? "POST" : "GET",
        cache: "no-store"
    }

    let finalUrl = url

    if (isPost)
    {
        const formData = new FormData()
        if (parameters && typeof parameters === "object")
        {
            Object.keys(parameters).forEach((key) =>
            {
                formData.append(key, parameters[key])
            })
        }
        options.body = formData
    }
    else
    {
        if (parameters && typeof parameters === "object")
        {
            const query = Object.keys(parameters)
                .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(parameters[key])}`)
                .join("&")
            finalUrl += "?" + query
        }
    }

    fetch(finalUrl, options)
        .then((response) =>
        {
            if (response.status === 200)
            {
                return response.json()
            }
            else
            {
                if (typeof onError === "function")
                {
                    onError("HTTP status != 200")
                }
                throw new Error("HTTP status != 200")
            }
        })
        .then((data) =>
        {
            if (typeof onLoad === "function")
            {
                onLoad(data)
            }
        })
        .catch((error) =>
        {
            if (typeof onError === "function")
            {
                onError(error.message)
            }
        })
        .finally(() =>
        {
            disableData.enableButton()
        })
}
