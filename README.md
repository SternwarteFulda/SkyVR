# SkyVR 🌌

**SkyVR** is a multi-user virtual reality experience under the sky, enabling users to explore the night sky together. Built with web standards, it brings celestial data to life directly in your browser.

## ✨ Features

- **Multi-User Exploration**: Join rooms with others, see their avatars, and communicate in real-time.
- **Realistic Sky**: Accurate star positions and constellation data powered by the Astronomy Engine and ATHYG star catalog.
- **Interactive Moon**: Detailed lunar visualization using LROC data and NASA visualizations.
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

### Running locally

Start the server:

```bash
npm start
```

Open your browser and navigate to `http://localhost:8080` (or the port specified in the console).

## 🛠️ Built With

*   **[A-Frame](https://aframe.io/)** (MIT) - WebVR framework for building virtual reality experiences.
*   **[Networked-Aframe](https://github.com/networked-aframe/networked-aframe)** (MPL 2.0) - Multi-user networking for A-Frame.
*   **[A-Frame Extras](https://github.com/c-frame/aframe-extras)** (MIT) - Add-ons and helpers for A-Frame.
*   **[A-Frame Environment](https://github.com/supermedium/aframe-environment-component)** (MIT) - Infinite backgrounds for A-Frame.
*   **[Astronomy Engine](https://github.com/cosinekitty/astronomy)** (MIT) - Rigorous calculations of celestial body positions.
*   **[Socket.IO](https://socket.io/)** (MIT) - Real-time bidirectional event-based communication.
*   **[Luxon](https://moment.github.io/luxon/)** (MIT) - Powerful date and time wrapper for JavaScript.

## 📚 Data & Attributions

SkyVR stands on the shoulders of giants. We gratefully acknowledge the use of data and assets from:

*   **Star Data (ATHYG)**: ATHYG database by David Nash / Astronexus. (CC BY 4.0)
*   **Constellation Art**: Created by Johan Meuris (Jomejome). (Free Art License)
*   **Gaia Sky Map**: Data from the European Space Agency (ESA) mission Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC). (CC BY-SA 3.0 IGO)
*   **Moon Textures**: NASA's Scientific Visualization Studio. (Public Domain)
*   **Font**: 'Outfit' by Jeremy Tribby. (OFL)
*   **Icons**:
    *   Mic On/Off, Fullscreen: [Google Material Design Icons](https://fonts.google.com/icons) (Apache 2.0)
    *   Door, Stamp, Arrow, Constellation, Draw, Cursor: SkyVR Contributors (AGPLv3)

For a full detailed list of credits and licenses, please visit the **About & Attribution** page within the application (accessible from the Lobby).

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**. See the `LICENSE` file for details.