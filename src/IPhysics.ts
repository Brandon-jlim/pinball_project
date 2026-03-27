import type { StageDef } from './data/maps';
import type { MapEntityState } from './types/MapEntity.type';

export interface MarbleBodyOptions {
  density?: number;
  restitution?: number;
  friction?: number;
  linearDamping?: number;
  angularDamping?: number;
}

export interface IPhysics {
  init(): Promise<void>;

  clear(): void;

  clearMarbles(): void;

  createStage(stage: StageDef): void;

  createMarble(id: number, x: number, y: number, options?: MarbleBodyOptions): void;

  shakeMarble(id: number): void;

  removeMarble(id: number): void;

  getMarblePosition(id: number): { x: number; y: number; angle: number };

  getMarbleVelocity(id: number): { x: number; y: number };

  setMarbleVelocity(id: number, x: number, y: number): void;

  getMarbleAngularVelocity(id: number): number;

  setMarbleAngularVelocity(id: number, value: number): void;

  getEntities(): MapEntityState[];

  impact(id: number): void;

  start(): void;

  step(deltaSeconds: number): void;
}
