/**
 * PauseMenu — a small DOM control surface for the canvas/WebGL game.
 *
 * Simulation remains owned by GameLoop + AgentHarness. This layer only gates
 * the loop and delegates restart/quit to the app boundary.
 */

export interface PauseActions {
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void | Promise<void>;
  onQuit: () => void;
}

/** Testable pause state machine used by the DOM menu and Escape binding. */
export class PauseController {
  #paused = false;

  constructor(private readonly actions: PauseActions) {}

  get isPaused(): boolean {
    return this.#paused;
  }

  /** Returns the resulting paused state. */
  toggle(): boolean {
    if (this.#paused) {
      this.resume();
      return false;
    }
    this.pause();
    return true;
  }

  pause(): boolean {
    if (this.#paused) return false;
    this.#paused = true;
    this.actions.onPause();
    return true;
  }

  resume(): boolean {
    if (!this.#paused) return false;
    this.#paused = false;
    this.actions.onResume();
    return true;
  }

  restart(): Promise<void> {
    return Promise.resolve(this.actions.onRestart());
  }

  quit(): void {
    this.actions.onQuit();
  }
}

export class PauseMenu {
  readonly #controller: PauseController;
  readonly #root: HTMLDivElement;
  readonly #restart: HTMLButtonElement;
  readonly #resume: HTMLButtonElement;
  readonly #quit: HTMLButtonElement;

  constructor(container: HTMLElement, actions: PauseActions) {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(5, 8, 12, 0.62)',
      backdropFilter: 'blur(4px)',
      zIndex: '30',
      pointerEvents: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);

    const panel = document.createElement('section');
    Object.assign(panel.style, {
      minWidth: '220px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      padding: '22px',
      borderRadius: '14px',
      color: 'rgba(237,244,250,0.98)',
      background: 'rgba(16, 22, 30, 0.96)',
      border: '1px solid rgba(145, 190, 215, 0.38)',
      boxShadow: '0 18px 60px rgba(0,0,0,0.5)',
      font: '600 14px system-ui, sans-serif',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('div');
    title.textContent = 'PAUSED';
    Object.assign(title.style, {
      marginBottom: '4px',
      fontSize: '20px',
      letterSpacing: '0.12em',
    } satisfies Partial<CSSStyleDeclaration>);

    const makeButton = (label: string): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, {
        minHeight: '38px',
        border: '1px solid rgba(153, 205, 230, 0.42)',
        borderRadius: '8px',
        color: 'inherit',
        background: 'rgba(81, 126, 152, 0.26)',
        font: 'inherit',
        cursor: 'pointer',
      } satisfies Partial<CSSStyleDeclaration>);
      return button;
    };

    const resume = makeButton('Resume  (Esc)');
    const restart = makeButton('Restart line');
    const quit = makeButton('Quit game');
    panel.append(title, resume, restart, quit);
    root.appendChild(panel);
    container.appendChild(root);

    this.#root = root;
    this.#resume = resume;
    this.#restart = restart;
    this.#quit = quit;
    this.#controller = new PauseController({
      onPause: () => {
        this.#root.style.display = 'flex';
        actions.onPause();
      },
      onResume: () => {
        this.#root.style.display = 'none';
        actions.onResume();
      },
      onRestart: actions.onRestart,
      onQuit: actions.onQuit,
    });

    resume.addEventListener('click', this.#onResume);
    restart.addEventListener('click', this.#onRestart);
    quit.addEventListener('click', this.#onQuit);
    window.addEventListener('keydown', this.#onKeyDown);
  }

  get isPaused(): boolean {
    return this.#controller.isPaused;
  }

  dispose(): void {
    this.#resume.removeEventListener('click', this.#onResume);
    this.#restart.removeEventListener('click', this.#onRestart);
    this.#quit.removeEventListener('click', this.#onQuit);
    window.removeEventListener('keydown', this.#onKeyDown);
    this.#root.remove();
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.repeat) return;
    event.preventDefault();
    this.#controller.toggle();
  };

  readonly #onResume = (): void => {
    this.#controller.resume();
  };

  readonly #onRestart = async (): Promise<void> => {
    this.#restart.disabled = true;
    try {
      await this.#controller.restart();
      this.#controller.resume();
    } catch (error) {
      console.error('[slackpad] restart failed', error);
    } finally {
      this.#restart.disabled = false;
    }
  };

  readonly #onQuit = (): void => {
    this.#controller.quit();
  };
}
