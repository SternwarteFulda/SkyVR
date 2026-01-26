# SkyVR User Manual

Welcome to **SkyVR**, a shared, immersive virtual reality astronomy simulation. This manual guides you through the application's features, controls, and tools.

## Table of Contents

- [The Lobby](#the-lobby)
  - [Solo Mode vs Multiplayer](#solo-mode-vs-multiplayer)
  - [Room Setup](#room-setup)
  - [Identity & Avatar](#identity--avatar)
  - [Voice Communication](#voice-communication)
  - [Language Selection](#language-selection)
- [Getting Started](#getting-started)
- [VR Mode (Headset)](#vr-mode-headset)
  - [VR Controllers](#vr-controllers)
  - [VR Infobar](#vr-infobar)
  - [VR Modes](#vr-modes)
    - [Draw Mode](#draw-mode)
    - [Stamp Mode](#stamp-mode)
    - [Stick Figure Mode](#stick-figure-mode)
    - [Constellation Mode](#constellation-mode)
    - [Identify Mode](#identify-mode)
  - [Using the Laser Pointer in VR](#using-the-laser-pointer-in-vr)
  - [VR Control Panel](#vr-control-panel)
  - [Multiplayer in VR](#multiplayer-in-vr)
- [Desktop Mode (2D)](#desktop-mode-2d)
  - [Navigation](#navigation)
  - [The Infobar (Toolbar)](#the-infobar-toolbar)
  - [2D Modes](#2d-modes)
    - [Draw Mode](#draw-mode-1)
    - [Stamp Mode](#stamp-mode-1)
    - [Stick Figure Mode](#stick-figure-mode-1)
    - [Constellation Mode](#constellation-mode-1)
    - [Identify Mode](#identify-mode-1)
    - [Pointer Mode](#pointer-mode)
  - [Astronomy Controls (2D)](#astronomy-controls-2d)

---

## 🚪 The Lobby

Before entering the virtual observatory, you'll configure your session in the Lobby.

### Solo Mode vs Multiplayer

**Solo Mode** (Toggle at the top):
- Standalone session without networking
- No voice chat or multiplayer features
- Faster loading (skips network connection)
- Perfect for personal exploration

**Multiplayer Mode** (Default):
- Connect with others in shared rooms
- Voice chat with spatial audio
- See other players' avatars and interactions
- Collaborative astronomy experience

### Room Setup

**Room Channel**:
- Enter a room name or number (e.g., "1984" or "sky-vr-01")
- Only lowercase letters (a-z), numbers (0-9), and hyphens (-) allowed
- Maximum 16 characters
- Anyone with the same room name will join the same session
- A random 4-digit number is suggested by default

### Identity & Avatar

**Observer Identity**:
- Enter your display name (nametag visible to others)
- Maximum 20 characters
- Letters, numbers, spaces, and hyphens allowed
- A random nickname is generated if left empty

**Avatar Core Signature** (Color):
- Choose your avatar color from 8 vibrant options
- This color represents you in the virtual space
- Visible on your avatar's head and in your drawings

**Visual Presence** (if webcam available):
- **Avatar**: Stylized head representation (default)
- **Webcam**: Share your camera feed as a floating circle

### Voice Communication

**Voice Communication Toggle**:
- Enable to use your microphone for spatial chat
- Spatial audio: hear others louder when they're nearby
- Can be toggled later in-app
- Push-to-talk available with Grip button (VR) or Space key (Desktop)

### Language Selection

**Language Switcher** (Top right corner):
- **EN**: English interface and labels
- **DE**: German (Deutsch) interface and labels
- Language can also be changed later in the Astronomy Controls panel
- Your selection is saved for future visits

**Join Room Button**:
- Click to enter the observatory with your settings
- Settings are saved for your next visit

---

## 🚀 Getting Started

When you launch SkyVR, you will see a loading screen as the application initializes:
1.  **Initializing Application**: Loading core scripts.
2.  **Connecting to Network**: Establishing a connection to the multiplayer server.
3.  **Downloading Star Catalog**: Fetching the positions of ~118,000 stars (Hipparcos catalog).
4.  **Synchronizing Reality**: Aligning your simulation time and celestial positions with the server.

Once complete, you will be placed in the virtual observatory.

---

# 🥽 VR Mode (Headset)

Enter VR mode by clicking the **"VR"** button in the bottom right corner (on supported devices like Meta Quest).

## VR Controllers

### Left Controller (Navigation & Tools)

**Thumbstick:**
-   **Left/Right**: Control time flow (time travel). Push further for faster time changes. Hold trigger while moving stick for turbo speed (5x).
-   **Up/Down (full deflection)**: Adjust latitude (tilt your view north/south).

**Buttons:**
-   **X Button**: Toggle binoculars on/off.
-   **Y Button (tap)**: Cycle through modes (Draw → Stamp → Stick Figure → Constellation → Identify → Pointer).
-   **Y Button (hold)**: *(Reserved for future features)*
-   **Grip (hold)**: Push-to-talk (enable microphone while held).
-   **Menu Button**: Toggle VR Control Panel (Astronomy Controls).

**Binoculars:**
-   Your left hand holds virtual binoculars. Bring them close to your headset to activate magnified view.
-   Useful for resolving double stars or craters on the Moon, viewing faint objects, and examining details.

### Right Controller (Interaction)

**Laser Pointer:**
-   **Grip (hold)**: Show/hide laser pointer for selecting and pointing.
-   **Thumbstick Click**: Toggle between Beam Mode and Arrow Mode.
-   In **Pointer Mode**, the laser can switch between:
    -   **Beam Mode**: Standard laser beam for pointing.
    -   **Arrow Mode**: Directional arrow (use thumbstick to rotate arrow direction).

**Buttons:**
-   **Trigger**: Interact based on current mode (see mode details below).
-   **A Button (tap)**: Undo/remove last action in current mode.
-   **A Button (hold 1 second)**: Clear ALL items in current mode (drawings, stamps, labels, etc.).
-   **B Button**: Confirm/place action in current mode (see mode details below).

**Thumbstick:**
-   **Click**: Toggle between Beam and Arrow pointer modes.
-   **Left/Right (when grip released)**: Snap turn - rotate view in 30° increments.
-   **Any direction (when grip held in Arrow Mode)**: Rotate arrow direction.

---

## VR Infobar

The VR Infobar is a floating menu that appears in front of you in VR. Access it by looking down or by pressing **Y** on the left controller.

**Infobar Features:**
-   <img src="assets/icons/door.svg" class="icon-inline"> **Exit Room**: Leave the current session and return to lobby.
-   <img src="assets/icons/mic-on.svg" class="icon-inline"> **Microphone**: Toggle your microphone on/off.
-   **Mode Selection**: Click any mode icon to switch directly to that mode (Draw, Stamp, Stick Figure, Constellation, Identify, Pointer).

---

## VR Modes

Press **Y** on the left controller to cycle through modes, or select a mode directly from the VR Infobar. The current mode is shown on the VR Infobar.

### <img src="assets/icons/draw.svg" class="icon-inline"> Draw Mode

Freehand drawing in the sky.

**Controls:**
-   **B Button (hold)**: Draw while holding.
-   **B Button (release)**: Stop drawing.
-   **A Button (tap)**: Undo last stroke.
-   **A Button (hold 1 second)**: Clear ALL drawings.

### <img src="assets/icons/shape-star.svg" class="icon-inline"> Stamp Mode

Place star-shaped markers that snap to visible stars.

**Controls:**
-   **Laser Pointer**: Aim at desired location.
-   **B Button**: Place stamp at pointer location.
-   **A Button (tap)**: Remove last stamp.
-   **A Button (hold 1 second)**: Clear ALL stamps.

### <img src="assets/icons/stickfigure.svg" class="icon-inline"> Stick Figure Mode

Show stick figure patterns for constellations (simplified line drawings connecting constellation stars).

**Controls:**
-   **Laser Pointer**: Aim at a constellation.
-   **B Button**: Toggle stick figure for the constellation you're pointing at.
-   **A Button (tap)**: Remove stick figure for the constellation you're pointing at.
-   **A Button (hold 1 second)**: Clear ALL stick figures.

### <img src="assets/icons/constellation.svg" class="icon-inline"> Constellation Mode

Toggle artistic constellation illustrations.

**Controls:**
-   **Laser Pointer**: Aim at a constellation.
-   **B Button**: Show illustration for the constellation you're pointing at.
-   **A Button (tap)**: Hide illustration for the constellation you're pointing at.
-   **A Button (hold 1 second)**: Clear ALL illustrations.

### <img src="assets/icons/gps_not_fixed.svg" class="icon-inline"> Identify Mode

Point at stars to see their names, magnitudes, and distances.

**Controls:**
-   **Laser Pointer**: Aim at a star to see its information.
-   **B Button**: Place a permanent label at the star.
-   **A Button (tap)**: Remove last placed label.
-   **A Button (hold 1 second)**: Clear ALL labels.

---

## Using the Laser Pointer in VR

The laser pointer is **always available in any mode** by holding the **Grip** button on the right controller.

**Pointer Controls:**
-   **Grip (hold)**: Show/hide laser pointer.
-   **Thumbstick Click**: Toggle between Beam Mode and Arrow Mode.
-   **Thumbstick (when grip held in Arrow Mode)**: Rotate arrow direction.
-   **Thumbstick Left/Right (when grip released)**: Snap turn to rotate view.

**Pointer Modes:**
-   **Beam Mode**: Standard laser beam for pointing at objects.
-   **Arrow Mode**: Directional arrow that can be rotated to point in specific directions.

---

## VR Control Panel

Press the **Menu Button** on the left controller to open the VR Control Panel.

### Time Tab
-   **Year, Month, Day, Hour, Minute**: Adjust date and time.
-   **Sidereal Day +/-**: Jump forward/backward by one sidereal day.
-   **Now**: Reset to current real-world time.

### Location Tab
-   **Latitude / Longitude**: Adjust your observing location on Earth.
-   **N/S and E/W**: Toggle hemispheres.

### View Tab
-   **Meridian**: North-South line through zenith.
-   **Equator**: Celestial equator.
-   **Ecliptic**: Path of sun and planets.
-   **Cardinal Points**: N, S, E, W markers on horizon.
-   **IAU Boundaries**: Official constellation boundaries.
-   **Celestial Poles**: North and South Celestial Pole markers.

---

## Multiplayer in VR

-   **Avatars**: See other players as avatars.
-   **Voice Chat**: Spatial audio - hear people louder when they're close.
-   **Binoculars**: Others can see when you're using binoculars.
-   **Laser Pointers**: Others can see your laser pointer and drawings.

---

# 🖥️ Desktop Mode (2D)

## Navigation

**Mouse Controls:**
-   **Click & Drag**: Look around (Camera Mode) or move cursor (Cursor Mode).
-   **Scroll Wheel**: Zoom in/out (adjust field of view).

**Keyboard Shortcuts:**
-   **H**: Toggle HUD / Infobar visibility.
-   **Space**: Toggle Microphone.

**Mode Switch:**
-   Click <img src="assets/icons/mouse-move.svg" class="icon-inline"> to toggle between:
    -   **Camera Mode**: Click and drag to look around.
    -   **Cursor Mode**: Moves a cursor on the sky for drawing or identifying stars.

---

## The Infobar (Toolbar)

Located at the bottom of the screen.

| Icon | Tool | Description |
| :--- | :--- | :--- |
| <img src="assets/icons/door.svg" class="icon-inline"> | **Exit Room** | Leave session and return to lobby. |
| <img src="assets/icons/mic-on.svg" class="icon-inline"> | **Microphone** | Toggle voice chat. |
| <img src="assets/icons/camera-on.svg" class="icon-inline"> | **Camera** | Toggle webcam (if available). |
| <img src="assets/icons/fullscreen.svg" class="icon-inline"> | **Fullscreen** | Enter fullscreen mode. |
| <img src="assets/icons/mouse-move.svg" class="icon-inline"> | **Mouse/Sky** | Switch between Camera and Cursor modes. |
| <img src="assets/icons/settings.svg" class="icon-inline"> | **Settings** | Open Astronomy Controls panel. |
| <img src="assets/icons/zoom-in.svg" class="icon-inline"> <img src="assets/icons/zoom-out.svg" class="icon-inline"> | **Zoom** | Adjust field of view. |

---

## 2D Modes

Click a mode icon to activate it. Sub-options appear when selected.

### <img src="assets/icons/draw.svg" class="icon-inline"> Draw Mode

Freehand 3D drawing.

**Controls:**
-   **Click & Drag**: Draw in the sky.
-   **Color Palette**: Choose from Yellow, Red, Green, Cyan, White.
-   **Undo** <img src="assets/icons/undo.svg" class="icon-inline">: Remove last stroke.
-   **Clear** <img src="assets/icons/clear.svg" class="icon-inline">: Clear all drawings.

### <img src="assets/icons/shape-star.svg" class="icon-inline"> Stamp Mode

Place star-shaped markers that snap to visible stars.

**Controls:**
-   **Click**: Place stamp at cursor location.
-   **Undo**: Remove last stamp.
-   **Clear**: Clear all stamps.

### <img src="assets/icons/stickfigure.svg" class="icon-inline"> Stick Figure Mode

Show stick figure patterns for constellations.

**Controls:**
-   **Click**: Toggle stick figure for constellation under cursor.
-   **Show All**: Display all stick figures.
-   **Clear All**: Remove all stick figures.

### <img src="assets/icons/constellation.svg" class="icon-inline"> Constellation Mode

Toggle artistic constellation illustrations.

**Controls:**
-   **Click**: Toggle illustration for constellation under cursor.
-   **Show All**: Display all illustrations.
-   **Clear All**: Hide all illustrations.

### <img src="assets/icons/gps_not_fixed.svg" class="icon-inline"> Identify Mode

Reveal star information.

**Controls:**
-   **Click**: Place label showing star name, Hipparcos ID, magnitude, and distance.
-   **Undo**: Remove last label.
-   **Clear**: Remove all labels.

### <img src="assets/icons/arrow.svg" class="icon-inline"> Pointer Mode

Laser pointer for pointing at objects and collaborating with others.

**Controls:**
-   **Click & Drag**: Point at objects to show others what you're looking at.

---

## Astronomy Controls (2D)

Click **Settings** <img src="assets/icons/settings.svg" class="icon-inline"> to open the Control Panel.

### Visibility
Toggle reference lines:
-   **Meridian**: North-South line through zenith.
-   **Equator**: Celestial equator.
-   **Ecliptic**: Path of sun and planets.
-   **Cardinal Points**: N, S, E, W markers.
-   **IAU Boundaries**: Constellation boundaries.
-   **Celestial Poles**: NCP and SCP markers.

### Location
-   **Latitude / Longitude**: Set observing location.
-   **N/S and E/W**: Toggle hemispheres.

### Time Shift
-   **Date/Time**: Adjust Year, Month, Day, Hour, Minute.
-   **Sidereal Day**: Jump by one sidereal day.
-   **Now**: Reset to current time.

### Language
-   Switch between English and German (Deutsch).

---

*SkyVR User Manual - Version 0.0.1*

