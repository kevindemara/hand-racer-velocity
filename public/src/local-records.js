import { CARS, TRACKS, MODES, DIFFICULTIES, formatTime } from '../../shared/racing.js';

export function personalRecords(profile, config) {
  return Object.entries(profile.bests).flatMap(([key, time]) => {
    const [track, mode, difficulty, laps, seed, car, tuning] = key.split(':');
    if (track !== config.track || mode !== config.mode || difficulty !== config.difficulty ||
      Number(laps) !== config.laps || Number(seed) !== config.seed || !Number.isFinite(time) || time <= 0) return [];
    const machine = CARS.find(c => c.id === car);
    if (!machine || !['balanced', 'grip', 'speed'].includes(tuning)) return [];
    return [{ key, time, label: `${machine.name} / ${{ balanced:'Balanced', grip:'Corner grip', speed:'Top speed' }[tuning]}`,
      value: `${formatTime(time)}${profile.ghosts[key]?.length ? ' · ghost saved' : ''}` }];
  }).sort((a, b) => a.time - b.time || a.label.localeCompare(b.label));
}

export function recordContext(config) {
  const distance = config.mode === 'survival' ? '90 seconds moving' : config.mode === 'checkpoint' ? 'Checkpoint timer' : `${config.laps} lap${config.laps === 1 ? '' : 's'}`;
  return `${TRACKS.find(t => t.id === config.track)?.name} / ${MODES.find(m => m.id === config.mode)?.name} / ${DIFFICULTIES[config.difficulty]?.label} / ${distance} / seed ${config.seed}`;
}
