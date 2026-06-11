import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import { Page } from 'playwright-core';

export const mouseDragTool: ToolDefinition = {
    name: 'mouse.drag',
    description: 'Kéo chuột từ điểm (from) đến điểm (to). Lấy tọa độ từ AriaSnapshot.',
    parameters: {
        type: 'object',
        properties: {
            from: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
            to: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
            button: { type: 'string', enum: ['left', 'right', 'middle'] },
            steps: { type: 'number' }
        },
        required: ['from', 'to']
    }
};

export async function performMouseDrag(page: Page, action: BrowserAction): Promise<ActionResult> {
    if (!action.from || !action.to) {
        return { success: false, message: "Thiếu tọa độ bắt đầu hoặc kết thúc", errorType: 'missing_parameter' };
    }

    await page.mouse.move(action.from.x, action.from.y);
    await page.mouse.down({ button: action.button || 'left' });
    await page.mouse.move(action.to.x, action.to.y, { steps: action.steps || 10 });
    await page.mouse.up({ button: action.button || 'left' });

    return { success: true, message: `Đã kéo chuột từ (${action.from.x}, ${action.from.y}) đến (${action.to.x}, ${action.to.y})` };
}

