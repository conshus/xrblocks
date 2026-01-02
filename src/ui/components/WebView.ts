import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';

// REMOVE THIS IMPORT to break the cycle:
// import * as xb from 'xrblocks'; 

export type WebViewOptions = ViewOptions & {
  url: string;
};

export class WebView extends View {
  private static cssRenderer: CSS3DRenderer | null = null;
  private static instances: WebView[] = [];

  // Static storage for the scene/camera references
  private static sceneRef: THREE.Scene | null = null;
  private static cameraRef: THREE.Camera | null = null;

  public url: string;
  public width: number;
  public height: number;

  private cssObject: CSS3DObject;
  public occlusionMesh: THREE.Mesh; 

  constructor(options: WebViewOptions) {
    super(options);

    this.url = options.url;
    this.width = options.width ?? 1024;
    this.height = options.height ?? 768;

    console.log(`WebView created with URL: ${this.url}, size: ${this.width}x${this.height}`);

    WebView.instances.push(this);
    // Try to start system, but it might wait for 'initialize' to be called
    WebView.ensureSystem();

    // --- CSS Object ---
    const div = document.createElement('div');
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

    // --- Occlusion Mesh ---
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
   * CALL THIS once from your MainScript (index.html) to inject dependencies.
   */
  public static initialize(scene: THREE.Scene, camera: THREE.Camera) {
      WebView.sceneRef = scene;
      WebView.cameraRef = camera;
      WebView.ensureSystem();
  }

  public updateLayout(): void {
    const pixelWidth = this.width / 0.001;
    const pixelHeight = this.height / 0.001;

    const div = this.cssObject.element;
    div.style.width = `${pixelWidth}px`;
    div.style.height = `${pixelHeight}px`;

    console.log(`WebView updateLayout: ${pixelWidth}x${pixelHeight}`);

    if (this.occlusionMesh) {
        this.occlusionMesh.geometry.dispose();
        this.occlusionMesh.geometry = new THREE.PlaneGeometry(pixelWidth, pixelHeight);
    }
    super.updateLayout();
  }

  private static ensureSystem() {
    // We need the renderer AND the scene/camera to function fully
    if (WebView.cssRenderer) return; 

    // Initialize Renderer
    WebView.cssRenderer = new CSS3DRenderer();
    WebView.cssRenderer.setSize(window.innerWidth, window.innerHeight);
    WebView.cssRenderer.domElement.style.position = 'absolute';
    WebView.cssRenderer.domElement.style.top = '0';

    // Force the website layer to sit on top of the 3D canvas so it's not hidden
    WebView.cssRenderer.domElement.style.zIndex = '1000'; 
    // ---------------------

    WebView.cssRenderer.domElement.style.pointerEvents = 'none'; 
    document.body.appendChild(WebView.cssRenderer.domElement);

    window.addEventListener('resize', () => {
      WebView.cssRenderer?.setSize(window.innerWidth, window.innerHeight);
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('pointermove', (event) => {
      // Use the injected cameraRef instead of xb.core.camera
      if (!WebView.cameraRef) return;

      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, WebView.cameraRef);
      const meshes = WebView.instances.map(view => view.occlusionMesh);
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        WebView.cssRenderer!.domElement.style.pointerEvents = 'auto';
      } else {
        WebView.cssRenderer!.domElement.style.pointerEvents = 'none';
      }
    });

    const tick = () => {
      // Use injected refs
      if (WebView.cssRenderer && WebView.sceneRef && WebView.cameraRef) {
        WebView.cssRenderer.render(WebView.sceneRef, WebView.cameraRef);
      }
      requestAnimationFrame(tick);
    };
    tick();
  }
}