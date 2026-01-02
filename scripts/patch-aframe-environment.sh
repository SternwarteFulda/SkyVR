#!/bin/bash
# Post-install script to patch aframe-environment-component with SkyVR customizations

echo "Applying SkyVR patches to aframe-environment-component..."

SOURCE_FILE="node_modules/aframe-environment-component/dist/aframe-environment-component.js"
DEST_FILE="public/components/aframe-environment-component.js"

if [ ! -f "$SOURCE_FILE" ]; then
    echo "Error: Source file not found: $SOURCE_FILE"
    exit 1
fi

# Copy the official file
cp "$SOURCE_FILE" "$DEST_FILE"

# 1. Reduce sky luminosity (10x darker)
sed -i "s/'vec3 L0 = vec3(0\.1) \* Fex;'/'vec3 L0 = vec3(0.01) * Fex;'/g" "$DEST_FILE"

# 2. Adjust horizon shadow
sed -i "s/'const float cutoffAngle = pi\/1\.95;'/'const float cutoffAngle = pi\/1.68;'/g" "$DEST_FILE"
sed -i "s/'const float steepness = 1\.5;'/'const float steepness = 8.0;'/g" "$DEST_FILE"

# 3. Disable auto-star toggling (comment it out)
sed -i "s/this\.setStars((1 - Math\.max(0, (sunPos\.y + 0\.08) \* 8)) \* 2000 );/\/\/ this.setStars((1 - Math.max(0, (sunPos.y + 0.08) * 8)) * 2000 );/g" "$DEST_FILE"

# 4. Inject Attribute Parsing Logic
# We create a temp file with the new code block
cat << 'EOF' > /tmp/parse_block.js
              var parsedAttributes = JSON.parse(JSON.stringify(this.el.components.environment.attrValue));
              Object.keys(parsedAttributes).forEach(function(key) {
                var val = parsedAttributes[key];
                if (typeof val == 'string' && val.split(' ').length == 3) {
                  var coords = val.split(' ');
                  parsedAttributes[key] = {x: coords[0], y: coords[1], z: coords[2]};
                }
              });
              Object.assign(this.environmentData, parsedAttributes);
EOF

# Find the target line and replace it with the block
# We escape the target line for the sed search
TARGET_LINE="Object.assign(this.environmentData, this.el.components.environment.attrValue);"
sed -i "/Object.assign(this.environmentData, this.el.components.environment.attrValue);/ {
    r /tmp/parse_block.js
    d
}" "$DEST_FILE"

rm /tmp/parse_block.js

echo "✓ L0: 0.1 → 0.01"
echo "✓ cutoffAngle/steepness adjusted"
echo "✓ Auto-stars disabled"
echo "✓ Attribute parsing logic injected"
echo ""
echo "Note: stageSize (400) should be set via HTML attribute"
echo ""
echo "SkyVR patches applied successfully to $DEST_FILE"
