from re import sub
from shutil import move
from os import path, remove, rename


def transliterate(name):
    letters = {'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
               'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
               'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
               'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
               'я': 'ya', 'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
               'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N',
               'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'H',
               'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sh', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E',
               'Ю': 'Yu', 'Я': 'Ya', ' ': '_', '-': '-', ',': '', '?': '', '!': '',
               '@': '', '#': '', '$': '', '%': '', '^': '', '&': '', '*': '', '(': '', ')': '',
               '=': '', '+': '', ':': '', ';': '', '<': '', '>': '', '\'': '', '"': '', '\\': '',
               '/': '', '№': '', '[': '', ']': '', '{': '', '}': ''}

    transliterated = ''.join([letters.get(char, char) for char in name])
    return sub(r'[^A-Za-z0-9_\-.]+', '', transliterated)


def safe_move(source_file, destination_folder, set_new_name=None):
    destination_file = path.join(destination_folder, path.basename(source_file))

    if path.exists(destination_file):
        remove(destination_file)

    move(source_file, destination_folder)

    if set_new_name:
        new_destination_file = path.join(destination_folder, set_new_name)
        rename(destination_file, new_destination_file)
