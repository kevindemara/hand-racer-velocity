export const championshipTracks = ['coast', 'desert', 'alpine', 'city'];
export function awardChampionship(series, track, rank) {
  series.points += [12, 9, 6, 3][rank - 1] || 0;
  series.results.push({ track, rank });
  return series.round === championshipTracks.length - 1 && series.points >= 36;
}
export function advanceMode(race, events, dt = 1 / 60) {
  const v = race.vehicle, mode = race.config.mode;
  if (mode === 'checkpoint' && events.includes('checkpoint')) {
    race.checkpointDeadline = Math.min(v.time + 15, race.checkpointDeadline + 4);
    race.message = '+4 seconds'; race.messageTime = 1;
  }
  if (mode === 'elimination') {
    const active = [v, ...race.bots].filter(car => !car.eliminated);
    const leadingLap = Math.max(...active.map(car => car.laps.length));
    if (leadingLap > race.eliminationLap && active.length > 1) {
      race.eliminationLap = leadingLap;
      const last = active.sort((a, b) => a.distance - b.distance)[0];
      last.eliminated = true; last.speed = 0;
      if (last === v) return 'Eliminated';
      race.message = 'Last driver eliminated'; race.messageTime = 2;
    }
  }
  if (mode === 'survival') {
    race.survivalProgress = (race.survivalProgress || 0) + (v.speed > 12 ? dt : 0);
    if (v.collisions >= 3) return 'Out of strikes';
    if (v.time - race.survivalProgress > 12) return 'Keep moving to survive';
    if (race.survivalProgress >= 90) { v.finished = true; return 'Survived the run!'; }
  }
  if (mode === 'checkpoint' && v.time > race.checkpointDeadline) return 'Time ran out';
  if (events.includes('finish')) return 'Finished';
  return null;
}
