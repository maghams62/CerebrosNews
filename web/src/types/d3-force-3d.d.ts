declare module "d3-force-3d" {
  type NumberAccessor = number | ((node: unknown) => number);

  interface AxisForce {
    strength(value: NumberAccessor): AxisForce;
  }

  interface CollideForce {
    strength(value: number): CollideForce;
    iterations(value: number): CollideForce;
  }

  export function forceX(x?: NumberAccessor): AxisForce;
  export function forceY(y?: NumberAccessor): AxisForce;
  export function forceCollide(radius?: NumberAccessor): CollideForce;
}
