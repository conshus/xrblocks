import * as THREE from 'three';

import {Input} from '../Input';
import {Handedness} from '../Hands';
import {HAND_JOINT_NAMES} from '../components/HandJointNames.js';
import {User} from '../../core/User';
import {Script} from '../../core/Script';
import {GestureEventDetail, GestureEventType} from './GestureEvents';
import {
  BuiltInGestureName,
  GestureRecognitionOptions,
  GestureConfiguration,
} from './GestureRecognitionOptions';

type HandContext = {
  handedness: Handedness;
  handLabel: 'left'|'right';
  joints: JointPositions;
};

type JointPositions = Map<string, THREE.Vector3>;

type GestureDetectionResult = {
  confidence: number;
  data?: Record<string, unknown>;
};

type ActiveGestureState = {
  confidence: number;
  data?: Record<string, unknown>;
};

const HAND_INDEX_TO_LABEL: Record<number, 'left'|'right'> = {
  [Handedness.LEFT]: 'left',
  [Handedness.RIGHT]: 'right',
};

const DEFAULT_PINCH_THRESHOLD = 0.03;
const DEFAULT_FIST_THRESHOLD = 0.045;
const DEFAULT_OPEN_PALM_THRESHOLD = 0.075;
const DEFAULT_POINT_THRESHOLD = 0.07;
const DEFAULT_SPREAD_THRESHOLD = 0.05;

const JOINT_TEMP_POOL =
    new Map<'left'|'right', Map<string, THREE.Vector3>>();

/**
 * GestureRecognitionBlock normalizes hand gestures into high level events that
 * other scripts can subscribe to. It currently implements a heuristic WebXR
 * provider and exposes hooks for heavier TensorFlow.js or MediaPipe based
 * pipelines in the future.
 */
type GestureScriptEvent = THREE.Event&{
  type: GestureEventType,
  target: GestureRecognitionBlock,
  detail: GestureEventDetail,
};

interface GestureRecognitionEventMap extends THREE.Object3DEventMap {
  gesturestart: GestureScriptEvent;
  gestureupdate: GestureScriptEvent;
  gestureend: GestureScriptEvent;
}

export class GestureRecognitionBlock extends Script<GestureRecognitionEventMap> {
  static dependencies = {
    input: Input,
    user: User,
    options: GestureRecognitionOptions,
  };

  private options!: GestureRecognitionOptions;
  private user!: User;
  private input!: Input;
  private activeGestures: Record<'left'|'right', Map<string, ActiveGestureState>> =
      {left: new Map(), right: new Map()};
  private lastEvaluation = 0;
  private detectors =
      new Map<string, (context: HandContext,
                       config: GestureConfiguration) => GestureDetectionResult
                                            |undefined>();
  private providerWarned = false;

  async init(
      {options, user, input}: {
        options: GestureRecognitionOptions,
        user: User,
        input: Input
      }) {
    this.options = options;
    this.user = user;
    this.input = input;
    this.registerDetectors();
    if (!this.options.enabled) {
      console.info(
          'GestureRecognitionBlock initialized but disabled. Call options.enableGestures() to activate.');
    }
  }

  update() {
    if (!this.options.enabled) return;
    if (!this.user.hands?.isValid?.()) return;

    const now = performance.now();
    const interval = this.options.provider === 'webxr' ? 0 :
                                                   this.options.updateIntervalMs;
    if (interval > 0 && (now - this.lastEvaluation) < interval) {
      return;
    }
    if (this.options.provider !== 'webxr' && !this.providerWarned) {
      console.warn(
          `GestureRecognitionBlock: provider '${this.options.provider}' is not yet implemented; falling back to WebXR heuristics.`);
      this.providerWarned = true;
    }
    this.lastEvaluation = now;

    this.evaluateHand(Handedness.LEFT);
    this.evaluateHand(Handedness.RIGHT);
  }

  private evaluateHand(handedness: Handedness) {
    const handLabel = HAND_INDEX_TO_LABEL[handedness];
    const activeMap = this.activeGestures[handLabel];
    if (!handLabel) return;

    const context = this.buildHandContext(handedness, handLabel);
    if (!context) {
      // Emit end events for any gestures still tagged as active.
      for (const [name] of activeMap.entries()) {
        this.emitGesture('gestureend', {name, hand: handLabel, confidence: 0});
      }
      activeMap.clear();
      return;
    }

    const processed = new Set<string>();
    for (const [name, config] of Object.entries(this.options.gestures)) {
      const gestureName = name as BuiltInGestureName;
      if (!config?.enabled) continue;
      const detector = this.detectors.get(gestureName);
      if (!detector) continue;

      const result = detector(context, config);
      const isActive =
          result && result.confidence >= this.options.minimumConfidence;
      processed.add(gestureName);
      const previousState = activeMap.get(gestureName);

      if (isActive) {
        const detail: GestureEventDetail = {
          name: gestureName,
          hand: handLabel,
          confidence: THREE.MathUtils.clamp(result.confidence, 0, 1),
          data: result.data,
        };
        if (!previousState) {
          activeMap.set(gestureName,
                        {confidence: detail.confidence, data: detail.data});
          this.emitGesture('gesturestart', detail);
        } else {
          previousState.confidence = detail.confidence;
          previousState.data = detail.data;
          this.emitGesture('gestureupdate', detail);
        }
      } else if (previousState) {
        activeMap.delete(gestureName);
        this.emitGesture(
            'gestureend',
            {name: gestureName, hand: handLabel, confidence: 0.0});
      }
    }

    // Clear any gestures that were not processed (e.g. disabled mid-frame).
    for (const name of Array.from(activeMap.keys())) {
      if (!processed.has(name)) {
        activeMap.delete(name);
        this.emitGesture(
            'gestureend', {name, hand: handLabel, confidence: 0.0});
      }
    }
  }

  private buildHandContext(
      handedness: Handedness, handLabel: 'left'|'right'): HandContext|null {
    if (!this.user.hands) return null;
    const hand = this.user.hands.hands[handedness];
    if (!hand?.joints) return null;

    let jointCache = JOINT_TEMP_POOL.get(handLabel);
    if (!jointCache) {
      jointCache = new Map();
      JOINT_TEMP_POOL.set(handLabel, jointCache);
    }
    const joints = jointCache;
    joints.clear();

    for (const jointName of HAND_JOINT_NAMES) {
      const joint = hand.joints[jointName];
      if (!joint) continue;
      let vector = joints.get(jointName);
      if (!vector) {
        vector = new THREE.Vector3();
        joints.set(jointName, vector);
      }
      vector.setFromMatrixPosition(joint.matrixWorld);
    }

    if (!joints.size) return null;
    return {
      handedness,
      handLabel,
      joints,
    };
  }

  private registerDetectors() {
    this.detectors.set('pinch', this.computePinch.bind(this));
    this.detectors.set('open-palm', this.computeOpenPalm.bind(this));
    this.detectors.set('fist', this.computeFist.bind(this));
    this.detectors.set('thumbs-up', this.computeThumbsUp.bind(this));
    this.detectors.set('point', this.computePoint.bind(this));
    this.detectors.set('spread', this.computeSpread.bind(this));
  }

  private emitGesture(type: GestureEventType, detail: GestureEventDetail) {
    const event: GestureScriptEvent = {type, detail, target: this};
    this.dispatchEvent(event);
  }

  private computePinch(
      context: HandContext,
      config: GestureConfiguration): GestureDetectionResult|undefined {
    const thumb = this.getJointPosition(context, 'thumb-tip');
    const index = this.getJointPosition(context, 'index-finger-tip');
    if (!thumb || !index) return undefined;
    const threshold = config.threshold ?? DEFAULT_PINCH_THRESHOLD;
    const distance = thumb.distanceTo(index);
    const confidence = 1 - THREE.MathUtils.clamp(distance / (threshold * 1.5), 0, 1);
    if (distance > threshold) return {confidence: confidence * 0.5};
    return {
      confidence: THREE.MathUtils.clamp(confidence, 0, 1),
      data: {distance},
    };
  }

  private computeOpenPalm(
      context: HandContext,
      config: GestureConfiguration): GestureDetectionResult|undefined {
    const wrist = this.getJointPosition(context, 'wrist');
    if (!wrist) return undefined;
    const fingerTips = this.getFingerTips(context);
    if (fingerTips.length === 0) return undefined;
    const distances = fingerTips.map(tip => tip.distanceTo(wrist));
    const averageDistance =
        distances.reduce((sum, val) => sum + val, 0) / distances.length;
    const threshold = config.threshold ?? DEFAULT_OPEN_PALM_THRESHOLD;
    const confidence = THREE.MathUtils.clamp(
        (averageDistance - threshold) / (threshold * 0.75), 0, 1);
    return {confidence, data: {averageDistance}};
  }

  private computeFist(
      context: HandContext,
      config: GestureConfiguration): GestureDetectionResult|undefined {
    const wrist = this.getJointPosition(context, 'wrist');
    if (!wrist) return undefined;
    const fingerTips = this.getFingerTips(context);
    if (fingerTips.length === 0) return undefined;
    const distances = fingerTips.map(tip => tip.distanceTo(wrist));
    const averageDistance =
        distances.reduce((sum, val) => sum + val, 0) / distances.length;
    const threshold = config.threshold ?? DEFAULT_FIST_THRESHOLD;
    const confidence =
        THREE.MathUtils.clamp((threshold - averageDistance) / threshold, 0, 1);
    return {confidence, data: {averageDistance}};
  }

  private computeThumbsUp(
      context: HandContext,
      config: GestureConfiguration): GestureDetectionResult|undefined {
    const wrist = this.getJointPosition(context, 'wrist');
    const thumb = this.getJointPosition(context, 'thumb-tip');
    const fingerTips =
        this.getFingerTips(context).filter(tip => tip !== thumb);
    if (!wrist || !thumb || fingerTips.length === 0) return undefined;

    const thumbDistance = thumb.distanceTo(wrist);
    const thumbVertical = thumb.y - wrist.y;

    const otherDistances =
        fingerTips.map(tip => tip.distanceTo(wrist));
    const averageOther =
        otherDistances.reduce((sum, val) => sum + val, 0) / otherDistances.length;

    const extendedThreshold = config.threshold ?? (DEFAULT_OPEN_PALM_THRESHOLD * 0.9);
    const curledThreshold = DEFAULT_FIST_THRESHOLD * 1.1;

    const thumbExtendedScore =
        THREE.MathUtils.clamp((thumbDistance - extendedThreshold) /
                                  (extendedThreshold * 0.6),
                              0, 1);
    const othersCurledScore =
        THREE.MathUtils.clamp((curledThreshold - averageOther) /
                                  curledThreshold,
                              0, 1);
    const orientationScore =
        THREE.MathUtils.clamp((thumbVertical) / 0.06, 0, 1);
    const confidence =
        (thumbExtendedScore * 0.5) + (othersCurledScore * 0.35) +
        (orientationScore * 0.15);
    return {
      confidence: THREE.MathUtils.clamp(confidence, 0, 1),
      data: {thumbDistance, averageOther, thumbVertical},
    };
  }

  private computePoint(
      context: HandContext,
      config: GestureConfiguration): GestureDetectionResult|undefined {
    const wrist = this.getJointPosition(context, 'wrist');
    const indexTip = this.getJointPosition(context, 'index-finger-tip');
    const thumbTip = this.getJointPosition(context, 'thumb-tip');
    if (!wrist || !indexTip) return undefined;
    const otherTips = this.getFingerTips(context)
                           .filter(
                               tip => tip !== indexTip && tip !== thumbTip);
    if (!otherTips.length) return undefined;

    const indexDistance = indexTip.distanceTo(wrist);
    const averageOthers =
        otherTips.reduce((sum, tip) => sum + tip.distanceTo(wrist), 0) /
        otherTips.length;

    const extendedThreshold = config.threshold ?? DEFAULT_POINT_THRESHOLD;
    const curledThreshold = DEFAULT_FIST_THRESHOLD * 1.1;

    const indexScore =
        THREE.MathUtils.clamp((indexDistance - extendedThreshold) /
                                  (extendedThreshold * 0.6),
                              0, 1);
    const othersScore =
        THREE.MathUtils.clamp((curledThreshold - averageOthers) /
                                  curledThreshold,
                              0, 1);
    const confidence = (indexScore * 0.7) + (othersScore * 0.3);
    return {
      confidence: THREE.MathUtils.clamp(confidence, 0, 1),
      data: {indexDistance, averageOthers},
    };
  }

  private computeSpread(
      context: HandContext,
      config: GestureConfiguration): GestureDetectionResult|undefined {
    const thumb = this.getJointPosition(context, 'thumb-tip');
    const index = this.getJointPosition(context, 'index-finger-tip');
    const middle = this.getJointPosition(context, 'middle-finger-tip');
    const ring = this.getJointPosition(context, 'ring-finger-tip');
    const pinky = this.getJointPosition(context, 'pinky-finger-tip');
    if (!thumb || !index || !middle || !ring || !pinky) return undefined;

    const pairs: [THREE.Vector3, THREE.Vector3][] = [
      [thumb, index],
      [index, middle],
      [middle, ring],
      [ring, pinky],
    ];
    const distances = pairs.map(([a, b]) => a.distanceTo(b));
    const average = distances.reduce((sum, v) => sum + v, 0) / distances.length;
    const threshold = config.threshold ?? DEFAULT_SPREAD_THRESHOLD;
    const confidence =
        THREE.MathUtils.clamp((average - threshold) / (threshold * 0.6), 0, 1);
    return {confidence, data: {averageDistance: average}};
  }

  private getJointPosition(context: HandContext, jointName: string) {
    return context.joints.get(jointName);
  }

  private getFingerTips(context: HandContext) {
    const tips: THREE.Vector3[] = [];
    const names = [
      'thumb-tip',
      'index-finger-tip',
      'middle-finger-tip',
      'ring-finger-tip',
      'pinky-finger-tip',
    ];
    for (const name of names) {
      const joint = this.getJointPosition(context, name as string);
      if (joint) {
        tips.push(joint);
      }
    }
    return tips;
  }
}
