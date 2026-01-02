import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';

export type WebViewOptions = ViewOptions & {
  url: string;
};

export class WebView extends View {
  private static cssRenderer: CSS3DRenderer | null = null;
  // 1. Dedicated Scene just for HTML (Bypasses XR Blocks nesting)
  private static cssScene: THREE.Scene = new THREE.Scene(); 
  private static instances: WebView[] = [];
  
  // We only need the camera now
  private static cameraRef: THREE.Camera | null = null;

  public url: string;
  public pixelWidth: number;
  public pixelHeight: number;

  private cssObject: CSS3DObject;
  public occlusionMesh: THREE.Mesh; 

  constructor(options: WebViewOptions) {
    // --- 2. Handle Units (Meters vs Pixels) ---
    const inputWidth = options.width ?? 1024;
    const inputHeight = options.height ?? 768;
    const isPixels = inputWidth > 10;
    
    const physicalWidth = isPixels ? inputWidth * 0.001 : inputWidth;
    const physicalHeight = isPixels ? inputHeight * 0.001 : inputHeight;

    super({ ...options, width: physicalWidth, height: physicalHeight });

    this.url = options.url;
    this.pixelWidth = isPixels ? inputWidth : physicalWidth / 0.001;
    this.pixelHeight = isPixels ? inputHeight : physicalHeight / 0.001;

    WebView.instances.push(this);
    WebView.ensureSystem();

    // --- 3. Create "Hole" Mesh (Standard WebGL) ---
    const material = new THREE.MeshBasicMaterial({
      opacity: 0,
      color: new THREE.Color(0x000000),
      side: THREE.DoubleSide,
      blending: THREE.NoBlending,
    });
    
    const geometry = new THREE.PlaneGeometry(this.pixelWidth, this.pixelHeight);
    this.occlusionMesh = new THREE.Mesh(geometry, material);
    this.occlusionMesh.scale.set(0.001, 0.001, 0.001);
    this.add(this.occlusionMesh);

    // --- 4. Create CSS Object (The HTML) ---
    const div = document.createElement('div');
    div.style.width = `${this.pixelWidth}px`;
    div.style.height = `${this.pixelHeight}px`;
    div.style.backgroundColor = '#000'; 
    
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0px';
    iframe.src = this.url;
    div.appendChild(iframe);

    this.cssObject = new CSS3DObject(div);
    
    // IMPORTANT: Add to our private overlay scene!
    WebView.cssScene.add(this.cssObject);
  }

  // Simplified Initialize: Just needs Camera
  public static initialize(camera: THREE.Camera) {
      WebView.cameraRef = camera;
      WebView.ensureSystem();
  }

  public updateLayout(): void {
    this.pixelWidth = this.width / 0.001;
    this.pixelHeight = this.height / 0.001;

    // Update DOM
    const div = this.cssObject.element;
    div.style.width = `${this.pixelWidth}px`;
    div.style.height = `${this.pixelHeight}px`;

    // Update Hole
    if (this.occlusionMesh) {
        this.occlusionMesh.geometry.dispose();
        this.occlusionMesh.geometry = new THREE.PlaneGeometry(this.pixelWidth, this.pixelHeight);
    }
    super.updateLayout();
  }

  private static ensureSystem() {
    // Guard: Need Camera + Renderer must not exist yet
    if (WebView.cssRenderer || !WebView.cameraRef) return; 

    console.log("WebView: Creating CSS3D Renderer (Overlay Mode)...");

    WebView.cssRenderer = new CSS3DRenderer();
    WebView.cssRenderer.setSize(window.innerWidth, window.innerHeight);
    
    const style = WebView.cssRenderer.domElement.style;
    style.position = 'absolute';
    style.top = '0';
    style.left = '0';
    style.width = '100%';
    style.height = '100%';
    style.zIndex = '9999'; 
    style.pointerEvents = 'none'; 
    
    document.body.appendChild(WebView.cssRenderer.domElement);

    window.addEventListener('resize', () => {
      WebView.cssRenderer?.setSize(window.innerWidth, window.innerHeight);
    });

    const tick = () => {
       if (WebView.cssRenderer && WebView.cameraRef) {
         
         // --- SYNC LOOP: Teleport HTML to match the 3D Hole ---
         WebView.instances.forEach(view => {
             if (view.occlusionMesh && view.cssObject) {
                 // 1. Calculate where the "Hole" is in world space
                 view.occlusionMesh.updateMatrixWorld();
                 
                 // 2. Copy position/rotation/scale to the HTML object
                 view.cssObject.position.setFromMatrixPosition(view.occlusionMesh.matrixWorld);
                 view.cssObject.quaternion.setFromRotationMatrix(view.occlusionMesh.matrixWorld);
                 view.cssObject.scale.setFromMatrixScale(view.occlusionMesh.matrixWorld);
             }
         });

         // Render the Overlay Scene
         WebView.cssRenderer.render(WebView.cssScene, WebView.cameraRef);
       }
       requestAnimationFrame(tick);
    };
    tick();
  }
}