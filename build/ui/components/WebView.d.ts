import * as THREE from 'three';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';
export type WebViewOptions = ViewOptions & {
    url: string;
};
export declare class WebView extends View {
    private static cssRenderer;
    private static instances;
    private static sceneRef;
    private static cameraRef;
    url: string;
    pixelWidth: number;
    pixelHeight: number;
    private cssObject;
    occlusionMesh: THREE.Mesh;
    constructor(options: WebViewOptions);
    static initialize(scene: THREE.Scene, camera: THREE.Camera): void;
    updateLayout(): void;
    private static ensureSystem;
}
