AFRAME.registerComponent('starfield', {
    init: function () {
        this.magLimit = 6.5;
        var textureLoader = new THREE.TextureLoader();
        el = this.el;
        starShaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                pointTexture: { value: textureLoader.load('assets/star.png') },
                brightnessMultiplier: { value: 1.5 },
                skyBrightness: { value: 0.0 },
                baseMagLimit: { value: this.magLimit }
            },
            vertexShader: `
          attribute float size;
          attribute vec3 color;
          attribute float magnitude;
          uniform float skyBrightness;
          uniform float baseMagLimit;
          varying vec3 vColor;
          varying float vVisibility;
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float sizeScaleFactor = pow(size, 1.75);
            float brightnessEffect = pow(1.0 - skyBrightness, 2.0);
            float adjustedSize = min(size * sizeScaleFactor * brightnessEffect, size);
            float zoomFactor = pow(projectionMatrix[1][1], 0.4); 
            gl_PointSize = max(min(adjustedSize, size), 0.0) * (200.0 / -mvPosition.z) * zoomFactor;
            gl_Position = projectionMatrix * mvPosition;
            
            // Dynamic magnitude limit based on zoom
            // Normal view (zoomFactor ~1): limit baseMagLimit
            // Bino view (zoomFactor ~4): limit baseMagLimit + 1.5
            float magLimit = baseMagLimit + clamp((zoomFactor - 1.0) / 3.0, 0.0, 1.0) * 1.5;
            if (magnitude > magLimit) {
                gl_Position.z = -2000.0; 
            }

            float baselineSize = 0.1;
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
                skyBrightness: { value: 0.0 },
                baseMagLimit: { value: this.magLimit }
            },
            vertexShader: `
          attribute float size;
          attribute vec3 color;
          attribute float magnitude;
          uniform float skyBrightness;
          uniform float baseMagLimit;
          varying vec3 vColor;
          varying float vVisibility;
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float sizeScaleFactor = pow(size, 0.75);
            float brightnessEffect = pow(1.0 - skyBrightness, 2.0);
            float adjustedSize = min(size * sizeScaleFactor * brightnessEffect, size);
            float zoomFactor = pow(projectionMatrix[1][1], 0.2);
            gl_PointSize = max(min(adjustedSize, size), 0.0) * (960.0 / -mvPosition.z) * zoomFactor;
            gl_Position = projectionMatrix * mvPosition;

            // Same limit for halos
            float magLimit = baseMagLimit + clamp((zoomFactor - 1.0) / 3.0, 0.0, 1.0) * 1.5;
            if (magnitude > magLimit) {
                gl_Position.z = -2000.0; 
            }

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

        function createStarsFromCSV(csvData, type, indices) {
            const starsGeometry = new THREE.BufferGeometry();
            const starsPositions = [];
            const starsSizes = [];
            const starsColors = [];
            const starsMags = [];
            const starData = csvData.split("\n");

            // If indices aren't provided, use old hardcoded defaults (fallback)
            const idx = indices || {
                mag: 13,
                spect: 15,
                ra: 7,
                dec: 8
            };

            for (let i = 1; i < starData.length - 1; i++) {
                const starAttributes = starData[i].split(",");
                if (starAttributes.length <= Math.max(idx.mag, idx.ra, idx.dec)) continue;

                const brightness = parseFloat(starAttributes[idx.mag]);
                let spectralRaw = starAttributes[idx.spect] || "";
                var spectralClass = spectralRaw.trim().substring(0, 2);
                if (spectralClass[1] === ' ') {
                    spectralClass = spectralClass[0] + spectralRaw.trim()[2];
                }
                const color = spectralClassToColor(spectralClass);

                if (!isNaN(brightness) && brightness < 8.0 && brightness > -2) {
                    const raHours = parseFloat(starAttributes[idx.ra]);
                    const decDegrees = parseFloat(starAttributes[idx.dec]);

                    if (isNaN(raHours) || isNaN(decDegrees)) continue;

                    const distance = 400;
                    const raDegrees = (raHours / 24) * 360;
                    const x = distance * Math.cos((decDegrees * Math.PI) / 180) * Math.cos((raDegrees * Math.PI) / 180);
                    const y = distance * Math.cos((decDegrees * Math.PI) / 180) * Math.sin((raDegrees * Math.PI) / 180);
                    const z = distance * Math.sin((decDegrees * Math.PI) / 180);

                    starsPositions.push(x, y, z);

                    let size = 0.9;
                    if (brightness <= 5.5) {
                        size = mapRange(brightness, -5.0, 5.5, 14.0, 0.9);
                    } else {
                        size = mapRange(brightness, 5.5, 8.0, 0.9, 0.4);
                    }
                    starsSizes.push(size);
                    starsColors.push(color.r, color.g, color.b);
                    starsMags.push(brightness);
                }
            }
            starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsPositions, 3));
            starsGeometry.setAttribute('size', new THREE.Float32BufferAttribute(starsSizes, 1));
            starsGeometry.setAttribute('magnitude', new THREE.Float32BufferAttribute(starsMags, 1));
            starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starsColors, 3));
            let shader = starShaderMaterial;
            if (type === "halos") {
                shader = haloShaderMaterial;
            }
            const stars = new THREE.Points(starsGeometry, shader);
            const renderSystem = this.el.sceneEl.systems['render-order'];
            stars.renderOrder = renderSystem ? renderSystem.order['stars'] : 5;
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
        fetch("data/stars.csv")
            .then(response => {
                const reader = response.body.getReader();
                const contentLength = response.headers.get('Content-Length');
                let receivedLength = 0;
                let chunks = [];

                // Show progress bar
                if (typeof updateStarProgress === 'function') {
                    updateStarProgress(0);
                }

                return reader.read().then(function processText({ done, value }) {
                    if (done) {
                        // Set to 100% when download is complete
                        if (typeof updateStarProgress === 'function') {
                            updateStarProgress(100);
                        }

                        // Combine all chunks into a single Uint8Array
                        let chunksAll = new Uint8Array(receivedLength);
                        let position = 0;
                        for (let chunk of chunks) {
                            chunksAll.set(chunk, position);
                            position += chunk.length;
                        }

                        // Convert to text
                        const text = new TextDecoder("utf-8").decode(chunksAll);

                        // Show processing sub-item
                        const starsSubItem = document.getElementById('status-stars-sub');
                        if (starsSubItem) {
                            starsSubItem.style.display = 'flex';
                        }

                        return text;
                    }

                    chunks.push(value);
                    receivedLength += value.length;

                    // Update progress
                    if (contentLength && typeof updateStarProgress === 'function') {
                        const percent = (receivedLength / contentLength) * 100;
                        updateStarProgress(percent);
                    }

                    return reader.read().then(processText);
                });
            })
            .then(csvData => {
                const lines = csvData.trim().split("\n");
                const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

                const indices = {
                    mag: header.indexOf('mag'),
                    ra: header.indexOf('ra'),
                    dec: header.indexOf('dec'),
                    spect: header.indexOf('spect'),
                    proper: header.indexOf('proper'),
                    bf: header.indexOf('bf'),
                    hip: header.indexOf('hip'),
                    hd: header.indexOf('hd'),
                    hr: header.indexOf('hr'),
                    con: header.indexOf('con')
                };

                // Fallback to old defaults if header discovery fails significantly
                if (indices.ra === -1) indices.ra = 7;
                if (indices.dec === -1) indices.dec = 8;
                if (indices.mag === -1) indices.mag = 13;
                if (indices.spect === -1) indices.spect = 15;

                this.starsArray = [];
                for (let i = 1; i < lines.length; i++) {
                    const starAttributes = lines[i].split(",");
                    if (starAttributes.length <= Math.max(indices.mag, indices.ra, indices.dec)) continue;

                    const brightness = parseFloat(starAttributes[indices.mag]);
                    if (!isNaN(brightness) && brightness < 8.0 && brightness > -2) {
                        const raHours = parseFloat(starAttributes[indices.ra]);
                        const decDegrees = parseFloat(starAttributes[indices.dec]);

                        if (isNaN(raHours) || isNaN(decDegrees)) continue;

                        const raDegrees = (raHours / 24) * 360;
                        const properName = (starAttributes[indices.proper] || "").trim().replace(/"/g, '');
                        const bfName = (starAttributes[indices.bf] || "").trim().replace(/"/g, '');
                        const hip = (starAttributes[indices.hip] || "").trim().replace(/"/g, '');
                        const hd = (starAttributes[indices.hd] || "").trim().replace(/"/g, '');
                        const hr = (starAttributes[indices.hr] || "").trim().replace(/"/g, '');
                        const constellation = (starAttributes[indices.con] || "").trim().replace(/"/g, '');

                        const distance = 400;
                        const x = distance * Math.cos((decDegrees * Math.PI) / 180) * Math.cos((raDegrees * Math.PI) / 180);
                        const y = distance * Math.cos((decDegrees * Math.PI) / 180) * Math.sin((raDegrees * Math.PI) / 180);
                        const z = distance * Math.sin((decDegrees * Math.PI) / 180);

                        this.starsArray.push({
                            name: properName || bfName || (hip ? "HIP " + hip : "") || (hd ? "HD " + hd : "") || (hr ? "HR " + hr : "") || "Unknown Star",
                            proper: properName,
                            bf: bfName,
                            hip: hip,
                            hd: hd,
                            hr: hr,
                            position: new THREE.Vector3(x, y, z),
                            mag: brightness,
                            constellation: constellation
                        });
                    }
                }

                const halos = createStarsFromCSV(csvData, "halos", indices);
                el.object3D.add(halos);
                const stars = createStarsFromCSV(csvData, "stars", indices);
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
        const renderSystem = this.el.sceneEl.systems['render-order'];
        this.moon.renderOrder = renderSystem ? renderSystem.order['stars'] : 5;
        this.moon.castShadow = false;
        el.object3D.add(this.moon);


        this.moonLight = new THREE.DirectionalLight(0xffffff, 1);
        this.moonLight.target = this.moon;
        this.moonLight.castShadow = false;
        el.object3D.add(this.moonLight);

        // Target states for interpolation
        this.targetMoonPosition = new THREE.Vector3();
        this.targetMoonQuaternion = new THREE.Quaternion();
        this.tempMoonObj = new THREE.Object3D();
        this.illuminationDirection = new THREE.Vector3();
        this.firstMoonUpdate = true;
        this.lastMoonDate = null;

        // Initialize throttled functions
        this.throttledUpdateMoon = AFRAME.utils.throttle(this.updateMoon, 50, this); // 20 fps
        this.throttledUpdatePlanets = AFRAME.utils.throttle(this.updatePlanets, 1000, this); // 1 fps
    },

    update: function (force = false) {
        if (force === true) {
            this.updateMoon(true);
            this.updatePlanets(true);
        } else {
            this.throttledUpdateMoon();
            this.throttledUpdatePlanets();
        }
    },

    tick: (function () {
        // Private reusable variables to avoid GC
        const lerpFactor = 0;
        const diffPos = new THREE.Vector3();

        return function (t, dt) {
            if (!dt) return;

            // Smoothly interpolate moon position and rotation
            // Using a factor that feels responsive but smooth
            const lerpFactor = 1 - Math.pow(0.001, dt / 1000);

            if (this.moon && !this.firstMoonUpdate) {
                // Optimization: use distanceToSquared for performance
                const distSq = this.moon.position.distanceToSquared(this.targetMoonPosition);
                if (distSq < 0.0001) {
                    // Already close enough, snap to target and skip lerp
                    this.moon.position.copy(this.targetMoonPosition);
                    this.moon.quaternion.copy(this.targetMoonQuaternion);
                } else {
                    this.moon.position.lerp(this.targetMoonPosition, lerpFactor);
                    this.moon.quaternion.slerp(this.targetMoonQuaternion, lerpFactor);
                }

                // Update Moon light to match interpolated position
                if (this.moonLight) {
                    this.moonLight.position.copy(this.moon.position);
                    this.moonLight.position.addScaledVector(this.illuminationDirection, 100);
                    this.moonLight.lookAt(this.moon.position);
                }
            }

            // Smoothly interpolate all planets
            if (this.planetsData && this.planetsData.length > 0) {
                let anyPlanetMoved = false;
                for (let i = 0, len = this.planetsData.length; i < len; i++) {
                    const data = this.planetsData[i];
                    if (data.currentPosition && data.targetPosition) {
                        const distSq = data.currentPosition.distanceToSquared(data.targetPosition);
                        if (distSq > 0.000001) {
                            data.currentPosition.lerp(data.targetPosition, lerpFactor);
                            anyPlanetMoved = true;
                        }
                    }
                }
                if (anyPlanetMoved) {
                    this.updatePlanetsPositions();
                }
            }
        };
    })(),

    updateMoon: function (forceInterpolation = false) {
        if (!this.planetsData) this.calculatePlanetsData(); // Fallback init
        const date = simulationTime.toJSDate();

        // Update Moon Data (Index 0 is Moon)
        this.updateBodyData('Moon', date, 0, forceInterpolation);
        this.updatePlanetsPositions(); // Buffer update

        // Calculate target Moon 3D Object state
        const moonData = this.planetsData[0];
        if (moonData && moonData.targetPosition) {
            this.targetMoonPosition.copy(moonData.targetPosition);

            const moonVector = new Astronomy.GeoVector('Moon', date, false);
            const sunVector = new Astronomy.GeoVector('Sun', date, false);
            this.illuminationDirection.set(
                sunVector.x - moonVector.x,
                sunVector.y - moonVector.y,
                sunVector.z - moonVector.z
            ).normalize();

            const pole = Astronomy.RotationAxis('Moon', date);
            const poleJ2000 = new THREE.Vector3(pole.north.x, pole.north.y, pole.north.z);

            // Use temp object to calculate target quaternion in local J2000 space
            this.tempMoonObj.position.copy(this.targetMoonPosition);
            this.tempMoonObj.up.copy(poleJ2000);
            this.tempMoonObj.lookAt(0, 0, 0);
            this.tempMoonObj.rotateY(Math.PI / 2);

            const lib = Astronomy.Libration(date);
            this.tempMoonObj.rotateY(THREE.MathUtils.degToRad(-lib.elon));
            this.tempMoonObj.rotateZ(THREE.MathUtils.degToRad(lib.elat));
            this.targetMoonQuaternion.copy(this.tempMoonObj.quaternion);

            const timeJump = this.lastMoonDate ? Math.abs(date - this.lastMoonDate) : 0;
            this.lastMoonDate = date;

            // Snap if first update OR if time jump > 2 hours (7,200,000 ms), unless forced interpolation
            if (!forceInterpolation && (this.firstMoonUpdate || timeJump > 7200000)) {
                this.moon.position.copy(this.targetMoonPosition);
                this.moon.quaternion.copy(this.targetMoonQuaternion);
                this.firstMoonUpdate = false;

                // Initial light setup
                if (this.moonLight) {
                    this.moonLight.position.copy(this.moon.position);
                    this.moonLight.position.addScaledVector(this.illuminationDirection, 100);
                    this.moonLight.lookAt(this.moon.position);
                }
            }
        }
    },

    updatePlanets: function (forceInterpolation = false) {
        if (!this.planetsData) this.calculatePlanetsData();
        const date = simulationTime.toJSDate();
        const bodyList = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Io', 'Europa', 'Ganymede', 'Callisto', 'Saturn', 'Uranus', 'Neptune'];
        // Start index 1 since Moon is 0
        for (let i = 0; i < bodyList.length; i++) {
            this.updateBodyData(bodyList[i], date, i + 1, forceInterpolation);
        }
        this.updatePlanetsPositions(); // Buffer update
    },
    calculatePlanetsData: function () {
        // Initial population of the planetsData array
        if (!this.planetsData) this.planetsData = [];
        const bodyList = ['Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Io', 'Europa', 'Ganymede', 'Callisto', 'Saturn', 'Uranus', 'Neptune'];
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

    updateBodyData: function (bodyName, date, index, forceInterpolation = false) {
        let x, y, z, mag;
        const isMoon = ['Io', 'Europa', 'Ganymede', 'Callisto'].includes(bodyName);

        if (isMoon) {
            const jMoons = Astronomy.JupiterMoons(date);
            const jupVector = Astronomy.GeoVector('Jupiter', date, false);
            const moonState = jMoons[bodyName.toLowerCase()];

            // Moon's geocentric EQJ vector
            const mx = jupVector.x + moonState.x;
            const my = jupVector.y + moonState.y;
            const mz = jupVector.z + moonState.z;

            const dist = Math.sqrt(mx * mx + my * my + mz * mz);
            const distance = 400;
            x = (mx / dist) * distance;
            y = (my / dist) * distance;
            z = (mz / dist) * distance;

            const moonMags = { 'Io': 5.0, 'Europa': 5.3, 'Ganymede': 4.6, 'Callisto': 5.6 };
            mag = moonMags[bodyName];
        } else {
            const equ_2000 = Astronomy.Equator(bodyName, date, observer, false, false);
            mag = Astronomy.Illumination(bodyName, date).mag;
            if (bodyName === "Moon" || bodyName === "Sun") {
                mag = -26.7; // Hardcode brightness for Sun/Moon to ensure visibility
            }

            // Performance Optimization: Use radians directly and cache common trig
            const raRad = (equ_2000.ra / 24) * 6.283185307179586; // 2 * PI
            const decRad = equ_2000.dec * 0.017453292519943295; // PI / 180
            const cosDec = Math.cos(decRad);

            const distance = (bodyName === "Moon" || bodyName === "Sun") ? 398 : 400;
            x = distance * cosDec * Math.cos(raRad);
            y = distance * cosDec * Math.sin(raRad);
            z = distance * Math.sin(decRad);
        }

        const size = (bodyName === "Sun") ? 15.0 : mapRange(mag, -5.0, 5.5, 14.0, 0.9);

        const data = this.planetsData[index];
        if (!data) return; // Safety check

        // Initialize vectors if they don't exist
        if (!data.currentPosition) data.currentPosition = new THREE.Vector3(x, y, z);
        if (!data.targetPosition) data.targetPosition = new THREE.Vector3(x, y, z);
        if (!data.color) data.color = [1.0, 1.0, 1.0];

        // Set target for interpolation
        data.targetPosition.set(x, y, z);

        // Huge jump detection - snap if > 2 hours or first update, unless forced to interpolate
        const timeJump = this.lastMoonDate ? Math.abs(date - this.lastMoonDate) : 0;
        if (!forceInterpolation && (this.firstMoonUpdate || timeJump > 7200000)) {
            data.currentPosition.copy(data.targetPosition);
        }

        data.size = bodyName === "Moon" ? 0.0 : size;
        data.haloSize = bodyName === "Moon" ? 0.0 : size;
        data.color[0] = 1.0;
        data.color[1] = 1.0;
        data.color[2] = 1.0;
    },
    createPlanetsObjects: function (type) {
        const planetsGeometry = new THREE.BufferGeometry();
        const planetsPositions = [];
        const planetsSizes = [];
        const planetsColors = [];
        for (let planetData of this.planetsData) {
            const pos = planetData.currentPosition || new THREE.Vector3();
            planetsPositions.push(pos.x, pos.y, pos.z);
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
        const renderSystem = this.el.sceneEl.systems['render-order'];
        points.renderOrder = renderSystem ? renderSystem.order['stars'] : 5;
        return points;
    },
    updatePlanetsPositions: function () {
        const posAttr = this.planets.geometry.attributes.position;
        const haloPosAttr = this.planetsHalos.geometry.attributes.position;

        for (let i = 0; i < this.planetsData.length; i++) {
            const pos = this.planetsData[i].currentPosition;
            if (pos) {
                posAttr.setXYZ(i, pos.x, pos.y, pos.z);
                haloPosAttr.setXYZ(i, pos.x, pos.y, pos.z);
            }
        }

        posAttr.needsUpdate = true;
        haloPosAttr.needsUpdate = true;
    },
});