/**
 * HostInputSource — bridges the native WebView2 host to the game's InputHub.
 *
 * When the game runs inside the SlackPad native host (GameForm), the host streams
 * REAL trackpad ContactFrames as `contactBatch` envelopes over
 * `window.chrome.webview`. This class subscribes to those messages, validates the
 * envelope with the shared contract, and pushes each frame through the SAME
 * InputHub the DEV PAD uses — so hardware fingers drive the exact FootTracker →
 * BoardController → SimWorld pipeline that synthetic input does.
 *
 * In a plain browser `window.chrome?.webview` is absent, so `attach()` is a no-op
 * and every existing browser behavior is unchanged. This class NEVER touches
 * DebugHud or any sim/control/render module; the "TRACKPAD LIVE" chip is created
 * here directly.
 */

import type { ContactFrame } from "@slackpad/shared";
import { isHostToPageEnvelope } from "@slackpad/shared";
import type { InputHub } from "./InputHub";
import type { Telemetry } from "../telemetry/Telemetry";

/** The subset of the WebView2 host object the page uses. */
interface WebViewHostApi {
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  postMessage(message: unknown): void;
}

function getWebViewHost(): WebViewHostApi | null {
  if (typeof window === "undefined") return null;
  const host = (window as unknown as { chrome?: { webview?: WebViewHostApi } })
    .chrome?.webview;
  return host ?? null;
}

export class HostInputSource {
  private readonly host: WebViewHostApi | null;
  private attached = false;
  private chip: HTMLDivElement | null = null;

  constructor(
    private readonly inputHub: InputHub,
    private readonly telemetry: Telemetry,
    private readonly onFocusChanged?: (focused: boolean) => void,
  ) {
    this.host = getWebViewHost();
  }

  /** True when running inside the native WebView2 host (vs. a plain browser). */
  static isHostEnvironment(): boolean {
    return getWebViewHost() !== null;
  }

  /** True for this instance (captured at construction). */
  get active(): boolean {
    return this.host !== null;
  }

  /**
   * Subscribe to host messages, register the hardware source, announce readiness,
   * and show the live chip. No-op (returns false) outside the native host.
   */
  attach(): boolean {
    if (!this.host || this.attached) return false;
    this.attached = true;

    this.host.addEventListener("message", this.onMessage);
    this.inputHub.registerSource("hardware");
    this.mountChip();

    // Tell the host the page is ready to receive frames (host logs it; a future
    // build may gate streaming on it). Sent exactly once.
    try {
      this.host.postMessage({ v: 1, type: "ready", payload: {} });
    } catch {
      // Posting can throw only if the bridge tore down mid-attach; ignore.
    }

    this.telemetry.log({ type: "hostSourceAttached" });
    return true;
  }

  dispose(): void {
    if (this.host && this.attached) {
      this.host.removeEventListener("message", this.onMessage);
    }
    this.attached = false;
    this.chip?.remove();
    this.chip = null;
  }

  /** Ask the native host to close the game. Returns false in a plain browser. */
  quit(): boolean {
    if (!this.host) return false;
    try {
      this.host.postMessage({ v: 1, type: "quit", payload: {} });
      return true;
    } catch {
      return false;
    }
  }

  // Arrow fn so `this` is bound when used as an event listener.
  private onMessage = (event: { data: unknown }): void => {
    // e.data from PostWebMessageAsJson is an already-parsed object, not a string.
    const data = event.data;
    if (!isHostToPageEnvelope(data)) return;

    switch (data.type) {
      case "contactBatch": {
        // Frames already carry source:'hardware'; InputHub validates each and
        // rejects malformed ones without throwing (gt-malformed contract). Guard
        // the array itself so a malformed batch can never throw out of the
        // message handler and stall the hardware stream.
        if (!Array.isArray(data.frames)) return;
        for (const frame of data.frames as ContactFrame[]) {
          this.inputHub.push(frame);
        }
        return;
      }
      case "focus":
        this.onFocusChanged?.(data.payload.focused);
        this.setChipFocused(data.payload.focused);
        this.telemetry.log({
          type: "hostFocus",
          focused: data.payload.focused,
        });
        return;
      case "hostInfo":
        this.telemetry.log({ type: "hostInfo", payload: data.payload });
        return;
      case "settings":
        this.telemetry.log({ type: "hostSettings", payload: data.payload });
        return;
      default:
        return;
    }
  };

  // --- "TRACKPAD LIVE" chip (top-right, unobtrusive) -----------------------
  private mountChip(): void {
    if (typeof document === "undefined" || !document.body) return;
    const chip = document.createElement("div");
    chip.textContent = "● TRACKPAD LIVE";
    Object.assign(chip.style, {
      position: "fixed",
      top: "12px",
      right: "12px",
      padding: "4px 10px",
      borderRadius: "999px",
      font: "600 11px system-ui, sans-serif",
      letterSpacing: "0.04em",
      color: "rgba(120,235,160,0.98)",
      background: "rgba(12,20,16,0.62)",
      border: "1px solid rgba(120,235,160,0.35)",
      pointerEvents: "none",
      zIndex: "20",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(chip);
    this.chip = chip;
  }

  private setChipFocused(focused: boolean): void {
    if (!this.chip) return;
    this.chip.textContent = focused
      ? "● TRACKPAD LIVE"
      : "○ TRACKPAD (window inactive)";
    this.chip.style.opacity = focused ? "1" : "0.55";
  }
}
