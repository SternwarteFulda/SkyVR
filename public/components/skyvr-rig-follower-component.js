AFRAME.registerComponent('rig-follower', {
  init: function() {
    this.camWorldPos = new THREE.Vector3();
    this.lastCamWorldPos = new THREE.Vector3();
    this.isFirstFrame = true;
  },

  tick: function () {
    const rig = this.el;
    const camera = document.getElementById('camera');
    if (!camera) return;

    // 1. Get where the head is in the WORLD (Scene Space)
    camera.object3D.getWorldPosition(this.camWorldPos);

    if (this.isFirstFrame) {
      this.lastCamWorldPos.copy(this.camWorldPos);
      this.isFirstFrame = false;
      return;
    }

    // 2. Calculate the "Footprint Delta"
    // How much did your physical head move in the room since the last frame?
    const dx = this.camWorldPos.x - this.lastCamWorldPos.x;
    const dz = this.camWorldPos.z - this.lastCamWorldPos.z;

    // 3. Move the RIG by that exact amount
    if (Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001) {
      rig.object3D.position.x += dx;
      rig.object3D.position.z += dz;
      
      // Update the Rig's matrix so it's ready for the next frame
      rig.object3D.updateMatrixWorld();
    }

    // 4. IMPORTANT: Re-read the world position AFTER the rig moved
    // This ensures we have the new 'baseline' for the next frame
    camera.object3D.getWorldPosition(this.lastCamWorldPos);
  }
});