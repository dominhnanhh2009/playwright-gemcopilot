import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import { Page } from 'playwright-core';

export const mouseMoveTool: ToolDefinition = {
    name: 'mouse.move',
    description: 'Di chuyển con trỏ chuột đến tọa độ (x, y) xác định. Lấy tọa độ từ AriaSnapshot.',
    parameters: {
        type: 'object',
        properties: {
            x: { type: 'number' },
            y: { type: 'number' }
        },
        required: ['x', 'y']
    }
};

export async function performMouseMove(page: Page, action: BrowserAction): Promise<ActionResult> {
    if (action.x === undefined || action.y === undefined) {
        return { success: false, message: "Thiếu tọa độ x hoặc y", errorType: 'missing_parameter' };
    }

    await page.mouse.move(action.x, action.y);
    return { success: true, message: `Con trỏ chuột đã di chuyển đến (${action.x}, ${action.y})` };
}

