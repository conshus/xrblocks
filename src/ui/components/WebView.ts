import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
// import * as xb from 'xrblocks';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';

// 1. Define the Options Interface
export type WebViewOptions = ViewOptions & {
  url: string;
  // width and height are already optional in ViewOptions
};

export class WebView extends View {
  private static cssRenderer: CSS3DRenderer | null = null;
  private static instances: WebView[] = [];

  // 2. Explicitly define properties for state
  public url: string;
  public width: number;
  public height: number;

  private cssObject: CSS3DObject;
  public occlusionMesh: THREE.Mesh; 

  constructor(options: WebViewOptions) {
    // 3. Pass options to parent View
    super(options);

    // 4. Extract and store properties (providing defaults)
    this.url = options.url;
    this.width = options.width ?? 1024;
    this.height = options.height ?? 768;

    WebView.ensureSystem();
    WebView.instances.push(this);

    // --- Create CSS Object (The Website) ---
    const div = document.createElement('div');
    // Set initial size
    div.style.width = `${this.width}px`;
    div.style.height = `${this.height}px`;
    div.style.backgroundColor = '#fff';

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0px';
    iframe.src = this.url;
    div.appendChild(iframe);

    this.cssObject = new CSS3DObject(div);
    this.cssObject.scale.set(0.001, 0.001, 0.001); 
    this.add(this.cssObject);

    // --- Create Occlusion Mesh (The Invisible Mask) ---
    const material = new THREE.MeshBasicMaterial({
      opacity: 0,
      color: new THREE.Color(0x000000),
      side: THREE.DoubleSide,
      blending: THREE.NoBlending,
    });
    
    const geometry = new THREE.PlaneGeometry(this.width, this.height);
    this.occlusionMesh = new THREE.Mesh(geometry, material);
    this.occlusionMesh.scale.set(0.001, 0.001, 0.001);
    this.add(this.occlusionMesh);
  }

  /**
   * Called by the Grid/Layout system when dimensions change.
   */
  public updateLayout(): void {
    // We reverse the 0.001 scale to get the pixel size
    const pixelWidth = this.width / 0.001;
    const pixelHeight = this.height / 0.001;

    // 1. Update CSS Object size
    const div = this.cssObject.element;
    div.style.width = `${pixelWidth}px`;
    div.style.height = `${pixelHeight}px`;

    // 2. Update Occlusion Mesh size
    if (this.occlusionMesh) {
        this.occlusionMesh.geometry.dispose();
        this.occlusionMesh.geometry = new THREE.PlaneGeometry(
            pixelWidth, 
            pixelHeight
        );
    }

    // 3. Call base method
    super.updateLayout();
  }

  // --- Static System Logic (Standard Setup) ---
  private static ensureSystem() {
    if (WebView.cssRenderer) return; 

    console.log("WebView: Initializing CSS3D System...");

    WebView.cssRenderer = new CSS3DRenderer();
    WebView.cssRenderer.setSize(window.innerWidth, window.innerHeight);
    WebView.cssRenderer.domElement.style.position = 'absolute';
    WebView.cssRenderer.domElement.style.top = '0';
    WebView.cssRenderer.domElement.style.pointerEvents = 'none'; 
    document.body.appendChild(WebView.cssRenderer.domElement);

    window.addEventListener('resize', () => {
      WebView.cssRenderer?.setSize(window.innerWidth, window.innerHeight);
    });

    // Input Handling
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('pointermove', (event) => {
      // if (!xb.core || !xb.core.camera) return;

      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      // raycaster.setFromCamera(mouse, xb.core.camera);
      const meshes = WebView.instances.map(view => view.occlusionMesh);
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        WebView.cssRenderer!.domElement.style.pointerEvents = 'auto';
      } else {
        WebView.cssRenderer!.domElement.style.pointerEvents = 'none';
      }
    });

    // Render Loop
    const tick = () => {
      // if (WebView.cssRenderer && xb.core && xb.core.scene && xb.core.camera) {
      //   WebView.cssRenderer.render(xb.core.scene, xb.core.camera);
      // }
      requestAnimationFrame(tick);
    };
    tick();
  }
}