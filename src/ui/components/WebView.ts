import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';

// 1. Dependencies are injected via initialize(), NO import * as xb here!

export type WebViewOptions = ViewOptions & {
  url: string;
};

export class WebView extends View {
  private static cssRenderer: CSS3DRenderer | null = null;
  private static instances: WebView[] = [];
  
  // Static refs to avoid circular dependencies
  private static sceneRef: THREE.Scene | null = null;
  private static cameraRef: THREE.Camera | null = null;

  public url: string;
  public pixelWidth: number;
  public pixelHeight: number;

  private cssObject: CSS3DObject;
  public occlusionMesh: THREE.Mesh; 

  constructor(options: WebViewOptions) {
    // --- 2. LOGIC FIX: Handle Meters vs Pixels ---
    const inputWidth = options.width ?? 1024;
    const inputHeight = options.height ?? 768;
    
    // If width is tiny (<10), user means Meters. If huge (>10), user means Pixels.
    const isPixels = inputWidth > 10;
    
    // Calculate physical size for the Parent View (Meters)
    const physicalWidth = isPixels ? inputWidth * 0.001 : inputWidth;
    const physicalHeight = isPixels ? inputHeight * 0.001 : inputHeight;

    // Pass PHYSICAL size to super() so layout engine is happy
    super({ ...options, width: physicalWidth, height: physicalHeight });

    // Store PIXEL size for internal Rendering (Resolution)
    this.url = options.url;
    this.pixelWidth = isPixels ? inputWidth : physicalWidth / 0.001;
    this.pixelHeight = isPixels ? inputHeight : physicalHeight / 0.001;

    WebView.instances.push(this);
    WebView.ensureSystem(); // Will wait for initialize()

    // --- 3. RENDERING SETUP ---
    const material = new THREE.MeshBasicMaterial({
      opacity: 0,
      color: new THREE.Color(0x000000),
      side: THREE.DoubleSide,
      blending: THREE.NoBlending,
    });
    
    // Geometry = Pixels (1000)
    const geometry = new THREE.PlaneGeometry(this.pixelWidth, this.pixelHeight);
    this.occlusionMesh = new THREE.Mesh(geometry, material);
    
    // Scale = 0.001 (1000 * 0.001 = 1 Meter)
    this.occlusionMesh.scale.set(0.001, 0.001, 0.001);
    this.add(this.occlusionMesh);

    // CSS Object (DOM)
    const div = document.createElement('div');
    div.style.width = `${this.pixelWidth}px`;
    div.style.height = `${this.pixelHeight}px`;
    div.style.backgroundColor = 'black';
    
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0px';
    iframe.src = this.url;
    div.appendChild(iframe);

    this.cssObject = new CSS3DObject(div);

    // Piggyback: Add to Mesh, reset scale to 1 (inherit 0.001 from mesh)
    this.occlusionMesh.add(this.cssObject);
    this.cssObject.scale.set(1, 1, 1); 
  }

  // --- 4. INJECTION METHOD ---
  public static initialize(scene: THREE.Scene, camera: THREE.Camera) {
      WebView.sceneRef = scene;
      WebView.cameraRef = camera;
      WebView.ensureSystem();
  }

  public updateLayout(): void {
    // Recalculate pixels in case Layout engine changed dimensions in Meters
    this.pixelWidth = this.width / 0.001;
    this.pixelHeight = this.height / 0.001;

    const div = this.cssObject.element;
    div.style.width = `${this.pixelWidth}px`;
    div.style.height = `${this.pixelHeight}px`;

    if (this.occlusionMesh) {
        this.occlusionMesh.geometry.dispose();
        this.occlusionMesh.geometry = new THREE.PlaneGeometry(this.pixelWidth, this.pixelHeight);
    }
    super.updateLayout();
  }

  private static ensureSystem() {
    if (WebView.cssRenderer || !WebView.sceneRef || !WebView.cameraRef) return; 

    console.log("WebView: Initializing CSS3D System...");

    WebView.cssRenderer = new CSS3DRenderer();
    WebView.cssRenderer.setSize(window.innerWidth, window.innerHeight);
    const style = WebView.cssRenderer.domElement.style;
    style.position = 'absolute';
    style.top = '0';
    style.zIndex = '9999'; // Force visibility
    style.pointerEvents = 'auto'; 
    style.background = 'transparent';
    document.body.appendChild(WebView.cssRenderer.domElement);

    window.addEventListener('resize', () => {
      WebView.cssRenderer?.setSize(window.innerWidth, window.innerHeight);
    });

    // Raycaster Logic
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('pointermove', (event) => {
      if (!WebView.cameraRef || !WebView.cssRenderer) return;

      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, WebView.cameraRef);
      const meshes = WebView.instances.map(view => view.occlusionMesh);
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        WebView.cssRenderer.domElement.style.pointerEvents = 'auto';
      } else {
        WebView.cssRenderer.domElement.style.pointerEvents = 'none';
      }
    });

    const tick = () => {
       if (WebView.cssRenderer && WebView.sceneRef && WebView.cameraRef) {
         WebView.cssRenderer.render(WebView.sceneRef, WebView.cameraRef);
       }
       requestAnimationFrame(tick);
    };
    tick();
  }
}