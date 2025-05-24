from os import path

SPLIT_SIZE = 256

classes = \
{
    "Road":
    {
        "labels": ["Road"],
        "color": "#C0C0C0",
        "operations":
        [
            {"command": "connect", "parameter": 10, "unit": "pixel"},
            {"command": "min_square", "parameter": 300, "unit": "pixel"},
            {"command": "linearity", "parameter": 7, "unit": "pixel", "parameter2": 100, "unit2": "pixel"}
        ]
    },
    
    "Old road":
    {
        "labels": ["Old road"],
        "color": "#D2B48C",
        "operations":
        [
            {"command": "connect", "parameter": 10, "unit": "pixel"},
            {"command": "min_square", "parameter": 300, "unit": "pixel"},
            {"command": "linearity", "parameter": 7, "unit": "pixel", "parameter2": 70, "unit2": "pixel"}
        ]
    },
    
    "Shoreline":
    {
        "labels": ["Lake", "River", "Shoreline"],
        "color": "#0000FF",
        "operations":
        [
            {"command": "connect", "parameter": 10, "unit": "pixel"},
            {"command": "min_square", "parameter": 300, "unit": "pixel"},
            {"command": "linearity", "parameter": 7, "unit": "pixel", "parameter2": 70, "unit2": "pixel"},
            {"command": "ovality", "parameter": 4, "unit": "pixel", "parameter2": 70, "unit2": "pixel"}
        ]
    },
    
    "Ruins": 
    {
        "labels": ["Fortress", "Foundation"],
        "color": "#786D5F",
        "operations":
        [
            {"command": "connect", "parameter": 100, "unit": "pixel"},
            {"command": "max_square", "parameter": 10000, "unit": "pixel"},
            {"command": "ovality", "parameter": 4, "unit": "pixel", "parameter2": 50, "unit2": "pixel"}
        ]
    },
    
    "Kurgan":
    {
        "labels": ["Kurgan", "Around the object"],
        "color": "#32CD32",
        "operations":
        [
            {"command": "connect", "parameter": 100, "unit": "pixel"},
            {"command": "max_square", "parameter": 10000, "unit": "meter2"},
            {"command": "ovality", "parameter": 4, "unit": "pixel", "parameter2": 50, "unit2": "pixel"}
        ]
    },
    
    "Sieidi":
    {
        "labels": ["Sieidi"],
        "color": "#00FF00",
        "operations":
        [
            {"command": "connect", "parameter": 100, "unit": "pixel"},
            {"command": "max_square", "parameter": 3000, "unit": "pixel"},
            {"command": "ovality", "parameter": 4, "unit": "pixel", "parameter2": 30, "unit2": "pixel"}
        ]
    },

    "Corner":
    {
        "labels": ["Corner"],
        "color": "#00FF00",
        "operations":
        [
            {"command": "connect", "parameter": 100, "unit": "pixel"},
            {"command": "max_square", "parameter": 3000, "unit": "pixel"}
        ]
    },

    "House":
    {
        "labels": ["HOUSE"],
        "color": "#808080",
        "operations":
        [
            {"command": "connect", "parameter": 100, "unit": "pixel"},
            {"command": "max_square", "parameter": 3000, "unit": "pixel"}
        ]
    },

    "Construction":
    {
        "labels": ["CONSTRUCTION"],
        "color": "#80A080",
        "operations":
        [
            {"command": "connect", "parameter": 100, "unit": "pixel"},
            {"command": "max_square", "parameter": 3000, "unit": "pixel"}
        ]
    },
    
    "Megalith Road":
    {
        "labels": ["MEGALIT ROAD"],
        "color": "#607D8B"
    }
}

classes_list = list(classes.keys())

scale_thresholds = \
{
    # "100m": 100,
    # "190m": 190,
    # "250m": 250,
    # "370m": 370,
    # "520m": 520,
    # "750m": 750,
    # "1050m": 1050,
    # "1300m": 1300,
    # "1500m": 1500,
    # "2000m": 2000,
    # "2500m": 2500,
    # "3000m": 3000,
    # "3400m": 3400,
    # "4000m": 4000,
    # "6000m": 6000,
    "13000m": 13000
}

scales_list = list(scale_thresholds.keys())

# ROOT_PATH = "/notebooks"
ROOT_PATH = "E:/PythonProjects/JorkMaps"

# Путь к папке с картинками
IMAGES_PATH = path.join(ROOT_PATH, 'training_images')

# Путь к папке с масками разметки
MASKS_PATH = path.join(ROOT_PATH, 'training_masks')

# Путь к папке с моделями
MODELS_PATH = path.join(ROOT_PATH, "models")

# Путь к папке с тестовыми картами
TEST_PATH = path.join(ROOT_PATH, "test")

# Путь к папке для сохранения результатов
RESULT_PATH = path.join(ROOT_PATH, "result")

# Путь к разбитым изображениям для обучения
SPLIT_IMAGES_PATH = path.join(ROOT_PATH, 'splitted_images')
SPLIT_MASKS_PATH = path.join(ROOT_PATH, 'splitted_masks')

# Путь к папке с моделями в формате onnx
ONNX_PATH = path.join(ROOT_PATH, "onnx")