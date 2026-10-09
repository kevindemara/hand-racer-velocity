import { CARS, TUNING_FACTORS, createVehicle, stepVehicle } from '../../shared/racing.js';

const dryRoad = { length: 4000, width: 14, grip: 1, points: [{ x: 0, y: 0, z: 0, distance: 0 }, { x: 0, y: 0, z: 4000, distance: 4000 }] };
const measurements = new Map();

export function garagePerformance(carId, tuning = 'balanced') {
  const car = CARS.find(definition => definition.id === carId) || CARS[0];
  const setup = Object.hasOwn(TUNING_FACTORS,tuning) ? TUNING_FACTORS[tuning] : TUNING_FACTORS.balanced;
  const key = `${car.id}:${setup.speed}`;
  if (!measurements.has(key)) {
    const vehicle = createVehicle(car.id, tuning), target = 100 / 3.6;
    if (car.speed * setup.speed >= target) {
      for (let tick = 0; tick < 600 && vehicle.speed < target; tick++) stepVehicle(vehicle, { throttle: 1 }, 1 / 60, dryRoad, { assist: false });
    }
    measurements.set(key, vehicle.speed >= target ? vehicle.time : null);
  }
  return { topSpeed: car.speed * setup.speed * 3.6, zeroToHundred: measurements.get(key), grip: car.grip * setup.grip, durability: car.durability };
}

export function performanceRows(carId, tuning) {
  const stats = garagePerformance(carId, tuning);
  const fastest = Math.min(...CARS.map(car => garagePerformance(car.id).zeroToHundred ?? Infinity));
  return [
    { label: 'TOP SPEED', value: `${Math.round(stats.topSpeed)} km/h`, percent: stats.topSpeed / (Math.max(...CARS.map(car => car.speed)) * TUNING_FACTORS.speed.speed * 3.6) },
    { label: '0–100 KM/H', value: stats.zeroToHundred === null ? '—' : `${stats.zeroToHundred.toFixed(1)} s`, percent: stats.zeroToHundred ? fastest / stats.zeroToHundred : 0 },
    { label: 'GRIP', value: stats.grip.toFixed(1), percent: stats.grip / (Math.max(...CARS.map(car => car.grip)) * TUNING_FACTORS.grip.grip) },
    { label: 'DURABILITY', value: `${Math.round(stats.durability * 100)}%`, percent: stats.durability / Math.max(...CARS.map(car => car.durability)) }
  ];
}

export function setupDescription(tuning) {
  if (tuning === 'grip') return 'Corner grip · grip +18% / speed −4%';
  if (tuning === 'speed') return 'Top speed · speed +6% / grip −12%';
  return 'Balanced · standard speed and grip';
}
