// Fail closed if a future shared UI change accidentally enables online play.
export function io() { throw new Error('Online play is not part of the Solo Edition.'); }
