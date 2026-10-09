import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { CARS } from '../shared/racing.js';
import { RacingRenderer, makeCar, disposeGroup } from '../public/src/renderer.js';

test('every rotating garage car fits narrow previews above the stats at short and tall viewport heights', () => {
  const point = new Vector3();
  for (const definition of CARS) {
    const car = makeCar(definition.id), box = new Box3().setFromObject(car);
    const previewBounds = { radius: Math.hypot(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), Math.max(Math.abs(box.min.z), Math.abs(box.max.z))), minY: box.min.y + .16, maxY: box.max.y + .16 };
    car.position.y = .16;
    for (const width of [305, 402, 745]) for (const height of [500, 850]) {
      const camera = new PerspectiveCamera(48, width / height, .1, 1400);
      RacingRenderer.prototype.frameGarage.call({ camera, previewBounds }, width, height);
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        car.rotation.y = angle; car.updateMatrixWorld(true);
        car.traverse(object => {
          const positions = object.geometry?.attributes.position;
          if (!positions) return;
          for (let index = 0; index < positions.count; index++) {
            point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).project(camera);
            const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2;
            assert.ok(x >= 18 && x <= width - 18, `${definition.id} retains both ends/wheels at ${width}px`);
            assert.ok(y >= (width > 560 ? 215 : 235) && y <= (width > 560 ? 350 : 375), `${definition.id} remains between the heading and measurements`);
          }
        });
      }
    }
    disposeGroup(car);
  }
});

test('returning to the desktop garage clears the narrow preview offset and restores normal zoom', () => {
  const camera = new PerspectiveCamera(48, 305 / 850, .1, 1400);
  RacingRenderer.prototype.frameGarage.call({ camera }, 305, 850);
  assert.equal(camera.view.enabled, true); assert.ok(camera.zoom < 1);
  RacingRenderer.prototype.frameGarage.call({ camera }, 1280, 720);
  assert.equal(camera.view.enabled, false); assert.equal(camera.zoom, 1);
  assert.equal(camera.aspect, 1280 / 720); assert.equal(camera.fov, 48);
});
