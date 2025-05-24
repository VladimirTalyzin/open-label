const setCookie = (key, value, days = 30) =>
{
    if (key === "classSettings")
    {
        localStorage.setItem(key, value)
    }
    else
    {
        const date = new Date()
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
        const expires = "expires=" + date.toUTCString()
        document.cookie = `${key}=${value}; ${expires}; path=/`
    }
}


const getCookie = (key) =>
{
    if (key === "classSettings")
    {
        return localStorage.getItem(key) || ""
    }

    const name = key + "="
    const decodedCookie = decodeURIComponent(document.cookie)
    const ca = decodedCookie.split(";")
    for (let i = 0; i < ca.length; i++)
    {
        let c = ca[i]
        while (c.charAt(0) == " ")
        {
            c = c.substring(1)
        }
        if (c.indexOf(name) == 0)
        {
            return c.substring(name.length, c.length)
        }
    }
    return ""
}

const saveSettingsToCookie = (jsonString) =>
{
    setCookie("classSettings", jsonString)
}

const loadSettingsFormCookie = () =>
{
    return getCookie("classSettings")
}

const setCheckboxStatesFromCookie = () =>
{
    const cookieValue = getCookie("selectedClasses")
    if (cookieValue)
    {
        const selectedClasses = cookieValue.split(",")
        const checkboxes = document.querySelectorAll("[is-label='true']")
        checkboxes.forEach(checkbox =>
        {
            checkbox.checked = selectedClasses.includes(checkbox.value)
        })
    }
}

const saveCheckboxStatesToCookie = () =>
{
    const checkboxes = document.querySelectorAll("[is-label='true']")
    const selectedClasses = []
    checkboxes.forEach(checkbox =>
    {
        if (checkbox.checked)
        {
            selectedClasses.push(checkbox.value)
        }
    })
    setCookie("selectedClasses", selectedClasses.join(","))
}
