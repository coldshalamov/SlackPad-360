import {
  FLICK_SENSITIVITY_MAX,
  FLICK_SENSITIVITY_MIN,
  type AssistPreset,
  type LabeledAttemptV1,
  type ReplayCheckpoint,
  type SessionTrace,
  type TrickIntentV1,
} from '@slackpad/shared';

export type LabTrickLabel = TrickIntentV1['label'];

export interface FlickItLabActions {
  beginCapture: () => Promise<void>;
  endCapture: () => SessionTrace;
  replay: (trace: SessionTrace) => Promise<ReplayCheckpoint[]>;
  exportTrace: (trace: SessionTrace, label: string) => boolean;
}

export interface LabeledAttemptResult extends LabeledAttemptV1 {
  trace: SessionTrace;
  exported: boolean;
}

/** Testable record/label/replay/compare state for the native lab UI. */
export class FlickItLabController {
  #recording = false;
  #expected: LabTrickLabel = 'ollie';
  readonly #traces: SessionTrace[] = [];
  readonly #confusion = new Map<string, number>();

  constructor(private readonly actions: FlickItLabActions) {}

  get recording(): boolean { return this.#recording; }
  get lastTrace(): SessionTrace | null { return this.#traces.at(-1) ?? null; }

  async start(expected: LabTrickLabel): Promise<void> {
    if (this.#recording) throw new Error('A Flick-It Lab attempt is already recording.');
    this.#expected = expected;
    await this.actions.beginCapture();
    this.#recording = true;
  }

  stopAndExport(): LabeledAttemptResult {
    if (!this.#recording) throw new Error('No Flick-It Lab attempt is recording.');
    const trace = this.actions.endCapture();
    this.#recording = false;
    let recognizedIntent: TrickIntentV1 | undefined;
    for (const event of trace.controlTrace?.events ?? []) {
      if (event.kind === 'intent') recognizedIntent = event.intent;
    }
    const recognized = recognizedIntent?.label ?? 'none';
    const attempt: LabeledAttemptV1 = {
      expected: this.#expected,
      recognized,
      correct: recognized === this.#expected,
      fallback: recognizedIntent?.fallback ?? true,
    };
    if (trace.controlTrace) trace.controlTrace.attempts = [attempt];
    this.#traces.push(trace);
    const key = `${attempt.expected}->${attempt.recognized}`;
    this.#confusion.set(key, (this.#confusion.get(key) ?? 0) + 1);
    if (trace.controlTrace) {
      trace.controlTrace.metrics = { confusion: this.confusionReport() };
    }
    const exported = this.actions.exportTrace(trace, `${attempt.expected}--${attempt.recognized}`);
    return { ...attempt, trace, exported };
  }

  async replayLast(): Promise<ReplayCheckpoint[]> {
    const trace = this.lastTrace;
    if (!trace) throw new Error('No Flick-It Lab trace has been captured.');
    return this.actions.replay(trace);
  }

  compareLastTwo(): { matches: boolean; left: string; right: string } | null {
    if (this.#traces.length < 2) return null;
    const hashes = (trace: SessionTrace): string =>
      trace.checkpoints.map((checkpoint) => `${checkpoint.step}:${checkpoint.hash}`).join('|');
    const left = hashes(this.#traces.at(-2)!);
    const right = hashes(this.#traces.at(-1)!);
    return { matches: left === right, left, right };
  }

  confusionReport(): Record<string, number> {
    return Object.fromEntries(this.#confusion);
  }
}

export interface FlickItLabUiActions {
  getPreset: () => AssistPreset;
  setPreset: (preset: AssistPreset) => void;
  getSensitivity: () => number;
  setSensitivity: (sensitivity: number) => void;
  calibrate: () => boolean;
}

/** Native-only compact lab, opened with F8; browser DEV PAD stays separate. */
export class FlickItLab {
  readonly #root: HTMLDivElement;
  readonly #status: HTMLDivElement;
  readonly #start: HTMLButtonElement;
  readonly #stop: HTMLButtonElement;
  readonly #select: HTMLSelectElement;

  constructor(
    container: HTMLElement,
    private readonly controller: FlickItLabController,
    private readonly uiActions: FlickItLabUiActions,
  ) {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed', left: '14px', top: '54px', width: '310px', display: 'none',
      padding: '14px', borderRadius: '12px', zIndex: '25', color: '#eef5f7',
      background: 'rgba(10,15,20,.94)', border: '1px solid rgba(90,220,175,.4)',
      font: '12px system-ui, sans-serif', boxShadow: '0 14px 45px rgba(0,0,0,.5)',
    } satisfies Partial<CSSStyleDeclaration>);
    const title = document.createElement('div');
    title.textContent = 'FLICK-IT LAB  ·  F8';
    Object.assign(title.style, { color: '#76e7aa', fontWeight: '800', letterSpacing: '.08em', marginBottom: '10px' });

    const select = document.createElement('select');
    for (const label of ['ollie', 'nollie', 'kickflip', 'heelflip', 'fs-shuv', 'bs-shuv'] as LabTrickLabel[]) {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = `Expected: ${label}`;
      select.appendChild(option);
    }
    Object.assign(select.style, { width: '100%', marginBottom: '8px', minHeight: '32px' });

    const buttons = document.createElement('div');
    Object.assign(buttons.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' });
    const makeButton = (label: string): HTMLButtonElement => {
      const button = document.createElement('button');
      button.textContent = label;
      Object.assign(button.style, {
        minHeight: '34px', borderRadius: '7px', border: '1px solid rgba(135,205,225,.35)',
        color: '#edf6fa', background: 'rgba(55,100,120,.32)', cursor: 'pointer',
      });
      return button;
    };
    const start = makeButton('Start attempt');
    const stop = makeButton('Stop + export');
    const replay = makeButton('Replay last');
    const compare = makeButton('Compare last two');
    const metrics = makeButton('Recognition metrics');
    metrics.style.gridColumn = '1 / -1';
    stop.disabled = true;
    buttons.append(start, stop, replay, compare, metrics);

    const presets = document.createElement('div');
    Object.assign(presets.style, { display: 'flex', gap: '5px', marginTop: '10px' });
    for (const preset of ['streamlined', 'classic', 'experienced'] as AssistPreset[]) {
      const button = makeButton(preset[0]!.toUpperCase() + preset.slice(1));
      button.style.flex = '1';
      button.title = `${preset} assist preset`;
      button.addEventListener('click', () => {
        this.uiActions.setPreset(preset);
        this.setStatus(`Preset: ${preset}`);
      });
      presets.appendChild(button);
    }

    const sensitivity = document.createElement('label');
    Object.assign(sensitivity.style, {
      display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 8px',
      alignItems: 'center', marginTop: '10px', color: 'rgba(220,235,240,.88)',
    });
    const sensitivityTitle = document.createElement('span');
    sensitivityTitle.textContent = 'Flick sensitivity';
    const sensitivityValue = document.createElement('output');
    const sensitivityRange = document.createElement('input');
    sensitivityRange.type = 'range';
    sensitivityRange.min = String(FLICK_SENSITIVITY_MIN);
    sensitivityRange.max = String(FLICK_SENSITIVITY_MAX);
    sensitivityRange.step = '0.05';
    sensitivityRange.value = String(uiActions.getSensitivity());
    sensitivityRange.setAttribute('aria-label', 'Flick sensitivity');
    sensitivityRange.style.gridColumn = '1 / -1';
    sensitivityRange.style.width = '100%';
    const showSensitivity = (value: number): void => {
      sensitivityValue.textContent = `${value.toFixed(2)}×`;
    };
    showSensitivity(Number(sensitivityRange.value));
    sensitivityRange.addEventListener('input', () => {
      const value = Number(sensitivityRange.value);
      this.uiActions.setSensitivity(value);
      showSensitivity(value);
      this.setStatus(`Flick sensitivity: ${value.toFixed(2)}×`);
    });
    sensitivity.append(sensitivityTitle, sensitivityValue, sensitivityRange);

    const calibrate = makeButton('Calibrate current two-finger line');
    calibrate.style.width = '100%';
    calibrate.style.marginTop = '7px';
    calibrate.addEventListener('click', () => {
      const calibrated = this.uiActions.calibrate();
      this.setStatus(calibrated
        ? 'Calibrated from the live two-finger line.'
        : 'Calibration needs two confident trackpad contacts.');
    });

    const status = document.createElement('div');
    Object.assign(status.style, { marginTop: '10px', minHeight: '34px', lineHeight: '1.4', color: 'rgba(220,235,240,.8)' });
    status.textContent = `Ready · preset ${uiActions.getPreset()}`;
    root.append(title, select, buttons, presets, sensitivity, calibrate, status);
    container.appendChild(root);
    this.#root = root;
    this.#status = status;
    this.#start = start;
    this.#stop = stop;
    this.#select = select;

    start.addEventListener('click', () => void this.#begin());
    stop.addEventListener('click', () => this.#finish());
    replay.addEventListener('click', () => void this.#replay());
    compare.addEventListener('click', () => this.#compare());
    metrics.addEventListener('click', () => this.#metrics());
    window.addEventListener('keydown', this.#onKeyDown);
  }

  #begin = async (): Promise<void> => {
    this.#start.disabled = true;
    try {
      await this.controller.start(this.#select.value as LabTrickLabel);
      this.#stop.disabled = false;
      this.setStatus(`Recording ${this.#select.value} · perform one attempt, then stop.`);
    } catch (error) {
      this.#start.disabled = false;
      this.setStatus(`Could not start: ${String(error)}`);
    }
  };

  #finish = (): void => {
    try {
      const result = this.controller.stopAndExport();
      this.setStatus(`${result.correct ? 'MATCH' : 'MISS'} · expected ${result.expected}, read ${result.recognized}${result.fallback ? ' (base fallback)' : ''} · ${result.exported ? 'exported' : 'export failed'}`);
    } catch (error) {
      this.setStatus(`Could not stop: ${String(error)}`);
    } finally {
      this.#start.disabled = false;
      this.#stop.disabled = true;
    }
  };

  #replay = async (): Promise<void> => {
    try {
      const checkpoints = await this.controller.replayLast();
      this.setStatus(`Replay matched ${checkpoints.length} deterministic checkpoints.`);
    } catch (error) {
      this.setStatus(`Replay failed: ${String(error)}`);
    }
  };

  #compare = (): void => {
    const result = this.controller.compareLastTwo();
    this.setStatus(result ? `Trace comparison: ${result.matches ? 'matching outcomes' : 'different outcomes'}.` : 'Capture two attempts before comparing.');
  };

  #metrics = (): void => {
    const entries = Object.entries(this.controller.confusionReport());
    this.setStatus(entries.length > 0
      ? `Recognition metrics · ${entries.map(([pair, count]) => `${pair}: ${count}`).join(' · ')}`
      : 'Recognition metrics are empty; capture an attempt first.');
  };

  setStatus(text: string): void { this.#status.textContent = text; }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'F8' || event.repeat) return;
    event.preventDefault();
    this.#root.style.display = this.#root.style.display === 'none' ? 'block' : 'none';
  };
}
