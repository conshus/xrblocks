import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';

export type WebViewOptions = ViewOptions & {
  url: string;
};

export class WebView extends View {
  private static cssRenderer: CSS3DRenderer | null = null;
  private static cssScene: THREE.Scene = new THREE.Scene(); 
  private static instances: WebView[] = [];
  private static cameraRef: THREE.Camera | null = null;

  public url: string;
  public pixelWidth: number;
  public pixelHeight: number;

  private cssObject: CSS3DObject;
  public occlusionMesh: THREE.Mesh; 

  constructor(options: WebViewOptions) {
    console.log(`[WebView] 🏗️ Constructor called for URL: ${options.url}`);

    // --- Units Logic ---
    const inputWidth = options.width ?? 1024;
    const inputHeight = options.height ?? 768;
    const isPixels = inputWidth > 10;
    const physicalWidth = isPixels ? inputWidth * 0.001 : inputWidth;
    const physicalHeight = isPixels ? inputHeight * 0.001 : inputHeight;

    super({ ...options, width: physicalWidth, height: physicalHeight });

    this.url = options.url;
    this.pixelWidth = isPixels ? inputWidth : physicalWidth / 0.001;
    this.pixelHeight = isPixels ? inputHeight : physicalHeight / 0.001;

    console.log(`[WebView] 📏 Size calculated - Physical: ${physicalWidth}m x ${physicalHeight}m | Pixels: ${this.pixelWidth}px x ${this.pixelHeight}px`);

    WebView.instances.push(this);
    WebView.ensureSystem();

    // --- Occlusion Mesh ---
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
    console.log(`[WebView] 🛡️ Occlusion Mesh added to Scene Graph`);

    // --- CSS Object ---
    const div = document.createElement('div');
    div.style.width = `${this.pixelWidth}px`;
    div.style.height = `${this.pixelHeight}px`;
    div.style.backgroundColor = 'red'; // DEBUG: Red background to see if it renders
    
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0px';
    iframe.src = this.url;
    iframe.onload = () => console.log(`[WebView] 📡 Iframe Loaded: ${this.url}`);
    iframe.onerror = (e) => console.error(`[WebView] ❌ Iframe Error:`, e);
    div.appendChild(iframe);

    this.cssObject = new CSS3DObject(div);
    
    // Add to private overlay scene
    WebView.cssScene.add(this.cssObject);
    console.log(`[WebView] 🌍 CSS Object added to Overlay Scene`);
  }

  public static initialize(camera: THREE.Camera) {
      console.log(`[WebView] 🚀 Initialize called with Camera:`, camera);
      WebView.cameraRef = camera;
      WebView.ensureSystem();
  }

  public updateLayout(): void {
    // console.log(`[WebView] 🔄 updateLayout called`); // Commented out to reduce noise
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
    if (WebView.cssRenderer) {
        // console.log(`[WebView] System already running.`);
        return;
    }
    if (!WebView.cameraRef) {
        console.warn(`[WebView] ⚠️ ensureSystem called but Camera is missing! Waiting for initialize()...`);
        return;
    }

    console.log("[WebView] 🟢 STARTING CSS3D RENDERER SYSTEM...");

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
    console.log("[WebView] 🖥️ DOM Element appended to Body:", WebView.cssRenderer.domElement);

    window.addEventListener('resize', () => {
      WebView.cssRenderer?.setSize(window.innerWidth, window.innerHeight);
    });

    let frameCount = 0;

    const tick = () => {
       if (WebView.cssRenderer && WebView.cameraRef) {
         
         // Log the first few frames to ensure the loop is running
         if (frameCount < 5) {
             console.log(`[WebView] ⏱️ Tick Loop Running (Frame ${frameCount})`);
         }
         frameCount++;

         WebView.instances.forEach((view, index) => {
             if (view.occlusionMesh && view.cssObject) {
                 view.occlusionMesh.updateMatrixWorld();
                 
                 // Sync Position
                 view.cssObject.position.setFromMatrixPosition(view.occlusionMesh.matrixWorld);
                 view.cssObject.quaternion.setFromRotationMatrix(view.occlusionMesh.matrixWorld);
                 view.cssObject.scale.setFromMatrixScale(view.occlusionMesh.matrixWorld);

                 // Debug position occasionally
                 if (frameCount % 600 === 0) { // Every ~10 seconds
                    const pos = view.cssObject.position;
                    console.log(`[WebView] 📍 View ${index} Position Sync: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
                 }
             }
         });

         WebView.cssRenderer.render(WebView.cssScene, WebView.cameraRef);
       }
       requestAnimationFrame(tick);
    };
    tick();
  }
}