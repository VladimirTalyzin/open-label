# OpenLabel: Advanced Image Annotation for AI with AntiLabeling

OpenLabel is a powerful, self-hosted image annotation tool designed to streamline the creation of high-quality datasets for training neural networks. It runs directly in your browser, requiring only Python on the backend, and offers unique features like **AntiLabeling** to help combat false positives in your AI models.

Whether you're working locally or need a server-based solution, OpenLabel provides an intuitive interface for raster and vector annotation, along with integrated model prediction capabilities.

**(Optional: Consider adding a GIF or a couple of screenshots here showing the interface in action, especially the labeling process and an AntiLabel example.)**
<!--
[[Screenshot 1]](https://open-label.poisk.com/static/promo/image1.png)
[[Screenshot 2]](https://open-label.poisk.com/static/promo/image2.png)
[[Screenshot 3]](https://open-label.poisk.com/static/promo/image3.png)
[[Screenshot 4]](https://open-label.poisk.com/static/promo/image4.png)
-->

## ✨ Key Features

*   **Innovative AntiLabel Feature:** Explicitly mark areas where an object *is not* present. This creates negative examples that are crucial for reducing false positives in object detection and segmentation models.
*   **Versatile Annotation Tools:**
    *   **Raster:** Brush and eraser tools for pixel-perfect segmentation masks.
    *   **Vector:** Bounding boxes (currently used for AntiLabels).
*   **Integrated Prediction:**
    *   Connect to your own model's prediction endpoint.
    *   Get initial annotations (masks) for objects, which can then be refined.
    *   Supports prediction on the full image or a user-defined cropped region.
*   **Project & Data Management:**
    *   Create and manage multiple annotation projects.
    *   Upload images (automatically converted to PNG).
    *   Define custom label sets with distinct colors.
    *   Import label configurations from LabelStudio XML or OpenLabel JSON.
*   **Efficient Workflow:**
    *   **Undo Functionality:** For raster mask edits.
    *   **Auto-Save:** Annotation progress is periodically saved.
    *   **Image Previews:** Fast-loading composite preview strip for quick navigation.
    *   **Zoom & Pan:** Navigate large images with ease.
*   **Flexible Deployment:**
    *   Run locally for individual use.
    *   Deploy as a server application for team collaboration.
*   **Minimal Dependencies:** Runs with Python and standard libraries; no complex setup or external databases required. All data is stored on the filesystem.

## 🚀 Why OpenLabel?

While many annotation tools exist, OpenLabel stands out with:

1.  **AntiLabeling:** This is a game-changer for training robust models. Providing explicit negative examples directly within the annotation process is often more effective than relying solely on random background patches.
2.  **Simplicity & Self-Containment:** Easy to get up and running. No need for Docker (unless you want to containerize it yourself), databases, or complicated installations.
3.  **Direct Control:** You host it, you control your data.
4.  **Focus on Practical AI Needs:** Features like prediction integration and AntiLabeling are born from real-world experience in developing and deploying computer vision models.

## 🛠️ Installation & Setup

1.  **Prerequisites:**
    *   Python 3.7+
    *   pip

2.  **Clone the repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/OpenLabel.git
    cd OpenLabel
    ```

3.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

4.  **Install dependencies:**
    (You'll need to create a `requirements.txt` file)
    ```bash
    pip install -r requirements.txt
    ```
    A typical `requirements.txt` would include:
    ```
    fastapi
    uvicorn[standard]
    Pillow
    httpx
    python-multipart
    # Add any other specific versions if necessary
    ```

5.  **Configuration (Optional):**
    Edit `settings.py` to change default settings like `PREVIEW_WIDTH` or `API_PORT`.

6.  **Run the application:**
    ```bash
    python main.py
    ```

7.  **Access OpenLabel:**
    Open your web browser and go to `http://localhost:API_PORT` (e.g., `http://localhost:8008` if `API_PORT` is 8008).

## 📖 Usage Guide

1.  **Launch OpenLabel** as described above.
2.  **Create a New Project:** Click the "Add Project" button.
3.  **Configure Project:**
    *   Give your project a name.
    *   Go to the "Labels" tab. Define your labels using either:
        *   **OpenLabel JSON format:**
            ```json
            [
              {"label": "Cat", "color": "#FF0000"},
              {"label": "Dog", "color": "#00FF00"}
            ]
            ```
        *   **LabelStudio XML format (subset):**
            ```xml
            <View>
              <Labels name="label" toName="image">
                <Label value="Cat" background="red"/>
                <Label value="Dog" background="green"/>
              </Labels>
              <Image name="image" value="$image"/>
            </View>
            ```
    *   (Optional) Go to the "Settings" tab and provide a "Prediction URL" if you want to use an external model for pre-annotation. The URL should contain a `{label}` placeholder, e.g., `http://my-model-api.com/predict/{label}`.
4.  **Upload Images:** Go to the "Images" tab and click "Add image".
5.  **Start Annotating:**
    *   Click on an image to expand it. A toolbar will appear.
    *   **Select a Label:** Click on one of the colored label buttons (e.g., 'C' for Cat). The selected label button will be highlighted.
    *   **Annotation Tools:**
        *   **Brush (🖌️):** Draw raster masks. Adjust brush size with the slider.
        *   **Eraser (🧽):** Erase parts of a raster mask. Adjust eraser size.
        *   **AntiLabel (🚫):** Draw a bounding box where the selected label *should not* be detected. This is crucial for negative sampling.
        *   **Undo (↶):** Revert the last raster mask change for the current label.
        *   **Predict Objects (🤖):** If a prediction URL is set, this will call your model to get a mask for the active label.
        *   **Predict in Rectangle (▣):** Draw a rectangle, then predict objects only within that area for the active label.
        *   **Clear Canvas (⎚):** Clears the current label's raster mask.
    *   **Zoom (🔍️➕/🔍️➖):** Zoom in and out of the image.
    *   **Saving:** Annotations are auto-saved periodically. You can also manually trigger a save using the save (💾) button (though it's primarily for indication as auto-save is active).
6.  **Data Storage:**
    *   Projects are stored in the `projects/` directory.
    *   Each project has its own folder (e.g., `projects/1/`).
    *   Inside a project folder:
        *   `project_settings.json`: Contains project name, labels, image list, etc.
        *   `images/`: Original uploaded images.
        *   `preview/`: Smaller preview versions of images.
        *   `masks/`: PNG files for raster segmentation masks (`imagename_labelname.png`).
        *   `vector_data/`: JSON files for vector annotations (`imagename_labelname.json`).
        *   `undo/`: Stores previous versions of raster masks for the undo functionality.
        *   `all_previews.png`: A composite image of all previews for faster loading.

## 🤖 Core Concepts

### AntiLabel

The AntiLabel tool (🚫) allows you to draw a bounding box on an image and associate it with a specific label. This tells the system, "For the selected label (e.g., 'Cat'), this boxed region is a *negative* example – a Cat is definitely NOT here."

When you later export or use this data, these AntiLabel regions can be sampled as negative training examples for your model, helping it learn to distinguish the target object from similar-looking backgrounds or other objects, thus reducing false positives.

### Prediction Integration

If you have an existing object detection or segmentation model, you can integrate it with OpenLabel.
Set the "Prediction URL" in the project settings. This URL should accept a POST request with an image file and expect the label name as part of the URL path (e.g., `https://your.model.api/predict/{label}`).
The API should return a binary PNG mask.

*   **Full Image Prediction (🤖):** Sends the entire current image to your model.
*   **Predict in Rectangle (▣):** Allows you to draw a rectangle on the image. Only this cropped portion is sent to your model. The returned mask is then placed back onto the original image at the correct coordinates.

This feature is excellent for bootstrapping annotations – get a rough mask from your model, then quickly refine it using the brush and eraser.

## 🛠️ Technologies Used

*   **Backend:**
    *   Python 3
    *   FastAPI: For building the robust and efficient API.
    *   Pillow (PIL Fork): For image processing (previews, mask handling).
    *   Uvicorn: ASGI server to run FastAPI.
    *   HTTPX: For making asynchronous requests to prediction servers.
*   **Frontend:**
    *   HTML5
    *   CSS3
    *   Vanilla JavaScript: For all client-side interactions and dynamic content.
*   **Data Formats:**
    *   JSON: For project settings, label definitions, and vector mask data.
    *   PNG: For image storage and raster masks.

## 🗺️ Future Roadmap / To-Do

*   [ ] More vector annotation tools (e.g., polygons, polylines).
*   [ ] Export annotations in common formats (COCO, Pascal VOC, YOLO).
*   [ ] Customizable hotkeys for tools and actions.
*   [ ] User authentication and multi-user support.
*   [ ] Enhanced UI/UX for even smoother workflows.
*   [ ] Dockerization for easier deployment.
*   [ ] Comprehensive test suite.

## 🤝 Contributing

Contributions are welcome! Whether it's bug fixes, feature enhancements, or documentation improvements, please feel free to:

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/AmazingFeature`).
3.  Make your changes.
4.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
5.  Push to the branch (`git push origin feature/AmazingFeature`).
6.  Open a Pull Request.

Please ensure your code adheres to a reasonable coding standard and include tests for new features if applicable.

## 📄 License

This project is licensed under the Apache 2.0 License. See the `LICENSE` file for details.
