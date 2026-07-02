// Pairwise aspect computation, shared by natal charts (bodies vs. themselves)
// and transits (transiting bodies vs. natal bodies).

export interface AspectBody {
  body: string;
  longitude: number;
}

export interface Aspect {
  body1: string;
  body2: string;
  type: string;
  orb: number;
}

export interface AspectOrbConfig {
  type: string;
  angle: number;
  orb: number;
}

function angularSep(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// When bodiesA and bodiesB are the same array (reference equality), pairs are
// deduped via i<j (natal-style self-aspects). Otherwise every A×B pair is
// evaluated (cross-aspects, e.g. transiting-to-natal).
export function computeAspects(
  bodiesA: AspectBody[],
  bodiesB: AspectBody[],
  orbConfig: readonly AspectOrbConfig[]
): Aspect[] {
  const aspects: Aspect[] = [];
  const sameSet = bodiesA === bodiesB;

  for (let i = 0; i < bodiesA.length; i++) {
    for (let j = sameSet ? i + 1 : 0; j < bodiesB.length; j++) {
      const a = bodiesA[i];
      const b = bodiesB[j];
      const sep = angularSep(a.longitude, b.longitude);
      for (const { type, angle, orb } of orbConfig) {
        const actualOrb = Math.abs(sep - angle);
        if (actualOrb <= orb) {
          aspects.push({
            body1: a.body,
            body2: b.body,
            type,
            orb: Math.round(actualOrb * 100) / 100,
          });
          break; // aspect orb ranges don't overlap, so at most one match per pair
        }
      }
    }
  }
  return aspects;
}
