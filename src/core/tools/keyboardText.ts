import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import { Page } from 'playwright-core';

export const keyboardTextTool: ToolDefinition = {
    name: 'keyboard.text',
    description: 'Nhập văn bản vào vị trí đang focus. Nếu chưa focus vào đúng ô input, hãy sử dụng mouse.click để chọn phần tử trước.',
    parameters: {
        type: 'object',
        properties: {
            text: { type: 'string' }
        },
        required: ['text']
    }
};

export async function performKeyboardText(page: Page, action: BrowserAction): Promise<ActionResult> {
    if (action.text === undefined) {
        return { success: false, message: "Thiếu văn bản để nhập", errorType: 'missing_parameter' };
    }

    await page.keyboard.insertText(action.text);
    return { success: true, message: `Đã nhập văn bản: ${action.text}` };
}

