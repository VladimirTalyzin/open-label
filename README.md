# OpenLabel

A web-based image annotation platform for creating polygon masks, PNG masks, and skeleton/keypoint annotations. Supports multi-user collaboration with role-based access control.

## Features

- **Polygon/Vector Masks** — draw vector-based annotations directly on images
- **PNG Masks** — upload and edit raster masks with undo support
- **Skeleton Annotations** — keypoint-based pose annotation with customizable templates
- **Custom Model Predictions** — integrate external prediction APIs for assisted labeling
- **Multi-User Support** — groups, roles, and per-project access control
- **Admin Panel** — manage users, groups, and projects
- **Project Import/Export** — share projects as ZIP archives

## Tech Stack

| Layer    | Technology                      |
|----------|---------------------------------|
| Frontend | Vanilla JS (ES modules) + Vite  |
| CSS      | Bootstrap 5                     |
| Backend  | FastAPI + Uvicorn               |
| Database | SQLite                          |
| Images   | Pillow                          |

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** and npm

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/VladimirTalyzin/open-label.git
cd open-label
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Set up the backend

```bash
cd server
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt
```

## Running (Development)

You need two terminals — one for the frontend dev server and one for the API.

### Terminal 1 — Frontend (port 3000)

```bash
npm run dev
```

### Terminal 2 — Backend (port 8001)

```bash
cd server

# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate

uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Open http://localhost:3000 in your browser. The Vite dev server proxies API requests to the FastAPI backend automatically.

### Windows shortcut

Two batch files are provided for convenience:

- `start_ui.cmd` — starts the Vite dev server
- `start_api.cmd` — starts the FastAPI backend

## Building for Production

```bash
npm run build
```

The compiled frontend is output to `dist/`. In production the FastAPI server serves these static files directly — no separate frontend server is needed.

Start the production server:

```bash
cd server
uvicorn main:app --host 0.0.0.0 --port 8001
```

## Production Deployment (Linux)

Example systemd and Nginx configs are provided in the `deploy/` directory:

- `deploy/open-label.service` — systemd unit file
- `deploy/open-label.poisk.com.conf` — Nginx reverse proxy config

## Configuration

| Setting         | Default | Description                          |
|-----------------|---------|--------------------------------------|
| `API_PORT`      | `8001`  | Backend port (env variable)          |
| `PREVIEW_WIDTH` | `200`   | Thumbnail preview width in pixels    |

Admin password is stored in `server/admin_password.txt` (created automatically with default value `admin` on first run).

## Project Structure

```
open-label/
├── src/                  # Frontend source (JS, CSS, HTML)
├── server/
│   ├── main.py           # FastAPI application
│   ├── database.py       # SQLite database layer
│   ├── settings.py       # Configuration
│   ├── requirements.txt  # Python dependencies
│   └── projects/         # Project data storage (gitignored)
├── deploy/               # Systemd & Nginx configs
├── package.json          # Frontend dependencies & scripts
└── vite.config.js        # Vite build & proxy config
```

## License

MIT
