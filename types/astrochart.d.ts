declare module "@astrodraw/astrochart" {
  export interface AstroData {
    planets: Record<string, number[]>;
    cusps: number[];
  }

  export class Radix {
    aspects(): void;
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
