from typing import Optional
from io import BytesIO

import httpx
from fastapi import APIRouter, Form, HTTPException, UploadFile, File, Query, Path
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image

from helpers import get_settings_path
from json import load

router = APIRouter()


async def read_user_image_data(id_project, label, file):
    from os import path

    settings_file = get_settings_path(id_project)

    if not path.exists(settings_file):
        return None, None, JSONResponse(
            content={"error": "Settings file not found"},
            status_code=404
        )

    with open(settings_file, "r") as file_settings:
        settings_data = load(file_settings)

    prediction_url = settings_data.get('prediction_url')
    if not prediction_url:
        return None, None, JSONResponse(
            content={"error": "Please specify prediction URL in project settings before predicting objects."},
            status_code=400
        )

    url = prediction_url.format(label=label)

    file_content = await file.read()

    try:
        image = Image.open(BytesIO(file_content))
        return url, image, None

    except Exception as exception:
        return None, None, JSONResponse(
            content={"error": f"Failed to open the image: {exception}"},
            status_code=400
        )


async def call_predict(url, filename, image_bytes, content_type):
    async with httpx.AsyncClient() as client:
        files = {'file': (filename, image_bytes, content_type)}
        try:
            response = await client.post(url, files=files)
        except httpx.RequestError as exception:
            return None, JSONResponse(
                content={"error": f"Object prediction query failed: {exception}"},
                status_code=502
            )

    if response.status_code != 200:
        return None, JSONResponse(
            content={"error": f"Prediction request failed with status {response.status_code}"},
            status_code=response.status_code
        )

    return response, None


def parse_dimension(value: str, total: int, name: str) -> Optional[int]:
    if isinstance(value, str) and value.endswith('%'):
        try:
            percentage = float(value.rstrip('%'))
            if not (0 <= percentage <= 100):
                print(f"Percentage for {name} out of bounds: {percentage}%")
                return None
            pixel_value = (percentage / 100) * total
            return int(round(pixel_value))
        except ValueError:
            print(f"Invalid percentage format for {name}: {value}")
            return None
    else:
        try:
            pixel = int(value)
            if pixel < 0:
                print(f"Negative value for {name}: {pixel}")
                return None
            return pixel
        except ValueError:
            print(f"Invalid integer format for {name}: {value}")
            return None


@router.post("/predict/{id_project}/{label}", tags=["Project"])
async def predict(id_project: str, label: str, file: UploadFile = File(...)):
    url, image, error_response = await read_user_image_data(id_project, label, file)

    if error_response:
        return error_response

    if isinstance(image, Image.Image) and image.mode == 'RGBA':
        image = image.convert('RGB')

    output_buffer = BytesIO()
    image_format = image.format if isinstance(image, Image.Image) and image.format else 'PNG'
    image.save(output_buffer, format=image_format)
    image_bytes = output_buffer.getvalue()

    if image_format.upper() == 'JPEG':
        content_type = 'image/jpeg'
        filename = f"{file.filename.rsplit('.', 1)[0]}.jpg"
    else:
        content_type = 'image/png'
        filename = f"{file.filename.rsplit('.', 1)[0]}.png"

    response, error_response = await call_predict(url, filename, image_bytes, content_type)

    if error_response:
        return error_response

    return StreamingResponse(
        BytesIO(response.content),
        media_type=response.headers.get('content-type')
    )


@router.post("/predict_with_crop/{id_project}/{label}", tags=["Project"])
async def predict_with_crop(
    id_project: str = Path(..., description="Project ID"),
    label: str = Path(..., description="Label to recognize"),
    x: str = Query(..., description="X coordinate of the upper left corner of the area (pixels or percentage)"),
    y: str = Query(..., description="Y coordinate of the upper left corner of the area (pixels or percentage)"),
    width: str = Query(..., description="Area width (pixels or percentage)"),
    height: str = Query(..., description="Area height (pixels or percentage)"),
    file: UploadFile = File(..., description="Image to be recognized"),
):
    url, image, error_response = await read_user_image_data(id_project, label, file)

    if error_response:
        return error_response

    original_width, original_height = image.size

    parsed_x = parse_dimension(x, original_width, 'x')
    parsed_y = parse_dimension(y, original_height, 'y')
    parsed_width = parse_dimension(width, original_width, 'width')
    parsed_height = parse_dimension(height, original_height, 'height')

    if None in (parsed_x, parsed_y, parsed_width, parsed_height):
        return JSONResponse(
            content={"error": "Invalid format for x, y, width, or height. Use non-negative integers or percentage strings (e.g., '42.3333%'). "
                              "Percentages must be between 0% and 100%."},
            status_code=400
        )

    if parsed_width <= 0 or parsed_height <= 0:
        return JSONResponse(
            content={"error": "The width and height of the area must be greater than zero."},
            status_code=400
        )

    parsed_x = max(parsed_x, 0)
    parsed_y = max(parsed_y, 0)
    parsed_width = min(parsed_width, original_width - parsed_x)
    parsed_height = min(parsed_height, original_height - parsed_y)

    cropped_image = image.crop((parsed_x, parsed_y, parsed_x + parsed_width, parsed_y + parsed_height))

    if cropped_image.mode == 'RGBA':
        cropped_image = cropped_image.convert('RGB')

    output_buffer = BytesIO()
    cropped_image.save(output_buffer, format='PNG')
    cropped_content = output_buffer.getvalue()

    content_type = 'image/png'
    filename = f"{file.filename.rsplit('.', 1)[0]}_cropped.png"

    response, error_response = await call_predict(url, filename, cropped_content, content_type)

    if error_response:
        return error_response

    try:
        mask = Image.open(BytesIO(response.content)).convert("RGBA")
    except Exception as exception:
        return JSONResponse(
            content={"error": f"Failed to process the prediction response: {exception}"},
            status_code=500
        )

    transparent_image = Image.new("RGBA", image.size, (0, 0, 0, 0))
    transparent_image.paste(mask, (parsed_x, parsed_y), mask)

    final_buffer = BytesIO()
    transparent_image.save(final_buffer, format='PNG')
    final_buffer.seek(0)

    return StreamingResponse(
        final_buffer,
        media_type='image/png'
    )
