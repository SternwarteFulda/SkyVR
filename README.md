# SkyVR 🌌

**SkyVR** is a multi-user virtual reality experience under the sky, enabling users to explore the night sky together. Built with web standards, it brings celestial data to life directly in your browser.

## ✨ Features

- **Multi-User Exploration**: Join rooms with others, see their avatars, and communicate in real-time.
- **VR Ready**: Fully immersive experience compatible with WebXR-enabled headsets (Quest, etc.) via A-Frame.
- **Cross-Platform**: accessible from desktop browsers and mobile devices.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v22 LTS or higher)
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
    Configure the variables in `.env` as described in the section below.

### Environment Variables (`.env`)

SkyVR uses environment variables defined in `.env` to configure ports, WebRTC ICE servers (STUN/TURN), and optional legal links:

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `8080` | Port for the HTTP and WebSocket server. |
| `STUN_URL_1` .. `_10` | No | Google public STUN | STUN server URLs for WebRTC NAT discovery (e.g. `stun:stun.example.com:3478`). |
| `TURN_URL_1` .. `_10` | No | *None* | TURN server URLs for WebRTC relay traversal through restrictive NATs/firewalls (e.g. `turn:relay.example.com:3478`, `turns:relay.example.com:443?transport=tcp`). |
| `TURN_USER_1` .. `_10` | If TURN URL set | *None* | Username for authentication on `TURN_URL_X`. |
| `TURN_CRED_1` .. `_10` | If TURN URL set | *None* | Password/credential for authentication on `TURN_URL_X`. |
| `IMPRINT_URL` | No | *None* | Link to your Imprint/Impressum page (exposed via `/config` and displayed in the UI footer). |
| `PRIVACY_POLICY_URL` | No | *None* | Link to your Privacy Policy page (exposed via `/config` and displayed in the UI footer). |

> [!NOTE]
> - Up to 10 STUN and TURN server entries (`STUN_URL_1`–`10`, `TURN_URL_1`–`10`) can be configured. Each `TURN_URL_X` must have a matching `TURN_USER_X` and `TURN_CRED_X`.
> - If no STUN or TURN variables are set, SkyVR automatically falls back to Google's public STUN servers (`stun:stun1.l.google.com:19302` and `stun:stun2.l.google.com:19302`).
> - In production environments, configuring at least one TURN relay server is essential for users on mobile connections or behind symmetric NATs.
> - All configured STUN/TURN servers and legal links are actively monitored by the [`/health`](#monitoring--health-checks) endpoint.

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

### Monitoring & Health Checks

SkyVR includes a health check endpoint for monitoring systems and uptime checkers:

- **Endpoint**: `/health`
- **Method**: `GET` or `HEAD`

The endpoint reports server status, uptime, and the reachability of configured STUN/TURN servers and optional legal links defined in `.env`:
- **Active Probes**: Probes STUN (UDP binding requests), TURN (UDP/TCP/TLS), and legal links (`IMPRINT_URL`, `PRIVACY_POLICY_URL` via HTTP/HTTPS if configured) to verify infrastructure reachability.
- **Cached Probes**: Runs checks asynchronously in the background (default: every 60 seconds) so health check HTTP responses return instantly (<1ms).
- **HTTP 200 OK**: The server is up, ICE infrastructure (STUN and TURN) has operational servers, and any configured legal links are reachable.
- **HTTP 503 Service Unavailable**: The server is running but either all STUN/TURN servers are unreachable or configured legal links are failing (degraded state).

#### Example Response (`200 OK`)

```json
{
  "status": "ok",
  "uptime": 234.8,
  "timestamp": "2026-10-23T10:10:00.000Z",
  "iceServers": {
    "status": "healthy",
    "summary": {
      "stunAvailable": true,
      "turnAvailable": true,
      "stunUp": 2,
      "stunTotal": 2,
      "turnUp": 5,
      "turnTotal": 5,
      "total": 7,
      "up": 7,
      "down": 0
    },
    "lastChecked": "2026-10-23T10:09:45.000Z",
    "servers": [
      {
        "url": "stun:stun.example.com:3478",
        "protocol": "stun",
        "transport": "udp",
        "status": "up",
        "latencyMs": 14
      },
      {
        "url": "turn:turn.example.com:3478",
        "protocol": "turn",
        "transport": "udp",
        "status": "up",
        "latencyMs": 15
      }
    ]
  },
  "legalLinks": {
    "configured": true,
    "status": "healthy",
    "imprint": {
      "url": "https://example.com/imprint",
      "status": "up",
      "statusCode": 200,
      "latencyMs": 52
    },
    "privacyPolicy": {
      "url": "https://example.com/privacy",
      "status": "up",
      "statusCode": 200,
      "latencyMs": 48
    }
  }
}
```

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

*   **[Star Data (ATHYG)](https://codeberg.org/astronexus/athyg)**: ATHYG database by David Nash / Astronexus. (CC BY 4.0)
*   **[Constellation Art](https://johanmeuris.eu/work/stellarium-constellation-art/)**: Created by Johan Meuris (Jomejome). (Free Art License)
*   **[Gaia Milky Way](https://www.esa.int/ESA_Multimedia/Images/2020/12/The_colour_of_the_sky_from_Gaia_s_Early_Data_Release_32)**: Data from the European Space Agency (ESA) mission Gaia, processed by the Gaia Data Processing and Analysis Consortium (DPAC). (CC BY-SA 3.0 IGO)
*   **[Moon Textures](https://svs.gsfc.nasa.gov/4720)**: NASA's Scientific Visualization Studio. (Public Domain)
*   **[Jupiter Texture](https://science.nasa.gov/asset/hubble/jupiter-global-map-2019/)**: NASA, ESA, A. Simon (GSFC), M.H. Wong (UC Berkeley), and the OPAL team. (Public Domain)
*   **[Font](https://github.com/Outfitio/Outfit-Fonts)**: 'Outfit' by Smartsheet Inc. (OFL)

For a full detailed list of credits and licenses, please visit the **About & Attribution** page within the application (accessible from the Lobby).

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**. See the `LICENSE` file for details.