import { Browser, BrowserContext, Page, chromium } from 'playwright-core';
import { chromium as chromiumExtra } from 'playwright-extra';
// @ts-ignore
import stealth from 'puppeteer-extra-plugin-stealth';

import {
    ICore,
    BrowserConfig,
    BrowserAction,
    BrowserState,
    ToolDefinition,
    ActionResult
} from './interface';

import { navigateTool, performNavigate } from './tools/navigate';
import {
    askForHumanConfirmationTool,
    performAskForHumanConfirmation
} from './tools/askForHumanConfirmation';

import { mouseClickTool, performMouseClick } from './tools/mouseClick';
import { mouseMoveTool, performMouseMove } from './tools/mouseMove';
import { mouseDragTool, performMouseDrag } from './tools/mouseDrag';
import { keyboardTextTool, performKeyboardText } from './tools/keyboardText';
import { keyboardShortcutTool, performKeyboardShortcut } from './tools/keyboardShortcut';

import { makeSemanticUiTree } from './semantic-ui-tree.js';

// Tạm thời áp dụng plugin stealth
// @ts-ignore
chromiumExtra.use(stealth());

export class Core implements ICore {
    private browser: Browser | undefined;
    private context: BrowserContext | undefined;
    private page: Page | undefined;

    async launch(config: BrowserConfig): Promise<void> {
        if (config.userDataDir) {
            // Dùng launchPersistentContext để load profile có sẵn.
            // @ts-ignore
            this.context = await chromiumExtra.launchPersistentContext(config.userDataDir, {
                headless: config.headless,
                channel: config.channel,
                args: [
                    '--disable-blink-features=AutomationControlled',
                ],
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            this.browser = this.context.browser() || undefined;
            this.page = this.context.pages()[0] || await this.context.newPage();
        } else {
            // @ts-ignore
            this.browser = await chromiumExtra.launch({
                headless: config.headless,
                executablePath: config.executablePath,
                channel: config.channel,
                args: [
                    '--disable-blink-features=AutomationControlled',
                ]
            });

            this.context = await this.browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            this.page = await this.context.newPage();
        }

        if (!this.page) throw new Error("Failed to initialize page");

        // Đảm bảo User-Agent không bị lộ là headless.
        await this.page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
    }

    async close(): Promise<void> {
        if (this.context) {
            await this.context.close();
            return;
        }

        if (this.browser) {
            await this.browser.close();
        }
    }

    async performAction(action: BrowserAction): Promise<ActionResult> {
        if (!this.page) return { success: false, message: "Page not initialized", errorType: 'error' };

        try {
            const actionType = action.type;

            switch (actionType) {
                case 'navigate':
                    return await performNavigate(this.page, action);

                case 'askForHumanConfirmation':
                    return await performAskForHumanConfirmation(action);

                // New Actions
                case 'mouse.click':
                    return await performMouseClick(this.page, action);
                case 'mouse.move':
                    return await performMouseMove(this.page, action);
                case 'mouse.drag':
                    return await performMouseDrag(this.page, action);
                case 'keyboard.text':
                    return await performKeyboardText(this.page, action);
                case 'keyboard.shortcut':
                    return await performKeyboardShortcut(this.page, action);
                default:
                    return {
                        success: false,
                        message: `Hành động không xác định: ${actionType}`,
                        errorType: 'unknown'
                    };
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `Lỗi hệ thống khi thực thi hành động ${action.type}: ${message}`,
                errorType: 'unknown'
            };
        }
    }

    async getCurrentState(): Promise<BrowserState> {
        if (!this.page) throw new Error("Page not initialized");
        const page = this.page;

        const ariaSnapshot = await page.ariaSnapshot({
            mode: "ai",
            boxes: true,
            // @ts-ignore
            depth: 6,
        });
        return {
            url: page.url(),
            title: await page.title(),
            screenshot: await page.screenshot(),
            ariaSnapshot: ariaSnapshot,
        };
    }

    getTools(): ToolDefinition[] {
        return [
            navigateTool,
            askForHumanConfirmationTool,
            mouseClickTool,
            mouseMoveTool,
            mouseDragTool,
            keyboardTextTool,
            keyboardShortcutTool,
        ];
    }
}

