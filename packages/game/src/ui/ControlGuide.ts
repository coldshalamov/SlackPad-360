import type { InputProfile, ObserveState } from '@slackpad/shared';

type Role = 'nose' | 'tail';

/** Small native-host stance mirror: makes the finger↔foot contract visible. */
export class ControlGuide {
  readonly #root: HTMLDivElement;
  readonly #index: HTMLDivElement;
  readonly #middle: HTMLDivElement;
  readonly #indexLabel: HTMLDivElement;
  readonly #middleLabel: HTMLDivElement;
  #profile: InputProfile;

  constructor(container: HTMLElement, profile: InputProfile) {
    this.#profile = profile;
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed',
      right: '14px',
      bottom: '14px',
      width: '280px',
      padding: '11px 13px 12px',
      border: '1px solid rgba(125,235,180,.28)',
      borderRadius: '11px',
      background: 'rgba(12,16,22,.78)',
      backdropFilter: 'blur(4px)',
      color: 'rgba(225,238,245,.96)',
      font: '11px system-ui, sans-serif',
      zIndex: '10',
      userSelect: 'none',
    });

    const close = document.createElement('button');
    close.textContent = '×';
    close.title = 'Hide stance guide';
    Object.assign(close.style, {
      position: 'absolute', right: '6px', top: '4px', border: '0', background: 'transparent',
      color: 'rgba(210,225,235,.65)', font: '16px system-ui', cursor: 'pointer', padding: '2px 5px',
    });
    close.addEventListener('click', () => root.remove());

    const title = document.createElement('div');
    title.textContent = 'TWO-FINGER STANCE  ·  SCREEN ↑';
    Object.assign(title.style, { fontWeight: '750', letterSpacing: '.04em', color: '#76e7aa', marginBottom: '7px' });

    const hand = document.createElement('div');
    Object.assign(hand.style, { display: 'flex', justifyContent: 'center', gap: '22px', margin: '2px 0 7px' });
    const makeFinger = (name: string): [HTMLDivElement, HTMLDivElement] => {
      const wrap = document.createElement('div');
      Object.assign(wrap.style, { display: 'grid', justifyItems: 'center', gap: '3px' });
      const finger = document.createElement('div');
      Object.assign(finger.style, {
        width: '35px', height: '50px', borderRadius: '18px 18px 12px 12px',
        border: '2px solid rgba(220,235,242,.45)', background: 'rgba(95,120,135,.24)',
        transition: 'background 80ms linear, border-color 80ms linear',
      });
      const label = document.createElement('div');
      label.textContent = name;
      Object.assign(label.style, { font: '700 9px system-ui', textAlign: 'center', lineHeight: '1.15' });
      wrap.append(finger, label);
      hand.append(wrap);
      return [finger, label];
    };
    [this.#index, this.#indexLabel] = makeFinger('INDEX');
    [this.#middle, this.#middleLabel] = makeFinger('MIDDLE');

    const copy = document.createElement('div');
    copy.innerHTML =
      '<b>Rotate the two-finger line</b> — set board heading; hold the angle to hold heading<br>' +
      '<b>Hold CTRL</b> — accelerate &nbsp;·&nbsp; release to brake<br>' +
      '<b>Lift + retap rear finger</b> — ollie &nbsp;·&nbsp; <b>front</b> — nollie<br>' +
      '<b>Swipe one finger after the pop</b> — Flick-It flip or shuv<br>' +
      '<b>V</b> — side-on / route camera';
    Object.assign(copy.style, { lineHeight: '1.48', color: 'rgba(215,228,236,.9)' });

    root.append(close, title, hand, copy);
    container.appendChild(root);
    this.#root = root;
    this.setProfile(profile);
  }

  setProfile(profile: InputProfile): void {
    this.#profile = profile;
    let indexRole: Role = profile.stance === 'regular' ? 'tail' : 'nose';
    if (profile.swapFeet) indexRole = indexRole === 'nose' ? 'tail' : 'nose';
    const middleRole: Role = indexRole === 'nose' ? 'tail' : 'nose';
    this.#indexLabel.textContent = `INDEX\n${indexRole === 'nose' ? 'FRONT' : 'REAR'}`;
    this.#middleLabel.textContent = `MIDDLE\n${middleRole === 'nose' ? 'FRONT' : 'REAR'}`;
    this.#indexLabel.style.whiteSpace = 'pre-line';
    this.#middleLabel.style.whiteSpace = 'pre-line';
  }

  update(obs: ObserveState): void {
    let indexRole: Role = this.#profile.stance === 'regular' ? 'tail' : 'nose';
    if (this.#profile.swapFeet) indexRole = indexRole === 'nose' ? 'tail' : 'nose';
    const set = (el: HTMLDivElement, role: Role): void => {
      const planted = obs.feet[role].planted;
      el.style.background = planted ? 'rgba(82,220,145,.5)' : 'rgba(95,120,135,.24)';
      el.style.borderColor = planted ? 'rgba(120,245,175,.95)' : 'rgba(220,235,242,.45)';
      el.style.transform = planted ? 'translateY(2px)' : 'none';
    };
    set(this.#index, indexRole);
    set(this.#middle, indexRole === 'nose' ? 'tail' : 'nose');
  }

  dispose(): void {
    this.#root.remove();
  }
}
