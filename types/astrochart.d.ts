declare module "@astrodraw/astrochart" {
  export interface AstroData {
    planets: Record<string, number[]>;
    cusps: number[];
  }

  export interface FormedAspect {
    point:   { name: string; position: number };
    toPoint: { name: string; position: number };
    aspect:  { name: string; degree: number; color: string; orbit: number };
    precision: string;
  }

  export class Radix {
    // Passing customAspects draws exactly those lines and skips the
    // library's own aspect calculation (which uses its own default orbs).
    aspects(customAspects?: FormedAspect[] | null): Radix;
    transit(data: AstroData): unknown;
    on(eventName: string, callback: (...args: unknown[]) => void): void;
  }

  export class Chart {
    constructor(elementId: string, width: number, height: number, settings?: Record<string, unknown>);
    radix(data: AstroData): Radix;
    scale(factor: number): void;
  }

  const _default: typeof Chart;
  export default _default;
}
