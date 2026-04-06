import copy
import math
import random

from PIL import Image, ImageFilter, ImageEnhance


def apply_mask_blur(image, mask, radius=25):
    """Apply strong Gaussian blur to image regions where mask is white."""
    mask_l = mask.convert("L")
    blurred = image.filter(ImageFilter.GaussianBlur(radius=radius))
    return Image.composite(blurred, image, mask_l)


def _transform_keypoints(points, transform_fn):
    """Apply a coordinate transform function to all keypoints."""
    result = []
    for p in points:
        new_p = dict(p)
        if p.get("visible", 2) > 0:
            nx, ny = transform_fn(p["x"], p["y"])
            new_p["x"] = nx
            new_p["y"] = ny
        result.append(new_p)
    return result


def _all_visible_in_bounds(points, width, height):
    """Check that all visible keypoints are within image bounds."""
    for p in points:
        if p.get("visible", 2) > 0:
            if p["x"] < 0 or p["x"] >= width or p["y"] < 0 or p["y"] >= height:
                return False
    return True


def augment_horizontal_flip(image, skeletons):
    """Flip image and keypoints horizontally."""
    w = image.width
    flipped = image.transpose(Image.FLIP_LEFT_RIGHT)
    new_skeletons = []
    for skel in skeletons:
        new_skel = copy.deepcopy(skel)
        new_skel["points"] = _transform_keypoints(
            skel["points"], lambda x, y: (w - 1 - x, y)
        )
        if "bboxPad" in new_skel:
            pad = new_skel["bboxPad"]
            pad["left"], pad["right"] = pad.get("right", 0), pad.get("left", 0)
        new_skeletons.append(new_skel)
    return flipped, new_skeletons


def augment_rotation(image, skeletons, angle_range=(-15, 15)):
    """Rotate image and keypoints by a random angle."""
    angle = random.uniform(angle_range[0], angle_range[1])
    w, h = image.size
    cx, cy = w / 2.0, h / 2.0

    rotated = image.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=(0, 0, 0))

    rad = math.radians(-angle)  # PIL rotates counter-clockwise, we need clockwise for coords
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)

    def rotate_point(x, y):
        dx, dy = x - cx, y - cy
        nx = cos_a * dx - sin_a * dy + cx
        ny = sin_a * dx + cos_a * dy + cy
        return nx, ny

    new_skeletons = []
    for skel in skeletons:
        new_skel = copy.deepcopy(skel)
        new_skel["points"] = _transform_keypoints(skel["points"], rotate_point)
        if not _all_visible_in_bounds(new_skel["points"], w, h):
            return None
        new_skeletons.append(new_skel)

    return rotated, new_skeletons


def augment_brightness_contrast(image, skeletons):
    """Randomly adjust brightness and contrast. Keypoints unchanged."""
    brightness_factor = random.uniform(0.7, 1.3)
    contrast_factor = random.uniform(0.7, 1.3)

    result = ImageEnhance.Brightness(image).enhance(brightness_factor)
    result = ImageEnhance.Contrast(result).enhance(contrast_factor)

    return result, copy.deepcopy(skeletons)


def augment_random_crop(image, skeletons):
    """Crop around visible keypoints and resize back to original dimensions."""
    w, h = image.size

    all_x, all_y = [], []
    for skel in skeletons:
        for p in skel["points"]:
            if p.get("visible", 2) > 0:
                all_x.append(p["x"])
                all_y.append(p["y"])

    if not all_x:
        return None

    min_x, max_x = min(all_x), max(all_x)
    min_y, max_y = min(all_y), max(all_y)

    kp_w = max_x - min_x
    kp_h = max_y - min_y

    pad_x = max(kp_w * 0.3, 30)
    pad_y = max(kp_h * 0.3, 30)

    rand_pad = lambda p: random.uniform(p * 0.5, p * 1.5)

    crop_x1 = max(0, min_x - rand_pad(pad_x))
    crop_y1 = max(0, min_y - rand_pad(pad_y))
    crop_x2 = min(w, max_x + rand_pad(pad_x))
    crop_y2 = min(h, max_y + rand_pad(pad_y))

    crop_w = crop_x2 - crop_x1
    crop_h = crop_y2 - crop_y1

    if crop_w < 10 or crop_h < 10:
        return None

    cropped = image.crop((int(crop_x1), int(crop_y1), int(crop_x2), int(crop_y2)))
    resized = cropped.resize((w, h), Image.BICUBIC)

    scale_x = w / crop_w
    scale_y = h / crop_h

    def transform(x, y):
        return (x - crop_x1) * scale_x, (y - crop_y1) * scale_y

    new_skeletons = []
    for skel in skeletons:
        new_skel = copy.deepcopy(skel)
        new_skel["points"] = _transform_keypoints(skel["points"], transform)
        if not _all_visible_in_bounds(new_skel["points"], w, h):
            return None
        if "bboxPad" in new_skel:
            pad = new_skel["bboxPad"]
            for k in ("left", "right"):
                pad[k] = pad.get(k, 0) * scale_x
            for k in ("top", "bottom"):
                pad[k] = pad.get(k, 0) * scale_y
        new_skeletons.append(new_skel)

    return resized, new_skeletons


_AUGMENTATIONS = {
    "flip": augment_horizontal_flip,
    "rotate": augment_rotation,
    "brightness": augment_brightness_contrast,
    "crop": augment_random_crop,
}


def generate_augmented(image, skeletons, enabled_augs, count=1):
    """Generate augmented copies of image with transformed keypoints.

    Args:
        image: PIL Image
        skeletons: list of skeleton dicts
        enabled_augs: dict of aug_name -> bool
        count: number of augmented copies to generate

    Returns:
        list of (augmented_image, augmented_skeletons) tuples
    """
    active = [name for name, fn in _AUGMENTATIONS.items() if enabled_augs.get(name, False)]
    if not active:
        return []

    results = []
    for _ in range(count):
        num_augs = random.randint(1, min(3, len(active)))
        chosen = random.sample(active, num_augs)

        current_image = image.copy()
        current_skeletons = copy.deepcopy(skeletons)
        success = True

        for aug_name in chosen:
            aug_fn = _AUGMENTATIONS[aug_name]
            result = aug_fn(current_image, current_skeletons)
            if result is None:
                success = False
                break
            current_image, current_skeletons = result

        if success:
            results.append((current_image, current_skeletons))

    return results
