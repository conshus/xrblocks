import * as THREE from 'three';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';
export type WebViewOptions = ViewOptions & {
    url: string;
};
export declare class WebView extends View {
    /** Default description of this view in Three.js DevTools. */
    name: string;
    private static cssRenderer;
    private static cssScene;
    private static instances;
    private static cameraRef;
    url: string;
    pixelWidth: number;
    pixelHeight: number;
    /** WebView resides in a panel by default. */
    isRoot: boolean;
    private cssObject;
    occlusionMesh: THREE.Mesh;
    constructor(options: WebViewOptions);
    static initialize(camera: THREE.Camera): void;
    updateLayout(): void;
    private static ensureSystem;
}
