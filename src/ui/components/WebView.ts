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
        
        WebView.instances.forEach(view => {
          if (view.occlusionMesh && view.cssObject) {
            view.occlusionMesh.updateMatrixWorld();
            
            // 1. POSITION: Always stick to the specific grid slot (Keep this!)
            view.cssObject.position.setFromMatrixPosition(view.occlusionMesh.matrixWorld);
            view.cssObject.scale.setFromMatrixScale(view.occlusionMesh.matrixWorld);

            // --- 2. ROTATION: The "Smart" Fix ---
            // Instead of using the mesh's rotation (which might be twisted by the curve),
            // we climb up to find the Main Panel and use its "Master" rotation.
            
            const targetRotation = new THREE.Quaternion();
            let foundPanel = false;
            
            // Traverse up: WebView -> Row -> Grid -> SpatialPanel
            let parent = view.parent;
            while (parent) {
                // Check if this parent looks like a SpatialPanel 
                // (You can also check parent.constructor.name === 'SpatialPanel')
                if (parent.constructor.name === 'SpatialPanel') {
                    parent.updateMatrixWorld();
                    targetRotation.setFromRotationMatrix(parent.matrixWorld);
                    foundPanel = true;
                    break;
                }
                parent = parent.parent;
            }

            if (foundPanel) {
                // CASE A: Use the Panel's flat rotation (Fixes the twist!)
                view.cssObject.quaternion.copy(targetRotation);
            } else {
                // CASE B: Fallback to the old way if we can't find a panel
                view.cssObject.quaternion.setFromRotationMatrix(view.occlusionMesh.matrixWorld);
            }

            // 3. NUDGE: Still push it forward to clear the curved wall
            view.cssObject.translateZ(0.08); 
          }
        });

        WebView.cssRenderer.render(WebView.cssScene, WebView.cameraRef);
      }
      requestAnimationFrame(tick);
    };
    tick();
  }
}