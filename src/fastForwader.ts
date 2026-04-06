import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';
import type { MouseEventArgs, UIObject } from './UIObject';

type SpeedMode = 0.5 | 1 | 2;

export class FastForwader implements UIObject {
	private bound: Rect = {
		x: 0,
		y: 0,
		w: 0,
		h: 0,
	};

	private icon: HTMLImageElement;
	private currentSpeed: SpeedMode = 1;

	constructor() {
		this.icon = new Image();
		this.icon.src = new URL('../assets/images/ff.svg', import.meta.url).toString();
	}

	public get speed(): number {
		return this.currentSpeed;
	}

	update(_deltaTime: number): void {}

	private renderSlowOverlay(
		ctx: CanvasRenderingContext2D,
		centerX: number,
		centerY: number,
	): void {
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

	private renderFastOverlay(
		ctx: CanvasRenderingContext2D,
		centerX: number,
		centerY: number,
	): void {
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

	render(
		ctx: CanvasRenderingContext2D,
		_params: RenderParameters,
		width: number,
		height: number,
	): void {
		this.bound.w = width / 2;
		this.bound.h = height / 2;
		this.bound.x = this.bound.w / 2;
		this.bound.y = this.bound.h / 2;

		if (this.currentSpeed === 1) {
			return;
		}

		const halfWidth = this.bound.w / 2;
		const centerY = this.bound.y + this.bound.h / 2;

		if (this.currentSpeed < 1) {
			const centerX = this.bound.x + halfWidth / 2;
			this.renderSlowOverlay(ctx, centerX, centerY);
		} else {
			const centerX = this.bound.x + halfWidth + halfWidth / 2;
			this.renderFastOverlay(ctx, centerX, centerY);
		}
	}

	getBoundingBox(): Rect | null {
		return this.bound;
	}

	onMouseDown?(e?: MouseEventArgs): void {
		if (!e) {
			this.currentSpeed = 1;
			return;
		}

		this.currentSpeed = e.x < this.bound.w / 2 ? 0.5 : 2;
	}

	onMouseUp?(_e?: MouseEventArgs): void {
		this.currentSpeed = 1;
	}
}
