#!/bin/bash

# Script to sync npm dependencies to public/vendor directory
echo "Syncing vendor dependencies to public/vendor..."

VENDOR_DIR="public/vendor"

# Create directories
mkdir -p "$VENDOR_DIR/aframe"
mkdir -p "$VENDOR_DIR/aframe-extras"
mkdir -p "$VENDOR_DIR/aframe-troika-text"
mkdir -p "$VENDOR_DIR/aframe-geometry-merger-component"
mkdir -p "$VENDOR_DIR/aframe-render-order-component"
mkdir -p "$VENDOR_DIR/socket.io"
mkdir -p "$VENDOR_DIR/networked-aframe"
mkdir -p "$VENDOR_DIR/astronomy-engine"
mkdir -p "$VENDOR_DIR/luxon"
mkdir -p "$VENDOR_DIR/i18next"
mkdir -p "$VENDOR_DIR/i18next-browser-languagedetector"
mkdir -p "$VENDOR_DIR/marked"
mkdir -p "$VENDOR_DIR/marked-gfm-heading-id"
mkdir -p "$VENDOR_DIR/dompurify"

# Copy files
# A-Frame: Find the versioned file and copy as aframe.min.js
AFRAME_VERSION_FILE=$(ls node_modules/aframe/dist/aframe-v*.min.js | head -n 1)
if [ -f "$AFRAME_VERSION_FILE" ]; then
    cp "$AFRAME_VERSION_FILE" "$VENDOR_DIR/aframe/aframe.min.js"
    echo "✓ A-Frame"
else
    echo "✗ A-Frame not found"
fi

cp node_modules/aframe-extras/dist/aframe-extras.primitives.min.js "$VENDOR_DIR/aframe-extras/" && echo "✓ A-Frame Extras"
cp node_modules/aframe-troika-text/dist/aframe-troika-text.min.js "$VENDOR_DIR/aframe-troika-text/" && echo "✓ Troika Text"
cp node_modules/aframe-geometry-merger-component/dist/aframe-geometry-merger-component.min.js "$VENDOR_DIR/aframe-geometry-merger-component/" && echo "✓ Geometry Merger"
cp node_modules/aframe-render-order-component/dist/aframe-render-order-component.min.js "$VENDOR_DIR/aframe-render-order-component/" && echo "✓ Render Order"
cp node_modules/socket.io/client-dist/socket.io.min.js "$VENDOR_DIR/socket.io/" && echo "✓ Socket.io"
cp node_modules/networked-aframe/dist/networked-aframe.min.js "$VENDOR_DIR/networked-aframe/" && echo "✓ Networked-AFrame"
cp node_modules/astronomy-engine/astronomy.browser.min.js "$VENDOR_DIR/astronomy-engine/" && echo "✓ Astronomy Engine"
cp node_modules/luxon/build/global/luxon.min.js "$VENDOR_DIR/luxon/" && echo "✓ Luxon"
cp node_modules/i18next/dist/umd/i18next.min.js "$VENDOR_DIR/i18next/" && echo "✓ i18next"
cp node_modules/i18next-browser-languagedetector/dist/umd/i18nextBrowserLanguageDetector.min.js "$VENDOR_DIR/i18next-browser-languagedetector/" && echo "✓ i18next Detector"
cp node_modules/marked/lib/marked.umd.js "$VENDOR_DIR/marked/marked.min.js" && echo "✓ Marked"
cp node_modules/marked-gfm-heading-id/lib/index.umd.js "$VENDOR_DIR/marked-gfm-heading-id/marked-gfm-heading-id.min.js" && echo "✓ Marked GFM Heading ID"
cp node_modules/dompurify/dist/purify.min.js "$VENDOR_DIR/dompurify/" && echo "✓ DOMPurify"

# Remote Assets
echo "Fetching/Updating remote assets (optional)..."

mkdir -p "$VENDOR_DIR/aframe-multi-camera"
if curl -sL "https://raw.githubusercontent.com/diarmidmackenzie/aframe-multi-camera/master/src/multi-camera.js" -o "$VENDOR_DIR/aframe-multi-camera/aframe-multi-camera.js"; then
    echo "✓ aframe-multi-camera updated"
else
    echo "⚠ Could not update aframe-multi-camera (will use local version)"
fi

mkdir -p "public/data"
# Dynamically discover the latest hyglike subset version from Codeberg
echo "Locating latest star data on Codeberg..."
SUBSET_PAGE="https://codeberg.org/astronexus/athyg/src/branch/main/data/subsets"
LATEST_FILENAME=$(curl -s "$SUBSET_PAGE" | grep -oE 'hyglike_from_athyg_v[0-9]+\.csv\.gz' | sort -V | tail -n 1)

if [ -n "$LATEST_FILENAME" ]; then
    echo "Found latest version: $LATEST_FILENAME"
    STAR_DATA_URL="https://codeberg.org/astronexus/athyg/media/branch/main/data/subsets/$LATEST_FILENAME"
    
    if curl -sL "$STAR_DATA_URL" -o "public/data/stars.csv.gz"; then
        gunzip -f "public/data/stars.csv.gz"
        echo "✓ Star Data updated (discovered $LATEST_FILENAME, saved as stars.csv)"
    else
        echo "⚠ Could not download $LATEST_FILENAME (will use local version)"
    fi
else
    echo "⚠ Could not discover latest star data version on Codeberg (will use local version)"
fi

mkdir -p "public/assets/constellations"
if curl -sL "https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/index.json" -o "public/assets/constellations/index.json"; then
    echo "✓ Constellation Data updated (Stellarium)"
else
    echo "⚠ Could not update Constellation Data (will use local version)"
fi

echo "Vendor sync complete."
