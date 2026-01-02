import * as THREE from 'three';
import { View } from '../core/View';
import { ViewOptions } from '../core/ViewOptions';
export type WebViewOptions = ViewOptions & {
    url: string;
};
export declare class WebView extends View {
    private static cssRenderer;
    private static instances;
    url: string;
    width: number;
    height: number;
    private cssObject;
    occlusionMesh: THREE.Mesh;
    constructor(options: WebViewOptions);
    /**
     * Called by the Grid/Layout system when dimensions change.
     */
    updateLayout(): void;
    private static ensureSystem;
}
