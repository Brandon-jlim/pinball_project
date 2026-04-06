import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';
import type { MouseEventArgs, UIObject } from './UIObject';

type SpeedMode = 0.5 | 1 | 2;

export class FastForwader implements UIObject {
  private static activeInstance: FastForwader | null = null;
  private static isKeyboardListenerAttached: boolean = false;

  private bound: Rect = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };

  private icon: HTMLImageElement;
  private currentSpeed: SpeedMode = 1;

  private mousePressed: boolean = false;
  private fastKeyPressed: boolean = false;
  private slowKeyPressed: boolean = false;

  constructor() {
    this.icon = new Image();
    this.icon.src = new URL('../assets/images/ff.svg', import.meta.url).toString();

    FastForwader.activeInstance = this;
    FastForwader.attachKeyboardListeners();
  }

  private static attachKeyboardListeners(): void {
    if (FastForwader.isKeyboardListenerAttached || typeof window === 'undefined') {
      return;
    }

    window.addEventListener('keydown', FastForwader.handleKeyDown);
    window.addEventListener('keyup', FastForwader.handleKeyUp);
    window.addEventListener('blur', FastForwader.handleWindowBlur);

    FastForwader.isKeyboardListenerAttached = true;
  }

  private static handleKeyDown = (e: KeyboardEvent): void => {
    const instance = FastForwader.activeInstance;
    if (!instance) {
      return;
    }

    instance.onKeyDown(e);
  };

  private static handleKeyUp = (e: KeyboardEvent): void => {
    const instance = FastForwader.activeInstance;
    if (!instance) {
      return;
    }

    instance.onKeyUp(e);
  };

  private static handleWindowBlur = (): void => {
    const instance = FastForwader.activeInstance;
    if (!instance) {
      return;
    }

    instance.onWindowBlur();
  };

  public get speed(): number {
    return this.currentSpeed;
  }

  update(_deltaTime: number): void {}

  private onKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();

    if (key === 'p') {
      this.fastKeyPressed = true;
      e.preventDefault();
      this.updateSpeed();
      return;
    }

    if (key === 'o') {
      this.slowKeyPressed = true;
      e.preventDefault();
      this.updateSpeed();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();

    if (key === 'p') {
      this.fastKeyPressed = false;
      this.updateSpeed();
      return;
    }

    if (key === 'o') {
      this.slowKeyPressed = false;
      this.updateSpeed();
    }
  }

  private onWindowBlur(): void {
    this.fastKeyPressed = false;
    this.slowKeyPressed = false;
    this.mousePressed = false;
    this.updateSpeed();
  }

  private updateSpeed(): void {
    if (this.slowKeyPressed) {
      this.currentSpeed = 0.5;
      return;
    }

    if (this.fastKeyPressed || this.mousePressed) {
      this.currentSpeed = 2;
      return;
    }

    this.currentSpeed = 1;
  }

  private renderSlowOverlay(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'white';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeRect(centerX - 110, centerY - 50, 220, 100);
    ctx.fillText('0.5x', centerX, centerY + 2);

    ctx.restore();
  }

  private renderFastOverlay(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
    ctx.save();
    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;

    ctx.strokeRect(centerX - 110, centerY - 50, 220, 100);
    ctx.drawImage(this.icon, centerX - 96, centerY - 34, 108, 68);

    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('2x', centerX + 25, centerY + 2);

    ctx.restore();
  }

  render(ctx: CanvasRenderingContext2D, _params: RenderParameters, width: number, height: number): void {
    this.bound.w = width / 2;
    this.bound.h = height / 2;
    this.bound.x = this.bound.w / 2;
    this.bound.y = this.bound.h / 2;

    if (this.currentSpeed === 1) {
      return;
    }

    const centerX = this.bound.x + this.bound.w / 2;
    const centerY = this.bound.y + this.bound.h / 2;

    if (this.currentSpeed < 1) {
      this.renderSlowOverlay(ctx, centerX, centerY);
    } else {
      this.renderFastOverlay(ctx, centerX, centerY);
    }
  }

  getBoundingBox(): Rect | null {
    return this.bound;
  }

  onMouseDown?(_e?: MouseEventArgs): void {
    this.mousePressed = true;
    this.updateSpeed();
  }

  onMouseUp?(_e?: MouseEventArgs): void {
    this.mousePressed = false;
    this.updateSpeed();
  }
}
