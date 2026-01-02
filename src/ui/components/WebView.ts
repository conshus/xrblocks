import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';

// NO 'import * as xb' here! This prevents circular dependencies.

export type WebViewOptions = ViewOptions & {
  url: string;
};

export class WebView extends View {
  private static cssRenderer: CSS3DRenderer | null = null;
  private static instances: WebView[] = [];

  // Static storage for dependencies injected from MainScript
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
    // Default to pixel units if not provided
    this.width = options.width ?? 1024;
    this.height = options.height ?? 768;

    WebView.instances.push(this);
    
    // Attempt to start system (will wait until initialize is called)
    WebView.ensureSystem();

    // --- 1. Create Occlusion Mesh ---
    const material = new THREE.MeshBasicMaterial({
      opacity: 0,
      color: new THREE.Color(0x000000),
      side: THREE.DoubleSide,
      blending: THREE.NoBlending,
    });
    
    // Geometry uses RAW units (e.g. 1024)
    const geometry = new THREE.PlaneGeometry(this.width, this.height);
    this.occlusionMesh = new THREE.Mesh(geometry, material);
    
    // Scale down: 1024 units -> 1.024 meters
    this.occlusionMesh.scale.set(0.001, 0.001, 0.001);
    
    this.add(this.occlusionMesh);

    // --- 2. Create CSS Object ---
    const div = document.createElement('div');
    div.style.width = `${this.width}px`;
    div.style.height = `${this.height}px`;
    div.style.backgroundColor = 'black'; // Debug background
    
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0px';
    iframe.src = this.url;
    div.appendChild(iframe);

    this.cssObject = new CSS3DObject(div);

    // --- PIGGYBACK TRICK ---
    // Attach CSS Object to the Occlusion Mesh so it enters the scene graph
    this.occlusionMesh.add(this.cssObject);
    
    // Keep scale at 1 (inherited from mesh)
    this.cssObject.scale.set(1, 1, 1); 
  }

  /**
   * Called from MainScript (index.html) to inject dependencies
   */
  public static initialize(scene: THREE.Scene, camera: THREE.Camera) {
      WebView.sceneRef = scene;
      WebView.cameraRef = camera;
      WebView.ensureSystem();
  }

  public updateLayout(): void {
    // Layout Heuristic: Convert meters to pixels if needed
    let pixelWidth = this.width;
    let pixelHeight = this.height;

    if (this.width < 10) {
        pixelWidth = this.width / 0.001;
        pixelHeight = this.height / 0.001;
    }

    // 1. Update DOM Size
    const div = this.cssObject.element;
    div.style.width = `${pixelWidth}px`;
    div.style.height = `${pixelHeight}px`;

    // 2. Update Mesh Geometry
    if (this.occlusionMesh) {
        this.occlusionMesh.geometry.dispose();
        this.occlusionMesh.geometry = new THREE.PlaneGeometry(pixelWidth, pixelHeight);
    }

    super.updateLayout();
  }

  private static ensureSystem() {
    // Only start if we have the renderer AND the dependencies
    if (WebView.cssRenderer || !WebView.sceneRef || !WebView.cameraRef) return; 

    console.log("WebView: Initializing CSS3D System...");

    WebView.cssRenderer = new CSS3DRenderer();
    WebView.cssRenderer.setSize(window.innerWidth, window.innerHeight);
    
    const style = WebView.cssRenderer.domElement.style;
    style.position = 'absolute';
    style.top = '0';
    style.left = '0';
    style.width = '100%';
    style.height = '100%';
    style.zIndex = '9999'; // FORCE FRONT
    style.pointerEvents = 'none'; 

    document.body.appendChild(WebView.cssRenderer.domElement);

    window.addEventListener('resize', () => {
      WebView.cssRenderer?.setSize(window.innerWidth, window.innerHeight);
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('pointermove', (event) => {
      // USE STATIC REFS, NOT XB.CORE
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
       // USE STATIC REFS
       if (WebView.cssRenderer && WebView.sceneRef && WebView.cameraRef) {
         WebView.cssRenderer.render(WebView.sceneRef, WebView.cameraRef);
       }
       requestAnimationFrame(tick);
    };
    tick();
  }
}