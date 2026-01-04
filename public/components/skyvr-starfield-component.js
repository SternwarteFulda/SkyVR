AFRAME.registerComponent('starfield', {
  init: function () {
    var textureLoader = new THREE.TextureLoader();
    el = this.el;
    starShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: textureLoader.load('assets/star.png') },
        brightnessMultiplier: { value: 1.5 },
        skyBrightness: { value: 0.0 }
      },
      vertexShader: `
          attribute float size;
          attribute vec3 color;
          uniform float skyBrightness;
          varying vec3 vColor;
          varying float vVisibility;
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float sizeScaleFactor = pow(size, 1.75);
            float brightnessEffect = pow(1.0 - skyBrightness, 2.0);
            float adjustedSize = min(size * sizeScaleFactor * brightnessEffect, size);
            gl_PointSize = max(min(adjustedSize, size), 0.1) * (200.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
            float baselineSize = 0.2;
            if (gl_PointSize > baselineSize) {
              vVisibility = clamp((gl_PointSize - baselineSize) / (baselineSize * 2.0), 0.0, 1.0);
            } else {
              vVisibility = 0.0;
            }
            if (gl_PointSize < baselineSize) {
              gl_Position.z = -1000.0;
            }
          }
        `,
      fragmentShader: `
          uniform sampler2D pointTexture;
          uniform float brightnessMultiplier;
          varying vec3 vColor;
          varying float vVisibility;
          void main() {
            vec4 texColor = texture2D(pointTexture, gl_PointCoord);
            gl_FragColor = vec4(texColor.rgb * vColor * brightnessMultiplier, texColor.a * vVisibility);
          }
        `,
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: false,
      transparent: true
    });
    haloShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: textureLoader.load('assets/halo.png') },
        brightnessMultiplier: { value: 0.7 },
        skyBrightness: { value: 0.0 }
      },
      vertexShader: `
          attribute float size;
          attribute vec3 color;
          uniform float skyBrightness;
          varying vec3 vColor;
          varying float vVisibility;
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float sizeScaleFactor = pow(size, 0.75);
            float brightnessEffect = pow(1.0 - skyBrightness, 2.0);
            float adjustedSize = min(size * sizeScaleFactor * brightnessEffect, size);
            gl_PointSize = max(min(adjustedSize, size), 0.1) * (960.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
            float baselineSize = 0.2;
            if (gl_PointSize > baselineSize) {
              vVisibility = clamp((gl_PointSize - baselineSize) / (baselineSize * 2.0), 0.0, 1.0);
            } else {
              vVisibility = 0.0;
            }
            if (gl_PointSize < baselineSize) {
              gl_Position.z = -1000.0;
            }
          }
        `,
      fragmentShader: `
          uniform sampler2D pointTexture;
          uniform float brightnessMultiplier;
          varying vec3 vColor;
          varying float vVisibility;
          void main() {
            vec4 texColor = texture2D(pointTexture, gl_PointCoord);
            gl_FragColor = vec4(texColor.rgb * vColor * brightnessMultiplier, texColor.a * vVisibility);
          }
        `,
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: false,
      transparent: true
    });

    function createStarsFromCSV(csvData, type) {
      const starsGeometry = new THREE.BufferGeometry();
      const starsPositions = [];
      const starsSizes = [];
      const starsColors = [];
      const starData = csvData.split("\n");
      for (let i = 1; i < starData.length - 1; i++) {
        const starAttributes = starData[i].split(",");
        const brightness = parseFloat(starAttributes[13]);
        var spectralClass = starAttributes[15].trim().substring(0, 2);
        if (spectralClass[1] === ' ') {
          spectralClass = spectralClass[0] + starAttributes[15].trim()[2];
        }
        const color = spectralClassToColor(spectralClass);
        if (brightness < 6.5 && brightness > -2) {
          const raHours = parseFloat(starAttributes[7]);
          const decDegrees = parseFloat(starAttributes[8]);
          const distance = 400;
          const raDegrees = (raHours / 24) * 360;
          const x = distance * Math.cos((decDegrees * Math.PI) / 180) * Math.cos((raDegrees * Math.PI) / 180);
          const y = distance * Math.cos((decDegrees * Math.PI) / 180) * Math.sin((raDegrees * Math.PI) / 180);
          const z = distance * Math.sin((decDegrees * Math.PI) / 180);
          starsPositions.push(x, y, z);
          const size = mapRange(brightness, -5.0, 5.5, 14.0, 0.9);
          starsSizes.push(size);
          starsColors.push(color.r, color.g, color.b);
        }
      }
      starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsPositions, 3));
      starsGeometry.setAttribute('size', new THREE.Float32BufferAttribute(starsSizes, 1));
      starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starsColors, 3));
      let shader = starShaderMaterial;
      if (type === "halos") {
        shader = haloShaderMaterial;
      }
      const stars = new THREE.Points(starsGeometry, shader);
      stars.renderOrder = 5; // Below avatar (10)
      return stars;
    }
    function spectralClassToColor(spectralClass) {
      const baseColors = {
        O: { r: 155, g: 176, b: 255 },
        B: { r: 170, g: 191, b: 255 },
        A: { r: 202, g: 215, b: 255 },
        F: { r: 248, g: 247, b: 255 },
        G: { r: 255, g: 244, b: 234 },
        K: { r: 255, g: 210, b: 161 },
        M: { r: 255, g: 204, b: 111 },
      };
      const defaultColor = { r: 248, g: 248, b: 248 };
      const classChar = spectralClass[0];
      const subdivision = parseInt(spectralClass[1], 10);
      if (!baseColors[classChar]) {
        defaultColor.r /= 255;
        defaultColor.g /= 255;
        defaultColor.b /= 255;
        return defaultColor;
      }
      let color = baseColors[classChar];
      if (!isNaN(subdivision) && subdivision >= 0 && subdivision <= 9) {
        const nextClassChar = String.fromCharCode(classChar.charCodeAt(0) + 1);
        const nextClassColor = baseColors[nextClassChar] || defaultColor;
        const factor = subdivision / 9;
        color = {
          r: interpolate(color.r, nextClassColor.r, factor),
          g: interpolate(color.g, nextClassColor.g, factor),
          b: interpolate(color.b, nextClassColor.b, factor),
        };
      }
      color.r /= 255;
      color.g /= 255;
      color.b /= 255;
      return color;
    }
    function interpolate(start, end, factor) {
      return start + (end - start) * factor;
    }
    fetch("data/hyglike_from_athyg_v31.csv")
      .then(response => response.text())
      .then(csvData => {
        const halos = createStarsFromCSV(csvData, "halos");
        el.object3D.add(halos);
        const stars = createStarsFromCSV(csvData, "stars");
        el.object3D.add(stars);
        if (typeof updateLoadingIndicator === 'function') {
          updateLoadingIndicator('stars', true);
        }
      });
    this.planetsData = this.calculatePlanetsData();
    this.planetsHalos = this.createPlanetsObjects("halos");
    el.object3D.add(this.planetsHalos);
    this.planets = this.createPlanetsObjects("planets");
    el.object3D.add(this.planets);

    // Create the Moon sphere and directional light
    const moonTexture = textureLoader.load('assets/lroc_color_poles_1k.jpg');
    const moonBump = textureLoader.load('assets/ldem_3_8bit.jpg');
    const moonGeometry = new THREE.SphereGeometry(3.7, 64, 64);

    // Rotate the Moon geometry to align the texture
    moonGeometry.rotateY(Math.PI);
    //moonGeometry.rotateX(0);
    //moonGeometry.rotateZ(0);

    const moonMaterial = new THREE.MeshLambertMaterial({
      map: moonTexture,
      bumpMap: moonBump,
      fog: false,
      transparent: true,
      depthWrite: true,
      depthTest: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcColorFactor,
      blendEquation: THREE.AddEquation,
    });
    this.moon = new THREE.Mesh(moonGeometry, moonMaterial);
    this.moon.renderOrder = 5; // Below avatar (10)
    this.moon.castShadow = false;
    el.object3D.add(this.moon);

    this.moonLight = new THREE.DirectionalLight(0xffffff, 1);
    this.moonLight.target = this.moon;
    this.moonLight.castShadow = false;
    el.object3D.add(this.moonLight);
  },
  update: function () {
    const now = performance.now();

    // Timer init
    if (!this.lastMoonUpdate) this.lastMoonUpdate = 0;
    if (!this.lastPlanetUpdate) this.lastPlanetUpdate = 0;

    let needsBufferUpdate = false;

    // Fast Moon Update (~20Hz)
    if (now - this.lastMoonUpdate > 50) {
      if (!this.planetsData) this.calculatePlanetsData(); // Fallback init

      const date = simulationTime.toJSDate();

      // Update Moon Data (Index 0 is Moon)
      // We know Moon is index 0 from bodyList order in calculatePlanetsData/updateBodyData
      this.updateBodyData('Moon', date, 0);
      needsBufferUpdate = true;
      this.lastMoonUpdate = now;

      // Update Moon 3D Object
      const moonData = this.planetsData[0];
      if (moonData) {
        this.moon.position.set(moonData.position[0], moonData.position[1], moonData.position[2]);

        // --- STABLE WORLD-SPACE LOOKAT (Tidal Lock) ---

        const moonVector = new Astronomy.GeoVector('Moon', date, false);
        const sunVector = new Astronomy.GeoVector('Sun', date, false);
        const illuminationDirection = new THREE.Vector3(
          sunVector.x - moonVector.x,
          sunVector.y - moonVector.y,
          sunVector.z - moonVector.z
        ).normalize();

        this.moonLight.position.copy(this.moon.position);
        this.moonLight.position.add(illuminationDirection.multiplyScalar(100));
        this.moonLight.lookAt(this.moon.position);

        const pole = Astronomy.RotationAxis('Moon', date);
        const poleJ2000 = new THREE.Vector3(pole.north.x, pole.north.y, pole.north.z);
        const parentQuat = new THREE.Quaternion();
        this.moon.parent.getWorldQuaternion(parentQuat);
        const poleWorld = poleJ2000.applyQuaternion(parentQuat);

        this.moon.scale.set(1, 1, 1);
        this.moon.up.copy(poleWorld);
        this.moon.lookAt(0, 0, 0);
        this.moon.rotateY(Math.PI / 2);

        const lib = Astronomy.Libration(date);
        this.moon.rotateY(THREE.MathUtils.degToRad(-lib.elon));
        this.moon.rotateZ(THREE.MathUtils.degToRad(lib.elat));
      }
    }

    // Slow Planets Update (1Hz)
    if (now - this.lastPlanetUpdate > 1000) {
      if (!this.planetsData) this.calculatePlanetsData();

      const date = simulationTime.toJSDate();
      const bodyList = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
      // Start index 1 since Moon is 0
      for (let i = 0; i < bodyList.length; i++) {
        this.updateBodyData(bodyList[i], date, i + 1);
      }
      needsBufferUpdate = true;
      this.lastPlanetUpdate = now;
    }

    if (needsBufferUpdate) {
      this.updatePlanetsPositions();
    }
  },
  calculatePlanetsData: function () {
    // Initial population of the planetsData array
    if (!this.planetsData) this.planetsData = [];
    const bodyList = ['Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
    const date = simulationTime.toJSDate();

    // Clear array to be safe on re-init
    this.planetsData.length = 0;

    for (let i = 0; i < bodyList.length; i++) {
      // Push a placeholder object we will fill with updateBodyData
      this.planetsData.push({ name: bodyList[i] });
      this.updateBodyData(bodyList[i], date, i);
    }
    return this.planetsData;
  },

  updateBodyData: function (bodyName, date, index) {
    let equ_2000 = Astronomy.Equator(bodyName, date, observer, false, false);
    let mag = Astronomy.Illumination(bodyName, date).mag;
    if (bodyName === "Moon") {
      mag = -26.77;
    }
    let raDegrees = (equ_2000.ra / 24) * 360;
    let decDegrees = equ_2000.dec;
    const distance = 400;
    const x = distance * Math.cos((decDegrees * Math.PI) / 180) * Math.cos((raDegrees * Math.PI) / 180);
    const y = distance * Math.cos((decDegrees * Math.PI) / 180) * Math.sin((raDegrees * Math.PI) / 180);
    const z = distance * Math.sin((decDegrees * Math.PI) / 180);
    const size = mapRange(mag, -5.0, 5.5, 14.0, 0.9);

    const data = this.planetsData[index];
    data.position = [x, y, z];
    data.size = bodyName === "Moon" ? 0.0 : size;
    data.haloSize = bodyName === "Moon" ? 0.0 : size;
    data.color = [1.0, 1.0, 1.0];
  },
  createPlanetsObjects: function (type) {
    const planetsGeometry = new THREE.BufferGeometry();
    const planetsPositions = [];
    const planetsSizes = [];
    const planetsColors = [];
    for (let planetData of this.planetsData) {
      planetsPositions.push(...planetData.position);
      planetsSizes.push(type === "halos" ? planetData.haloSize : planetData.size);
      planetsColors.push(...planetData.color);
    }
    planetsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(planetsPositions, 3));
    planetsGeometry.setAttribute('size', new THREE.Float32BufferAttribute(planetsSizes, 1));
    planetsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(planetsColors, 3));
    let shader = starShaderMaterial;
    if (type === "halos") {
      shader = haloShaderMaterial;
    }
    const points = new THREE.Points(planetsGeometry, shader);
    points.renderOrder = 5;
    return points;
  },
  updatePlanetsPositions: function () {
    const posAttr = this.planets.geometry.attributes.position;
    const haloPosAttr = this.planetsHalos.geometry.attributes.position;

    for (let i = 0; i < this.planetsData.length; i++) {
      const pos = this.planetsData[i].position;
      posAttr.setXYZ(i, pos[0], pos[1], pos[2]);
      haloPosAttr.setXYZ(i, pos[0], pos[1], pos[2]);
    }

    posAttr.needsUpdate = true;
    haloPosAttr.needsUpdate = true;
  },
});