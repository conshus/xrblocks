import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';

export type WebViewOptions = ViewOptions & {
  url: string;
};

export class WebView extends View {
  /** Default description of this view in Three.js DevTools. */
  name: string = 'WebView';

  private static cssRenderer: CSS3DRenderer | null = null;
  private static cssScene: THREE.Scene = new THREE.Scene(); 
  private static instances: WebView[] = [];
  private static cameraRef: THREE.Camera | null = null;

  public url: string;
  public pixelWidth: number;
  public pixelHeight: number;
  /** WebView resides in a panel by default. */
  public isRoot = false;

  private cssObject: CSS3DObject;
  public occlusionMesh: THREE.Mesh; 

  constructor(options: WebViewOptions) {

    // --- Units Logic (pixels vs. meters) ---
    const inputWidth = options.width ?? 1920;
    const inputHeight = options.height ?? 1080;
    const isPixels = inputWidth > 10;
    const physicalWidth = isPixels ? inputWidth * 0.001 : inputWidth;
    const physicalHeight = isPixels ? inputHeight * 0.001 : inputHeight;

    super({ ...options, width: physicalWidth, height: physicalHeight });

    this.url = options.url;
    this.pixelWidth = isPixels ? inputWidth : physicalWidth / 0.001;
    this.pixelHeight = isPixels ? inputHeight : physicalHeight / 0.001;

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

    // --- CSS Object ---
    const div = document.createElement('div');
    div.style.width = `${this.pixelWidth}px`;
    div.style.height = `${this.pixelHeight}px`;
    div.style.backgroundColor = '#000000';
    
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0px';
    iframe.src = this.url;
    iframe.onerror = (e) => console.error(`[WebView] ❌ Iframe Error:`, e);
    div.appendChild(iframe);

    this.cssObject = new CSS3DObject(div);
    
    // Add to private overlay scene
    WebView.cssScene.add(this.cssObject);
  }

  public static initialize(camera: THREE.Camera) {
      WebView.cameraRef = camera;
      WebView.ensureSystem();
  }

  public updateLayout(): void {
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
            
            // POSITION
            view.cssObject.position.setFromMatrixPosition(view.occlusionMesh.matrixWorld);
            view.cssObject.scale.setFromMatrixScale(view.occlusionMesh.matrixWorld);

            // ROTATION: WebView rotates to match SpatialPanel
            const targetRotation = new THREE.Quaternion();
            let foundPanel = false;
            
            // Traverse up: WebView -> Row -> Grid -> SpatialPanel
            let parent = view.parent;
            while (parent) {
                // Check if this parent looks like a SpatialPanel 
                if (parent.constructor.name === 'SpatialPanel') {
                    parent.updateMatrixWorld();
                    targetRotation.setFromRotationMatrix(parent.matrixWorld);
                    foundPanel = true;
                    break;
                }
                parent = parent.parent;
            }

            if (foundPanel) {
                // Use the Panel's flat rotation
                view.cssObject.quaternion.copy(targetRotation);
            } else {
                // Fallback to the old way if we can't find a panel
                view.cssObject.quaternion.setFromRotationMatrix(view.occlusionMesh.matrixWorld);
            }

            // Push WebView forward to clear the curved panel
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