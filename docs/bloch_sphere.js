/**
 * Bloch Sphere Visualizer - CSS/JS
 * Visualizes a qubit's state vector (theta, phi)
 */

class BlochSphere {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.setup();
  }

  setup() {
    this.container.innerHTML = `
      <div class="bloch-wrap">
        <div class="bloch-sphere">
          <div class="bloch-axis-z"></div>
          <div class="bloch-axis-x"></div>
          <div class="bloch-axis-y"></div>
          <div class="bloch-equator"></div>
          <div class="bloch-meridian"></div>
          <div class="bloch-vector" id="bloch-vector">
            <div class="vector-tip"></div>
          </div>
        </div>
        <div class="bloch-labels">
          <span class="z-up">|0⟩</span>
          <span class="z-down">|1⟩</span>
          <span class="x-label">x</span>
          <span class="y-label">y</span>
        </div>
      </div>
    `;
    this.vector = document.getElementById('bloch-vector');
  }

  /**
   * Set qubit state
   * @param {number} theta - 0 to PI
   * @param {number} phi - 0 to 2PI
   */
  setState(theta, phi) {
    if (!this.vector) return;
    // CSS uses degrees. Coordinate mapping:
    // Z-axis is up (0,0,1)
    // Theta is rotation from Z
    // Phi is rotation around Z
    this.vector.style.transform = `rotateY(${phi}rad) rotateX(${theta}rad)`;
  }

  /**
   * Animate to a target state
   */
  async animateTo(theta, phi, duration = 1000) {
    if (!this.vector) return;
    this.vector.style.transition = `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    this.setState(theta, phi);
  }

  /**
   * Start a random 'thinking' rotation
   */
  startThinking() {
    this.thinkingInterval = setInterval(() => {
      const t = Math.random() * Math.PI;
      const p = Math.random() * Math.PI * 2;
      this.animateTo(t, p, 800);
    }, 900);
  }

  stopThinking() {
    clearInterval(this.thinkingInterval);
    this.animateTo(0, 0, 1500); // Back to |0>
  }
}

// Global instance
window.blochState = null;
document.addEventListener('DOMContentLoaded', () => {
    window.blochState = new BlochSphere('bloch-visualizer');
});
