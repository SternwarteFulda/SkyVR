# SkyVR 🌌

**SkyVR** is a multi-user virtual reality experience under the sky, enabling users to explore the night sky together. Built with web standards, it brings celestial data to life directly in your browser.

## ✨ Features

- **Multi-User Exploration**: Join rooms with others, see their avatars, and communicate in real-time.
- **VR Ready**: Fully immersive experience compatible with WebXR-enabled headsets (Quest, etc.) via A-Frame.
- **Cross-Platform**: accessible from desktop browsers and mobile devices.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/SternwarteFulda/SkyVR.git
    cd SkyVR
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```
    *Note: This will automatically run a postinstall patch for the A-Frame environment component.*

3.  Set up environment variables:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` to add your TURN server credentials (if needed for production NAT traversal) and optionally configure custom Imprint/Privacy Policy URLs.

### Running locally

Start the server:

```bash
npm start
```

**⚠️ Important: SSL Required**

**Networked A-Frame requires SSL/HTTPS to function** - this applies to **all environments**, including local development. Multi-user networking features **will not work** over HTTP, even on local networks. You must set up SSL certificates for development and production.

### Deployment

For production deployment, it is **strongly recommended** to:

1. Install SkyVR on a server behind a **reverse proxy** (e.g., Nginx, Apache, Caddy)
2. Configure SSL certificates (e.g., using Let's Encrypt)
3. Proxy requests from HTTPS to your Node.js server (Default port: `8080`)

Without SSL, WebRTC connections (used for multi-user networking) will fail in most modern browsers due to security restrictions.

## 🛠️ Built With

*   **[A-Frame](https://aframe.io/)** (MIT) - WebVR framework for building virtual reality experiences.
*   **[Networked-Aframe](https://github.com/networked-aframe/networked-aframe)** (MIT) - Multi-user networking for A-Frame.
*   **[A-Frame Environment](https://github.com/supermedium/aframe-environment-component)** (MIT) - Infinite backgrounds for A-Frame.
*   **[A-Frame Extras](https://github.com/c-frame/aframe-extras)** (MIT) - Add-ons and helpers for A-Frame.
*   **[A-Frame Multi-Camera](https://github.com/diarmidmackenzie/aframe-multi-camera)** (MIT) - System for multiple cameras in A-Frame.
*   **[A-Frame Render Order](https://github.com/supermedium/superframe/tree/master/components/render-order)** (MIT) - Component to manually set rendering order for A-Frame entities.
*   **[Astronomy Engine](https://github.com/cosinekitty/astronomy)** (MIT) - Rigorous calculations of celestial body positions.

## 📚 Data & Attributions

We gratefully acknowledge the use of data and assets from:

*   **Star Data (ATHYG)**: ATHYG database by David Nash / Astronexus. (CC BY 4.0)
*   **Constellation Art**: Created by Johan Meuris (Jomejome). (Free Art License)
*   **Gaia Milky Way**: Data from the European Space Agency (ESA) mission Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC). (CC BY-SA 3.0 IGO)
*   **Moon Textures**: NASA's Scientific Visualization Studio. (Public Domain)
*   **Font**: 'Outfit' by Smartsheet Inc. (OFL)

For a full detailed list of credits and licenses, please visit the **About & Attribution** page within the application (accessible from the Lobby).

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**. See the `LICENSE` file for details.