import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import { Page } from 'playwright-core';

export const keyboardShortcutTool: ToolDefinition = {
    name: 'keyboard.shortcut',
    description: 'Nhấn một tổ hợp phím tắt (VD: Control+C, Enter, Escape).',
    parameters: {
        type: 'object',
        properties: {
            keys: { type: 'array', items: { type: 'string' } }
        },
        required: ['keys']
    }
};

export async function performKeyboardShortcut(page: Page, action: BrowserAction): Promise<ActionResult> {
    if (!action.keys || action.keys.length === 0) {
        return { success: false, message: "Thiếu tổ hợp phím", errorType: 'missing_parameter' };
    }

    await page.keyboard.press(action.keys.join('+'));
    return { success: true, message: `Đã nhấn tổ hợp phím: ${action.keys.join('+')}` };
}

