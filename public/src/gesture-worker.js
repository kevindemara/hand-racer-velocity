import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
let recognizer;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const baseUrl = data.baseUrl || data.origin + '/';
      const vision = await FilesetResolver.forVisionTasks(new URL('vendor/mediapipe', baseUrl).href);
      recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath: new URL('assets/models/gesture_recognizer.task', baseUrl).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .65,
        minHandPresenceConfidence: .65, minTrackingConfidence: .65,
        cannedGesturesClassifierOptions: { categoryAllowlist: ['Closed_Fist', 'Open_Palm', 'None'], scoreThreshold: .4 }
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame' && recognizer) {
      const result = recognizer.recognizeForVideo(data.bitmap, data.timestamp);
      data.bitmap.close(); self.postMessage({ type: 'result', result, timestamp: data.timestamp });
    } else if (data.type === 'close') { recognizer?.close(); self.close(); }
  } catch (error) { data.bitmap?.close(); self.postMessage({ type: 'error', message: error.message }); }
};
