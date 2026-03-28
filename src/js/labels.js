import {getVectorCanvas, getPngCanvas, overlayMaskOnImage, clearCanvas as clearCanvasHelper} from "./canvas.js"
import {renderVectorData} from "./vector.js"

export function getActiveLabel(imageDiv, onLabel, onError = (error) => console.warn(error))
{
    const activeLabel = imageDiv.getAttribute("active_label")
    if (activeLabel)
    {
        if (typeof onLabel === "function")
        {
            onLabel(activeLabel)
        }
    }
    else
    {
        if (typeof onError === "function")
        {
            onError("Please select a label.")
        }
    }
}

export function getColor(label, labels, defaultColor = "#ff0000")
{
    const labelObject = labels.find((l) => l.label === label)
    return labelObject ? labelObject.color : defaultColor
}

export function activateLabel(
    idProject,
    imageName,
    label,
    imageBlock,
    fullImage,
    fullImageContainer,
    labels,
    clearCanvasButton,
    onActivate = () =>
    {
    },
    onError = (_) =>
    {
    }
)
{
    const vectorDataUrl = `/get_vector_mask/${idProject}/${encodeURIComponent(imageName)}/${encodeURIComponent(label)}`

    fetch(vectorDataUrl, {cache: "no-store"})
        .then((response) =>
        {
            if (response.status === 200)
            {
                return response.json()
            }
            else
            {
                onError(response.statusText)
            }
        })
        .then((data) =>
        {
            const vectorData = data["json-data"]
            const hasPngMask = data["has-png-mask"]

            if (vectorData)
            {
                const vectorCanvas = getVectorCanvas(imageBlock, fullImage, fullImageContainer)
                vectorCanvas.setAttribute("vector_data", JSON.stringify(vectorData))
                renderVectorData(vectorData, vectorCanvas)
            }

            if (hasPngMask)
            {
                const maskUrl = `/get_png_mask/${idProject}/${encodeURIComponent(imageName)}/${encodeURIComponent(label)}`

                return fetch(maskUrl, {cache: "no-store"})
                    .then((response) =>
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
                            onError(response.statusText)
                        }
                    })
                    .then(async (blob) =>
                    {
                        if (blob)
                        {
                            const blobUrl = URL.createObjectURL(await blob)
                            overlayMaskOnImage(
                                imageBlock,
                                fullImage,
                                fullImageContainer,
                                blobUrl,
                                labels,
                                label,
                                false,
                                null,
                                clearCanvasButton
                            )
                        }
                    })
            }
        })
        .then(() =>
        {
            onActivate()
        })
        .catch((error) =>
        {
            onError(error)
        })
}

export function checkUnsaveAndSave(
    imageBlock,
    saveButton,
    idProject,
    imageName,
    label,
    onAfter = () =>
    {
    },
    onError = (_) =>
    {
    }
)
{
    const vectorCanvas = imageBlock.querySelector("canvas.vector-canvas")
    const pngCanvas = imageBlock.querySelector("canvas.png-canvas")
    if (
        label !== null &&
        label !== "" &&
        ((vectorCanvas && vectorCanvas.hasAttribute("unsaved")) ||
            (pngCanvas && pngCanvas.hasAttribute("unsaved")))
    )
    {
        saveLabelData(idProject, imageName, label, imageBlock, onAfter, onError)
    }
    else
    {
        onAfter()
    }
}

export function saveLabelData(
    idProject,
    imageName,
    label,
    imageBlock,
    onSave = () =>
    {
    },
    onError = () =>
    {
    },
    typeSave = "all"
)
{
    const savePromises = []

    const vectorCanvas = imageBlock.querySelector("canvas.vector-canvas")
    if (vectorCanvas && (typeSave === "all" || typeSave === "vector"))
    {
        const vectorData = vectorCanvas.getAttribute("vector_data")

        if (vectorData && vectorData.length > 0)
        {
            const formData = new FormData()
            formData.append("json_data", vectorData)

            const vectorSavePromise = fetch(
                `/upload_vector_mask/${idProject}/${encodeURIComponent(imageName)}/${encodeURIComponent(label)}`,
                {method: "POST", body: formData}
            )
                .then((response) => response.json())
                .then((data) =>
                {
                    if (data.result !== "ok")
                    {
                        onError(new Error(data.message))
                    }
                })
                .catch((error) =>
                {
                    onError(error)
                })

            savePromises.push(vectorSavePromise)
        }
    }

    const pngCanvas = imageBlock.querySelector("canvas.png-canvas")
    if (pngCanvas && (typeSave === "all" || typeSave === "png"))
    {
        const pngSavePromise = new Promise((resolve, reject) =>
        {
            pngCanvas.toBlob(
                (blob) =>
                {
                    if (blob)
                    {
                        const formData = new FormData()
                        formData.append("image", blob, "mask.png")

                        fetch(
                            `/upload_png_mask/${idProject}/${encodeURIComponent(imageName)}/${encodeURIComponent(label)}`,
                            {method: "POST", body: formData}
                        )
                            .then((response) => response.json())
                            .then((data) =>
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
                            .catch((error) =>
                            {
                                reject(error)
                            })
                    }
                    else
                    {
                        resolve()
                    }
                },
                "image/png"
            )
        })

        savePromises.push(pngSavePromise)
    }

    if (savePromises.length === 0)
    {
        onSave()
        return
    }

    Promise.all(savePromises)
        .then(() =>
        {
            onSave()
        })
        .catch((error) =>
        {
            console.error("One of the saves failed:", error)
            onError(error)
        })
}

export function predictObjects(
    project,
    activeLabel,
    imageDiv,
    imageBlock,
    fullImage,
    fullImageContainer,
    saveButton,
    clearCanvasButton,
    cropArea = null,
    onPredict = () =>
    {
    },
    onError = (error) => console.warn(error)
)
{
    let predictionUrl

    if (cropArea === null)
    {
        predictionUrl = `/predict/${project.id_project}/${activeLabel}`
    }
    else
    {
        const {x, y, width, height} = cropArea
        predictionUrl = `/predict_with_crop/${project.id_project}/${activeLabel}?x=${x}&y=${y}&width=${width}&height=${height}`
    }

    const imageUrl = fullImage.src

    fetch(imageUrl)
        .then((response) => response.blob())
        .then((blob) =>
        {
            const formData = new FormData()
            const fileName = "full_image.png"
            formData.append("file", blob, fileName)

            return fetch(predictionUrl, {
                method: "POST",
                body: formData
            })
        })
        .then((response) =>
        {
            if (!response.ok)
            {
                const error = new Error("Prediction API returned an error.")
                onError(error.message)
                throw error
            }
            return response.blob()
        })
        .then((blob) =>
        {
            const maskUrl = URL.createObjectURL(blob)
            overlayMaskOnImage(
                imageBlock,
                fullImage,
                fullImageContainer,
                maskUrl,
                project.labels,
                activeLabel,
                true,
                saveButton,
                clearCanvasButton
            )
            onPredict()
        })
        .catch((error) =>
        {
            onError("Error during prediction:" + error)
        })
}
