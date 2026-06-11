import type { Page } from "playwright-core";
import { randomUUID } from "node:crypto";

export type MouseButton = "left" | "right" | "middle";

export type Point = {
  x: number;
  y: number;
};

export type AgentAction =
  // Mouse
  | {
      kind: "mouse.move";
      x: number;
      y: number;
    }
  | {
      kind: "mouse.click";
      x: number;
      y: number;
      button: MouseButton;
      clicks: number;
    }
  | {
      kind: "mouse.down";
      button: MouseButton;
    }
  | {
      kind: "mouse.up";
      button: MouseButton;
    }
  | {
      kind: "mouse.drag";
      from: Point;
      to: Point;
      button: MouseButton;
      steps: number;
    }

  // High-level scroll. Model nên dùng cái này thay vì mouse.wheel thô.
  | {
      kind: "scroll";
      x: number;
      y: number;
      deltaX: number;
      deltaY: number;
    }

  // Keyboard
  | {
      kind: "keyboard.text";
      text: string;
    }
  | {
      kind: "keyboard.key";
      key: string;
    }
  | {
      kind: "keyboard.shortcut";
      keys: string[];
    }
  | {
      kind: "keyboard.down";
      key: string;
    }
  | {
      kind: "keyboard.up";
      key: string;
    }

  // Safe high-level combos
  | {
      kind: "combo.clickText";
      x: number;
      y: number;
      text: string;
    }
  | {
      kind: "combo.replaceText";
      x: number;
      y: number;
      text: string;
      selectAllShortcut: "Control+A" | "Meta+A";
    };

export type ActionEnvelope = {
  observationId: string;
  action: unknown;
};

export type FocusInfo = {
  tag: string;
  role: string | null;
  ariaLabel: string | null;
  placeholder: string | null;
  name: string | null;
  id: string | null;
  editable: boolean;
  text: string;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
} | null;

export type Observation = {
  observationId: string;
  pageId: string;
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
  } | null;
  observedAt: number;
  focus: FocusInfo;
  snapshot: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

function assertExactKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  kind: string
): void {
  const actual = Object.keys(obj);

  const extra = actual.filter((k) => !allowed.includes(k));
  if (extra.length > 0) {
    fail(`${kind} has unknown field(s): ${extra.join(", ")}`);
  }

  const missing = allowed.filter((k) => !(k in obj));
  if (missing.length > 0) {
    fail(`${kind} missing required field(s): ${missing.join(", ")}`);
  }
}

function assertFiniteNumber(v: unknown, path: string): asserts v is number {
  if (!isFiniteNumber(v)) {
    fail(`${path} must be a finite number`);
  }
}

function assertNonEmptyString(v: unknown, path: string): asserts v is string {
  if (typeof v !== "string" || v.trim() === "") {
    fail(`${path} must be a non-empty string`);
  }
}

function assertString(v: unknown, path: string): asserts v is string {
  if (typeof v !== "string") {
    fail(`${path} must be a string`);
  }
}

function assertMouseButton(v: unknown, path: string): asserts v is MouseButton {
  if (v !== "left" && v !== "right" && v !== "middle") {
    fail(`${path} must be one of: left, right, middle`);
  }
}

function assertPoint(v: unknown, path: string): asserts v is Point {
  if (!isRecord(v)) {
    fail(`${path} must be an object { x, y }`);
  }

  assertExactKeys(v, ["x", "y"], path);
  assertFiniteNumber(v.x, `${path}.x`);
  assertFiniteNumber(v.y, `${path}.y`);
}

function assertViewportPoint(a: Record<string, unknown>, kind: string): void {
  assertFiniteNumber(a.x, `${kind}.x`);
  assertFiniteNumber(a.y, `${kind}.y`);
}

function assertShortcut(v: unknown, path: string): asserts v is string[] {
  if (!Array.isArray(v)) {
    fail(`${path} must be an array`);
  }

  if (v.length === 0) {
    fail(`${path} must be a non-empty array`);
  }

  for (let i = 0; i < v.length; i++) {
    assertNonEmptyString(v[i], `${path}[${i}]`);
  }
}

function assertSelectAllShortcut(
  v: unknown,
  path: string
): asserts v is "Control+A" | "Meta+A" {
  if (v !== "Control+A" && v !== "Meta+A") {
    fail(`${path} must be exactly "Control+A" or "Meta+A"`);
  }
}

export function validateAgentAction(input: unknown): AgentAction {
  if (!isRecord(input)) {
    fail("action must be an object");
  }

  const a = input;

  if (typeof a.kind !== "string") {
    fail("action.kind must be a string");
  }

  switch (a.kind) {
    case "mouse.move": {
      assertExactKeys(a, ["kind", "x", "y"], a.kind);
      assertViewportPoint(a, a.kind);
      return {
        kind: "mouse.move",
        x: a.x,
        y: a.y,
      };
    }

    case "mouse.click": {
      assertExactKeys(a, ["kind", "x", "y", "button", "clicks"], a.kind);
      assertViewportPoint(a, a.kind);
      assertMouseButton(a.button, "mouse.click.button");

      if (!isInteger(a.clicks) || a.clicks < 1 || a.clicks > 3) {
        fail("mouse.click.clicks must be integer 1..3");
      }

      return {
        kind: "mouse.click",
        x: a.x,
        y: a.y,
        button: a.button,
        clicks: a.clicks,
      };
    }

    case "mouse.down": {
      assertExactKeys(a, ["kind", "button"], a.kind);
      assertMouseButton(a.button, "mouse.down.button");

      return {
        kind: "mouse.down",
        button: a.button,
      };
    }

    case "mouse.up": {
      assertExactKeys(a, ["kind", "button"], a.kind);
      assertMouseButton(a.button, "mouse.up.button");

      return {
        kind: "mouse.up",
        button: a.button,
      };
    }

    case "mouse.drag": {
      assertExactKeys(a, ["kind", "from", "to", "button", "steps"], a.kind);
      assertPoint(a.from, "mouse.drag.from");
      assertPoint(a.to, "mouse.drag.to");
      assertMouseButton(a.button, "mouse.drag.button");

      if (!isInteger(a.steps) || a.steps < 1 || a.steps > 100) {
        fail("mouse.drag.steps must be integer 1..100");
      }

      return {
        kind: "mouse.drag",
        from: a.from,
        to: a.to,
        button: a.button,
        steps: a.steps,
      };
    }

    case "scroll": {
      assertExactKeys(a, ["kind", "x", "y", "deltaX", "deltaY"], a.kind);
      assertViewportPoint(a, a.kind);
      assertFiniteNumber(a.deltaX, "scroll.deltaX");
      assertFiniteNumber(a.deltaY, "scroll.deltaY");

      if (a.deltaX === 0 && a.deltaY === 0) {
        fail("scroll.deltaX and scroll.deltaY cannot both be 0");
      }

      return {
        kind: "scroll",
        x: a.x,
        y: a.y,
        deltaX: a.deltaX,
        deltaY: a.deltaY,
      };
    }

    case "keyboard.text": {
      assertExactKeys(a, ["kind", "text"], a.kind);
      assertString(a.text, "keyboard.text.text");

      return {
        kind: "keyboard.text",
        text: a.text,
      };
    }

    case "keyboard.key": {
      assertExactKeys(a, ["kind", "key"], a.kind);
      assertNonEmptyString(a.key, "keyboard.key.key");

      return {
        kind: "keyboard.key",
        key: a.key,
      };
    }

    case "keyboard.shortcut": {
      assertExactKeys(a, ["kind", "keys"], a.kind);
      assertShortcut(a.keys, "keyboard.shortcut.keys");

      return {
        kind: "keyboard.shortcut",
        keys: a.keys,
      };
    }

    case "keyboard.down": {
      assertExactKeys(a, ["kind", "key"], a.kind);
      assertNonEmptyString(a.key, "keyboard.down.key");

      return {
        kind: "keyboard.down",
        key: a.key,
      };
    }

    case "keyboard.up": {
      assertExactKeys(a, ["kind", "key"], a.kind);
      assertNonEmptyString(a.key, "keyboard.up.key");

      return {
        kind: "keyboard.up",
        key: a.key,
      };
    }

    case "combo.clickText": {
      assertExactKeys(a, ["kind", "x", "y", "text"], a.kind);
      assertViewportPoint(a, a.kind);
      assertString(a.text, "combo.clickText.text");

      return {
        kind: "combo.clickText",
        x: a.x,
        y: a.y,
        text: a.text,
      };
    }

    case "combo.replaceText": {
      assertExactKeys(
        a,
        ["kind", "x", "y", "text", "selectAllShortcut"],
        a.kind
      );
      assertViewportPoint(a, a.kind);
      assertString(a.text, "combo.replaceText.text");
      assertSelectAllShortcut(
        a.selectAllShortcut,
        "combo.replaceText.selectAllShortcut"
      );

      return {
        kind: "combo.replaceText",
        x: a.x,
        y: a.y,
        text: a.text,
        selectAllShortcut: a.selectAllShortcut,
      };
    }

    default:
      fail(`unknown action.kind: ${a.kind}`);
  }
}

export async function runAgentActionStrict(
  page: Page,
  rawAction: unknown
): Promise<void> {
  const action = validateAgentAction(rawAction);

  switch (action.kind) {
    case "mouse.move": {
      await page.mouse.move(action.x, action.y);
      return;
    }

    case "mouse.click": {
      await page.mouse.click(action.x, action.y, {
        button: action.button,
        clickCount: action.clicks,
      });
      return;
    }

    case "mouse.down": {
      await page.mouse.down({
        button: action.button,
      });
      return;
    }

    case "mouse.up": {
      await page.mouse.up({
        button: action.button,
      });
      return;
    }

    case "mouse.drag": {
      await page.mouse.move(action.from.x, action.from.y);
      await page.mouse.down({
        button: action.button,
      });
      await page.mouse.move(action.to.x, action.to.y, {
        steps: action.steps,
      });
      await page.mouse.up({
        button: action.button,
      });
      return;
    }

    case "scroll": {
      await page.mouse.move(action.x, action.y);
      await page.mouse.wheel(action.deltaX, action.deltaY);
      return;
    }

    case "keyboard.text": {
      await page.keyboard.insertText(action.text);
      return;
    }

    case "keyboard.key": {
      await page.keyboard.press(action.key);
      return;
    }

    case "keyboard.shortcut": {
      await page.keyboard.press(action.keys.join("+"));
      return;
    }

    case "keyboard.down": {
      await page.keyboard.down(action.key);
      return;
    }

    case "keyboard.up": {
      await page.keyboard.up(action.key);
      return;
    }

    case "combo.clickText": {
      await page.mouse.click(action.x, action.y);
      await page.keyboard.insertText(action.text);
      return;
    }

    case "combo.replaceText": {
      await page.mouse.click(action.x, action.y);
      await page.keyboard.press(action.selectAllShortcut);
      await page.keyboard.insertText(action.text);
      return;
    }
  }
}

export class PageSession {
  readonly pageId: string;

  private lastObservationId: string | null = null;

  constructor(readonly page: Page, pageId?: string) {
    this.pageId = pageId ?? randomUUID();
  }

  async observe(): Promise<Observation> {
    const observationId = randomUUID();

    const snapshotPromise = this.page.ariaSnapshot({
      mode: "ai",
      boxes: true,
    } as any) as Promise<string>;

    const focusPromise = this.page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;

      if (!el || el === document.body) {
        return null;
      }

      const rect = el.getBoundingClientRect();

      const input = el as HTMLInputElement | HTMLTextAreaElement;

      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role"),
        ariaLabel: el.getAttribute("aria-label"),
        placeholder: el.getAttribute("placeholder"),
        name: el.getAttribute("name"),
        id: el.id || null,
        editable:
          el.isContentEditable ||
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA",
        text:
          el.innerText?.slice(0, 300) ||
          input.value?.slice?.(0, 300) ||
          el.textContent?.slice(0, 300) ||
          "",
        box: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    });

    const [snapshot, title, viewport, focus] = await Promise.all([
      snapshotPromise,
      this.page.title(),
      Promise.resolve(this.page.viewportSize()),
      focusPromise,
    ]);

    this.lastObservationId = observationId;

    return {
      observationId,
      pageId: this.pageId,
      url: this.page.url(),
      title,
      viewport,
      observedAt: Date.now(),
      focus,
      snapshot,
    };
  }

  async act(envelope: ActionEnvelope): Promise<void> {
    if (!isRecord(envelope)) {
      fail("action envelope must be an object");
    }

    assertExactKeys(envelope, ["observationId", "action"], "ActionEnvelope");

    if (typeof envelope.observationId !== "string") {
      fail("ActionEnvelope.observationId must be a string");
    }

    if (!this.lastObservationId) {
      fail("no observation exists: call observe() before act()");
    }

    if (envelope.observationId !== this.lastObservationId) {
      fail("stale observation: observe again before acting");
    }

    await runAgentActionStrict(this.page, envelope.action);
  }

  getLastObservationId(): string | null {
    return this.lastObservationId;
  }
}