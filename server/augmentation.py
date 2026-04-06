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


# ---------------------------------------------------------------------------
# Image shape transforms (applied BEFORE augmentation, per-skeleton instance)
# ---------------------------------------------------------------------------


def shape_crop_to_square(image, skeletons):
    """Mode 1: Crop to the largest possible square around bbox, pad with black if needed.

    Algorithm:
    - Compute the combined bounding box of all visible keypoints (+ bboxPad).
    - The target square side = min(img_w, img_h) (touches shorter image edge).
    - If bbox does not fit inside that square, enlarge the square to contain bbox.
    - Centre the square on the bbox centre, shift to stay inside the image.
    - If the square extends beyond the image, paste the crop onto a black canvas.
    - Recalculate keypoint coordinates relative to the new crop origin.
    """
    w, h = image.size

    # Gather bbox across all skeletons
    all_x, all_y = [], []
    for skel in skeletons:
        pts = skel.get("points", [])
        bbox_pad = skel.get("bboxPad")
        vis_x = [p["x"] for p in pts if p.get("visible", 2) > 0]
        vis_y = [p["y"] for p in pts if p.get("visible", 2) > 0]
        if vis_x:
            pad_l = bbox_pad.get("left", 0) if bbox_pad else 0
            pad_r = bbox_pad.get("right", 0) if bbox_pad else 0
            pad_t = bbox_pad.get("top", 0) if bbox_pad else 0
            pad_b = bbox_pad.get("bottom", 0) if bbox_pad else 0
            all_x.append(min(vis_x) - pad_l)
            all_x.append(max(vis_x) + pad_r)
            all_y.append(min(vis_y) - pad_t)
            all_y.append(max(vis_y) + pad_b)

    if not all_x:
        return image, skeletons  # nothing to crop

    bbox_x1 = min(all_x)
    bbox_y1 = min(all_y)
    bbox_x2 = max(all_x)
    bbox_y2 = max(all_y)
    bbox_w = bbox_x2 - bbox_x1
    bbox_h = bbox_y2 - bbox_y1
    bbox_cx = (bbox_x1 + bbox_x2) / 2
    bbox_cy = (bbox_y1 + bbox_y2) / 2

    # Target side: try min(w, h), but at least as large as bbox
    side = max(min(w, h), bbox_w, bbox_h)

    # Centre the square on the bbox centre
    sq_x1 = bbox_cx - side / 2
    sq_y1 = bbox_cy - side / 2
    sq_x2 = sq_x1 + side
    sq_y2 = sq_y1 + side

    # Try to shift the square to stay within the image (avoid black padding if possible)
    if sq_x1 < 0 and sq_x2 <= w:
        sq_x2 -= sq_x1
        sq_x1 = 0
    elif sq_x2 > w and sq_x1 >= 0:
        sq_x1 -= (sq_x2 - w)
        sq_x2 = w
    if sq_y1 < 0 and sq_y2 <= h:
        sq_y2 -= sq_y1
        sq_y1 = 0
    elif sq_y2 > h and sq_y1 >= 0:
        sq_y1 -= (sq_y2 - h)
        sq_y2 = h

    # Determine the actual crop region (clamped to image) and padding
    crop_x1 = max(0, int(sq_x1))
    crop_y1 = max(0, int(sq_y1))
    crop_x2 = min(w, int(sq_x2))
    crop_y2 = min(h, int(sq_y2))

    cropped = image.crop((crop_x1, crop_y1, crop_x2, crop_y2))

    # Offset inside the black canvas
    paste_x = int(max(0, -sq_x1))
    paste_y = int(max(0, -sq_y1))

    canvas_side = int(side)
    canvas = Image.new("RGB", (canvas_side, canvas_side), (0, 0, 0))
    canvas.paste(cropped, (paste_x, paste_y))

    # Keypoint offset: original coords -> new coords
    offset_x = sq_x1  # may be negative (= padding)
    offset_y = sq_y1

    new_skeletons = []
    for skel in skeletons:
        new_skel = copy.deepcopy(skel)
        new_skel["points"] = _transform_keypoints(
            skel["points"], lambda x, y: (x - offset_x, y - offset_y)
        )
        if "bboxPad" in new_skel:
            pass  # padding values stay the same (no scaling, just shift)
        new_skeletons.append(new_skel)

    return canvas, new_skeletons


def shape_pad_to_square(image, skeletons):
    """Mode 2: Pad image to 1:1 with black bars (letterbox)."""
    w, h = image.size
    if w == h:
        return image, copy.deepcopy(skeletons)

    side = max(w, h)
    canvas = Image.new("RGB", (side, side), (0, 0, 0))
    paste_x = (side - w) // 2
    paste_y = (side - h) // 2
    canvas.paste(image, (paste_x, paste_y))

    new_skeletons = []
    for skel in skeletons:
        new_skel = copy.deepcopy(skel)
        new_skel["points"] = _transform_keypoints(
            skel["points"], lambda x, y: (x + paste_x, y + paste_y)
        )
        new_skeletons.append(new_skel)

    return canvas, new_skeletons


def shape_stretch_to_square(image, skeletons):
    """Mode 4: Resize (stretch) to square. NOT recommended — distorts proportions."""
    w, h = image.size
    if w == h:
        return image, copy.deepcopy(skeletons)

    side = max(w, h)
    stretched = image.resize((side, side), Image.BICUBIC)
    scale_x = side / w
    scale_y = side / h

    new_skeletons = []
    for skel in skeletons:
        new_skel = copy.deepcopy(skel)
        new_skel["points"] = _transform_keypoints(
            skel["points"], lambda x, y: (x * scale_x, y * scale_y)
        )
        if "bboxPad" in new_skel:
            pad = new_skel["bboxPad"]
            for k in ("left", "right"):
                pad[k] = pad.get(k, 0) * scale_x
            for k in ("top", "bottom"):
                pad[k] = pad.get(k, 0) * scale_y
        new_skeletons.append(new_skel)

    return stretched, new_skeletons


def resize_longest_side(image, skeletons, target_size):
    """Resize image so the longest side equals target_size. Preserves aspect ratio."""
    w, h = image.size
    longest = max(w, h)
    if longest <= target_size:
        return image, copy.deepcopy(skeletons)

    scale = target_size / longest
    new_w = round(w * scale)
    new_h = round(h * scale)
    resized = image.resize((new_w, new_h), Image.BICUBIC)

    new_skeletons = []
    for skel in skeletons:
        new_skel = copy.deepcopy(skel)
        new_skel["points"] = _transform_keypoints(
            skel["points"], lambda x, y: (x * scale, y * scale)
        )
        if "bboxPad" in new_skel:
            pad = new_skel["bboxPad"]
            for k in ("left", "right", "top", "bottom"):
                pad[k] = pad.get(k, 0) * scale
        new_skeletons.append(new_skel)

    return resized, new_skeletons


def apply_shape_transform(image, skeletons, shape_mode, resize_mode, resize_size):
    """Apply shape transform and optional resize to an image + skeletons.

    Args:
        image: PIL Image
        skeletons: list of skeleton dicts
        shape_mode: "crop_square" | "pad_square" | "stretch_square" | "as_is"
        resize_mode: "as_is" | "custom"
        resize_size: int, target longest-side size (used when resize_mode="custom")

    Returns:
        (transformed_image, transformed_skeletons)
    """
    # Step 1: shape transform
    if shape_mode == "crop_square":
        image, skeletons = shape_crop_to_square(image, skeletons)
    elif shape_mode == "pad_square":
        image, skeletons = shape_pad_to_square(image, skeletons)
    elif shape_mode == "stretch_square":
        image, skeletons = shape_stretch_to_square(image, skeletons)
    # "as_is" — do nothing

    # Step 2: resize by longest side
    if resize_mode == "custom" and resize_size and resize_size > 0:
        image, skeletons = resize_longest_side(image, skeletons, resize_size)

    return image, skeletons


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
