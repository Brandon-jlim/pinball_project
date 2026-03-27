import { Camera } from './camera';
import { canvasHeight, canvasWidth, initialZoom, Skills, Themes, zoomThreshold } from './data/constants';
import { DEV_ASSIST_KEY, loadDevAssistConfig } from './devAssist';
import { type StageDef, stages } from './data/maps';
import { FastForwader } from './fastForwader';
import type { GameObject } from './gameObject';
import type { IPhysics } from './IPhysics';
import { Marble } from './marble';
import { Minimap } from './minimap';
import options from './options';
import { ParticleManager } from './particleManager';
import { Box2dPhysics } from './physics-box2d';
import { RankRenderer } from './rankRenderer';
import { RouletteRenderer } from './rouletteRenderer';
import { SkillEffect } from './skillEffect';
import type { ColorTheme } from './types/ColorTheme';
import type { MouseEventHandlerName, MouseEventName } from './types/mouseEvents.type';
import type { UIObject } from './UIObject';
import { bound } from './utils/bound.decorator';
import { parseName, shuffle } from './utils/utils';
import { VideoRecorder } from './utils/videoRecorder';

export class Roulette extends EventTarget {
  private _marbles: Marble[] = [];

  private _lastTime: number = 0;
  private _elapsed: number = 0;

  private _updateInterval = 10;
  private _timeScale = 1;
  private _speed = 1;

  private _winners: Marble[] = [];
  private _particleManager = new ParticleManager();
  private _stage: StageDef | null = null;

  protected _camera: Camera = new Camera();
  protected _renderer: RouletteRenderer;

  private _effects: GameObject[] = [];

  private _winnerRank = 0;
  private _totalMarbleCount = 0;
  private _goalDist: number = Infinity;
  private _isRunning: boolean = false;
  private _winner: Marble | null = null;
  private _devAssistConfig = loadDevAssistConfig();
  private _devAssistStageCenterX = 12.95;
  private _lastDevAssistSync = 0;
  private _devAssistSpinnerZones: Array<{ x: number; y: number; radius: number; spinSign: number }> = [];
  private _devAssistSpinnerState = new Map<number, { lastX: number; lastY: number; stallMs: number; escapeCooldownMs: number }>();

  private _uiObjects: UIObject[] = [];

  private _autoRecording: boolean = false;
  private _recorder!: VideoRecorder;

  private physics!: IPhysics;

  private _isReady: boolean = false;
  protected fastForwarder!: FastForwader;
  protected _theme: ColorTheme = Themes.dark;

  get isReady() {
    return this._isReady;
  }

  protected createRenderer(): RouletteRenderer {
    return new RouletteRenderer();
  }

  protected createFastForwader(): FastForwader {
    return new FastForwader();
  }

  constructor() {
    super();
    this._renderer = this.createRenderer();
    this._renderer.init().then(() => {
      this._init().then(() => {
        this._isReady = true;
        this._update();
      });
    });
  }

  public getZoom() {
    return initialZoom * this._camera.zoom;
  }

  private addUiObject(obj: UIObject) {
    this._uiObjects.push(obj);
    if (obj.onWheel) {
      this._renderer.canvas.addEventListener('wheel', obj.onWheel);
    }
    if (obj.onMessage) {
      obj.onMessage((msg) => {
        console.log('onMessage', msg);
        this.dispatchEvent(new CustomEvent('message', { detail: msg }));
      });
    }
  }

  @bound
  private _update() {
    if (!this._lastTime) this._lastTime = Date.now();
    const currentTime = Date.now();

    this._elapsed += (currentTime - this._lastTime) * this._speed * this.fastForwarder.speed;
    if (this._elapsed > 100) {
      this._elapsed %= 100;
    }
    this._lastTime = currentTime;

    const interval = (this._updateInterval / 1000) * this._timeScale;

    while (this._elapsed >= this._updateInterval) {
      this.physics.step(interval);
      this._updateMarbles(this._updateInterval);
      this._particleManager.update(this._updateInterval);
      this._updateEffects(this._updateInterval);
      this._elapsed -= this._updateInterval;
      this._uiObjects.forEach((obj) => obj.update(this._updateInterval));
    }

    if (this._marbles.length > 1) {
      this._marbles.sort((a, b) => b.y - a.y);
    }

    if (this._stage) {
      this._camera.update({
        marbles: this._marbles,
        stage: this._stage,
        needToZoom: this._goalDist < zoomThreshold,
        targetIndex: this._winners.length > 0 ? this._winnerRank - this._winners.length : 0,
      });
    }

    this._render();
    window.requestAnimationFrame(this._update);
  }

  private _updateMarbles(deltaTime: number) {
    if (!this._stage) return;

    this._syncDevAssistConfig();
    const assistedMarble = this._findAssistedMarble();
    const leadY = this._getLeadMarbleY();

    for (let i = 0; i < this._marbles.length; i++) {
      const marble = this._marbles[i];
      marble.update(deltaTime);
      if (this._isRunning && assistedMarble?.id === marble.id) {
        this._applyDevAssist(marble, deltaTime, leadY);
      }
      if (marble.skill === Skills.Impact) {
        this._effects.push(new SkillEffect(marble.x, marble.y));
        this.physics.impact(marble.id);
      }
      if (marble.y > this._stage.goalY) {
        this._winners.push(marble);
        if (this._isRunning && this._winners.length === this._winnerRank + 1) {
          this.dispatchEvent(new CustomEvent('goal', { detail: { winner: marble.name } }));
          this._winner = marble;
          this._isRunning = false;
          this._particleManager.shot(this._renderer.width, this._renderer.height);
          setTimeout(() => {
            this._recorder.stop();
          }, 1000);
        } else if (
          this._isRunning &&
          this._winnerRank === this._winners.length &&
          this._winnerRank === this._totalMarbleCount - 1
        ) {
          this.dispatchEvent(
            new CustomEvent('goal', {
              detail: { winner: this._marbles[i + 1].name },
            })
          );
          this._winner = this._marbles[i + 1];
          this._isRunning = false;
          this._particleManager.shot(this._renderer.width, this._renderer.height);
          setTimeout(() => {
            this._recorder.stop();
          }, 1000);
        }
        setTimeout(() => {
          this.physics.removeMarble(marble.id);
        }, 500);
      }
    }

    const targetIndex = this._winnerRank - this._winners.length;
    const topY = this._marbles[targetIndex] ? this._marbles[targetIndex].y : 0;
    this._goalDist = Math.abs(this._stage.zoomY - topY);
    this._timeScale = this._calcTimeScale();

    this._marbles = this._marbles.filter((marble) => marble.y <= this._stage?.goalY);
  }

  private _calcTimeScale(): number {
    if (!this._stage) return 1;
    const targetIndex = this._winnerRank - this._winners.length;
    if (this._winners.length < this._winnerRank + 1 && this._goalDist < zoomThreshold) {
      if (
        this._marbles[targetIndex].y > this._stage.zoomY - zoomThreshold * 1.2 &&
        (this._marbles[targetIndex - 1] || this._marbles[targetIndex + 1])
      ) {
        return Math.max(0.2, this._goalDist / zoomThreshold);
      }
    }
    return 1;
  }

  private _updateEffects(deltaTime: number) {
    this._effects.forEach((effect) => effect.update(deltaTime));
    this._effects = this._effects.filter((effect) => !effect.isDestroy);
  }

  private _render() {
    if (!this._stage) return;
    const renderParams = {
      camera: this._camera,
      stage: this._stage,
      entities: this.physics.getEntities(),
      marbles: this._marbles,
      winners: this._winners,
      particleManager: this._particleManager,
      effects: this._effects,
      winnerRank: this._winnerRank,
      winner: this._winner,
      size: { x: this._renderer.width, y: this._renderer.height },
      theme: this._theme,
    };
    this._renderer.render(renderParams, this._uiObjects);
  }

  private async _init() {
    this._recorder = new VideoRecorder(this._renderer.canvas);

    this.physics = new Box2dPhysics();
    await this.physics.init();
    this._syncDevAssistConfig(true);
    window.addEventListener('storage', (event) => {
      if (event.key === DEV_ASSIST_KEY) {
        this._syncDevAssistConfig(true);
      }
    });

    this.addUiObject(new RankRenderer());
    this.attachEvent();
    const minimap = new Minimap();
    minimap.onViewportChange((pos) => {
      if (pos) {
        this._camera.setPosition(pos, false);
        this._camera.lock(true);
      } else {
        this._camera.lock(false);
      }
    });
    this.addUiObject(minimap);
    this.fastForwarder = this.createFastForwader();
    this.addUiObject(this.fastForwarder);
    this._stage = stages[0];
    this._loadMap();
  }

  @bound
  private mouseHandler(eventName: MouseEventName, e: MouseEvent) {
    const handlerName = `on${eventName}` as MouseEventHandlerName;

    const sizeFactor = this._renderer.sizeFactor;
    const pos = { x: e.offsetX * sizeFactor, y: e.offsetY * sizeFactor };
    this._uiObjects.forEach((obj) => {
      if (!obj[handlerName]) return;
      const bounds = obj.getBoundingBox();
      if (!bounds) {
        obj[handlerName]({ ...pos, button: e.button });
      } else if (
        bounds &&
        pos.x >= bounds.x &&
        pos.y >= bounds.y &&
        pos.x <= bounds.x + bounds.w &&
        pos.y <= bounds.y + bounds.h
      ) {
        obj[handlerName]({ x: pos.x - bounds.x, y: pos.y - bounds.y, button: e.button });
      } else {
        obj[handlerName](undefined);
      }
    });
  }

  private attachEvent() {
    const canvas = this._renderer.canvas;
    const onPointerRelease = (e: Event) => {
      this.mouseHandler('MouseUp', e as MouseEvent);
      window.removeEventListener('pointerup', onPointerRelease);
      window.removeEventListener('pointercancel', onPointerRelease);
    };

    canvas.addEventListener('pointerdown', (e: Event) => {
      this.mouseHandler('MouseDown', e as MouseEvent);
      window.addEventListener('pointerup', onPointerRelease);
      window.addEventListener('pointercancel', onPointerRelease);
    });

    ['MouseMove', 'DblClick'].forEach((ev) => {
      // @ts-expect-error
      canvas.addEventListener(ev.toLowerCase().replace('mouse', 'pointer'), this.mouseHandler.bind(this, ev));
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  private _syncDevAssistConfig(force: boolean = false) {
    const now = Date.now();
    if (!force && now - this._lastDevAssistSync < 120) return;

    this._lastDevAssistSync = now;
    this._devAssistConfig = loadDevAssistConfig();
  }

  private _findAssistedMarble() {
    if (!this._devAssistConfig.targetId || this._devAssistConfig.strength <= 0) return null;
    return this._marbles.find((marble) => marble.controlId === this._devAssistConfig.targetId) || null;
  }

  private _getLeadMarbleY() {
    let leadY = -Infinity;

    for (let i = 0; i < this._marbles.length; i++) {
      if (this._marbles[i].y > leadY) {
        leadY = this._marbles[i].y;
      }
    }

    return Number.isFinite(leadY) ? leadY : 0;
  }

  private _computeStageCenterX(stage: StageDef) {
    let minX = Infinity;
    let maxX = -Infinity;

    stage.entities?.forEach((entity) => {
      switch (entity.shape.type) {
        case 'polyline':
          entity.shape.points.forEach(([x]) => {
            const worldX = entity.position.x + x;
            if (worldX < minX) minX = worldX;
            if (worldX > maxX) maxX = worldX;
          });
          break;
        case 'circle':
          minX = Math.min(minX, entity.position.x - entity.shape.radius);
          maxX = Math.max(maxX, entity.position.x + entity.shape.radius);
          break;
        case 'box':
          minX = Math.min(minX, entity.position.x - entity.shape.width);
          maxX = Math.max(maxX, entity.position.x + entity.shape.width);
          break;
      }
    });

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
      return 12.95;
    }

    return (minX + maxX) / 2;
  }

  private _computeSpinnerZones(stage: StageDef) {
    return (stage.entities || [])
      .filter((entity) => entity.type === 'kinematic' && entity.shape.type === 'box' && Math.abs(entity.props.angularVelocity) > 0.25)
      .map((entity) => ({
        x: entity.position.x,
        y: entity.position.y,
        radius: Math.max(1.8, entity.shape.width * 1.4 + 0.9),
        spinSign: Math.sign(entity.props.angularVelocity) || 1,
      }));
  }

  private _getNearestSpinnerZone(marble: Marble) {
    let nearest: { x: number; y: number; radius: number; spinSign: number } | null = null;
    let bestDistSq = Infinity;

    for (let i = 0; i < this._devAssistSpinnerZones.length; i++) {
      const zone = this._devAssistSpinnerZones[i];
      const dx = marble.x - zone.x;
      const dy = marble.y - zone.y;
      const distSq = dx * dx + dy * dy;
      const limit = (zone.radius + 1.5) * (zone.radius + 1.5);
      if (distSq <= limit && distSq < bestDistSq) {
        nearest = zone;
        bestDistSq = distSq;
      }
    }

    return nearest;
  }

  private _getDevAssistSpinnerState(marble: Marble) {
    const existing = this._devAssistSpinnerState.get(marble.id);
    if (existing) return existing;

    const next = { lastX: marble.x, lastY: marble.y, stallMs: 0, escapeCooldownMs: 0 };
    this._devAssistSpinnerState.set(marble.id, next);
    return next;
  }

  private _applyDevAssist(marble: Marble, deltaTime: number, leadY: number) {
    if (!this._stage) return;

    const strength = Math.max(0, Math.min(1, this._devAssistConfig.strength / 100));
    if (!strength) return;

    const tickScale = deltaTime / this._updateInterval;
    const velocity = this.physics.getMarbleVelocity(marble.id);
    const angularVelocity = this.physics.getMarbleAngularVelocity(marble.id);
    const progress = Math.max(0, Math.min(1, marble.y / this._stage.goalY));
    const spinnerZone = this._getNearestSpinnerZone(marble);
    const spinnerInfluence = spinnerZone
      ? Math.max(0, Math.min(1, 1 - Math.abs(marble.y - spinnerZone.y) / (spinnerZone.radius + 1.35)))
      : 0;
    const spinnerPhase = spinnerInfluence > 0.05;
    const phaseScale = progress < 0.68 ? 1 : progress < 0.88 ? 0.76 : 0.46;
    const trailingDistance = Math.max(0, leadY - marble.y);
    const trailingScale = Math.min(1, trailingDistance / 14) * strength * 0.35;
    const effectiveStrength = Math.min(1, strength * phaseScale + trailingScale);

    let nextVx = velocity.x;
    let nextVy = velocity.y;

    const baseDesiredVy = 2.8 + effectiveStrength * 3.8 + strength * (1 - progress) * 1.1;
    const desiredVy = spinnerPhase
      ? baseDesiredVy * (0.72 + (1 - spinnerInfluence) * 0.18)
      : baseDesiredVy;
    if (nextVy < desiredVy) {
      const downGain = spinnerPhase
        ? 0.04 + effectiveStrength * 0.11
        : 0.08 + effectiveStrength * 0.22;
      nextVy += Math.min(desiredVy - nextVy, downGain * tickScale);
    }

    if (nextVy < -0.25) {
      const reboundClamp = spinnerPhase
        ? 0.04 + effectiveStrength * 0.08
        : 0.08 + effectiveStrength * 0.18;
      nextVy *= Math.max(0, 1 - reboundClamp * tickScale);
    }

    const centeringFactor = spinnerPhase ? 0.22 + (1 - spinnerInfluence) * 0.18 : 1;
    const centerPull = (this._devAssistStageCenterX - marble.x) * (0.01 + effectiveStrength * 0.03) * centeringFactor;
    const maxCenterPull = (0.08 + effectiveStrength * 0.16) * centeringFactor;
    nextVx += Math.max(-maxCenterPull, Math.min(maxCenterPull, centerPull));

    const sideDamping = spinnerPhase
      ? 0.0015 + effectiveStrength * 0.005
      : 0.003 + effectiveStrength * 0.012;
    nextVx *= Math.max(0, 1 - sideDamping * tickScale);

    const maxSideSpeed = spinnerPhase
      ? 5.2 - effectiveStrength * 0.35
      : 4.8 - effectiveStrength * 1.2;
    if (Math.abs(nextVx) > maxSideSpeed) {
      nextVx = Math.sign(nextVx) * maxSideSpeed;
    }

    const maxDownSpeed = spinnerPhase
      ? 8.1 + effectiveStrength * 1.2
      : 8.8 + effectiveStrength * 1.8;
    if (nextVy > maxDownSpeed) {
      nextVy = maxDownSpeed;
    }

    let nextAngularVelocity = angularVelocity * Math.max(0, 1 - (0.04 + effectiveStrength * 0.14) * tickScale);

    if (spinnerZone) {
      const state = this._getDevAssistSpinnerState(marble);
      const deltaY = marble.y - state.lastY;
      const deltaX = marble.x - state.lastX;
      const barelyProgressing = deltaY < 0.03 && velocity.y < 2.5;
      const orbiting = Math.abs(deltaX) > 0.015 && Math.abs(deltaY) < 0.02;

      if (barelyProgressing || orbiting) {
        state.stallMs += deltaTime;
      } else {
        state.stallMs = Math.max(0, state.stallMs - deltaTime * 1.5);
      }

      state.escapeCooldownMs = Math.max(0, state.escapeCooldownMs - deltaTime);

      if (state.stallMs > 180 && state.escapeCooldownMs <= 0) {
        const sideSign = marble.x >= spinnerZone.x ? 1 : -1;
        const tangentSign = spinnerZone.spinSign * sideSign;
        nextVx += tangentSign * (0.18 + strength * 0.35);
        nextVy = Math.max(nextVy, 2.6 + strength * 1.8);
        nextAngularVelocity += spinnerZone.spinSign * (0.6 + strength * 0.9);
        state.stallMs = 0;
        state.escapeCooldownMs = 220;
      } else if (spinnerInfluence > 0.3) {
        const sideSign = marble.x >= spinnerZone.x ? 1 : -1;
        nextVx += spinnerZone.spinSign * sideSign * (0.015 + strength * 0.035) * spinnerInfluence * tickScale;
      }

      state.lastX = marble.x;
      state.lastY = marble.y;
    }

    this.physics.setMarbleVelocity(marble.id, nextVx, nextVy);
    this.physics.setMarbleAngularVelocity(marble.id, nextAngularVelocity);
  }

  private _loadMap() {
    if (!this._stage) {
      throw new Error('No map has been selected');
    }

    this.physics.createStage(this._stage);
    this._devAssistStageCenterX = this._computeStageCenterX(this._stage);
    this._devAssistSpinnerZones = this._computeSpinnerZones(this._stage);
    this._devAssistSpinnerState.clear();
    this._camera.initializePosition();
  }

  public clearMarbles() {
    this.physics.clearMarbles();
    this._winner = null;
    this._winners = [];
    this._marbles = [];
    this._devAssistSpinnerState.clear();
  }

  public start() {
    this._syncDevAssistConfig(true);
    this._isRunning = true;
    this._winnerRank = options.winningRank;
    if (this._winnerRank >= this._marbles.length) {
      this._winnerRank = this._marbles.length - 1;
    }
    this._camera.startFollowingMarbles();

    if (this._autoRecording) {
      this._recorder.start().then(() => {
        this.physics.start();
        this._marbles.forEach((marble) => (marble.isActive = true));
      });
    } else {
      this.physics.start();
      this._marbles.forEach((marble) => (marble.isActive = true));
    }
  }

  public setSpeed(value: number) {
    if (value <= 0) {
      throw new Error('Speed multiplier must larger than 0');
    }
    this._speed = value;
  }

  public setTheme(themeName: keyof typeof Themes) {
    this._theme = Themes[themeName];
  }

  public getSpeed() {
    return this._speed;
  }

  public setWinningRank(rank: number) {
    this._winnerRank = rank;
  }

  public setAutoRecording(value: boolean) {
    this._autoRecording = value;
  }

  public setMarbles(names: string[]) {
    this._syncDevAssistConfig(true);
    this.reset();
    const arr = names.slice();

    let maxWeight = -Infinity;
    let minWeight = Infinity;

    const members = arr
      .map((nameString) => {
        const result = parseName(nameString);
        if (!result) return null;
        const { name, weight, count } = result;
        if (weight > maxWeight) maxWeight = weight;
        if (weight < minWeight) minWeight = weight;
        return { name, weight, count };
      })
      .filter((member) => !!member);

    const gap = maxWeight - minWeight;

    let totalCount = 0;
    this._devAssistSpinnerState.clear();

    members.forEach((member) => {
      if (member) {
        member.weight = gap ? 0.1 + (member.weight - minWeight) / gap : 0.6;
        totalCount += member.count;
      }
    });

    const orders = shuffle(
      Array(totalCount)
        .fill(0)
        .map((_, i) => i)
    );
    this._devAssistSpinnerState.clear();

    members.forEach((member) => {
      if (member) {
        for (let j = 0; j < member.count; j++) {
          const order = orders.pop() || 0;
          const controlId = `${member.name}::${j + 1}`;
          this._marbles.push(new Marble(this.physics, order, totalCount, member.name, member.weight, controlId));
        }
      }
    });
    this._totalMarbleCount = totalCount;

    // 카메라를 구슬 생성 위치 중앙으로 이동 + 줌인
    if (totalCount > 0) {
      const cols = Math.min(totalCount, 10);
      const rows = Math.ceil(totalCount / 10);
      const lineDelta = -Math.max(0, Math.ceil(rows - 5));
      const centerX = 10.25 + (cols - 1) * 0.3;
      const centerY = (1 + rows) / 2 + lineDelta;

      const spawnWidth = Math.max((cols - 1) * 0.6, 1);
      const spawnHeight = Math.max(rows - 1, 1);
      const margin = 3;
      const viewW = canvasWidth / initialZoom;
      const viewH = canvasHeight / initialZoom;
      const zoom = Math.max(
        1.5,
        Math.min(Math.min(viewW / (spawnWidth + margin * 2), viewH / (spawnHeight + margin * 2)), 3)
      );

      this._camera.initializePosition({ x: centerX, y: centerY }, zoom);
    }
  }

  private _clearMap() {
    this.physics.clear();
    this._marbles = [];
  }

  public reset() {
    this.clearMarbles();
    this._clearMap();
    this._loadMap();
    this._goalDist = Infinity;
  }

  public getCount() {
    return this._marbles.length;
  }

  public getMaps() {
    return stages.map((stage, index) => {
      return {
        index,
        title: stage.title,
      };
    });
  }

  public setMap(index: number) {
    if (index < 0 || index > stages.length - 1) {
      throw new Error('Incorrect map number');
    }
    const names = this._marbles.map((marble) => marble.name);
    this._stage = stages[index];
    this.setMarbles(names);
    this._camera.initializePosition();
  }
}
