import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import { Page } from 'playwright-core';

export const mouseClickTool: ToolDefinition = {
    name: 'mouse.click',
    description: 'Thực hiện thao tác nhấp chuột tại tọa độ xác định. Lấy tọa độ (x, y) từ thông tin chi tiết của phần tử trong AriaSnapshot.',
    parameters: {
        type: 'object',
        properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            button: { type: 'string', enum: ['left', 'right', 'middle'] },
            clicks: { type: 'number' }
        },
        required: ['x', 'y']
    }
};

export async function performMouseClick(page: Page, action: BrowserAction): Promise<ActionResult> {
    if (action.x === undefined || action.y === undefined) {
        return { success: false, message: "Thiếu tọa độ x hoặc y", errorType: 'missing_parameter' };
    }

    await page.mouse.click(action.x, action.y, {
        button: action.button || 'left',
        clickCount: action.clicks || 1
    });

    return { success: true, message: `Đã click ${action.button || 'left'} tại (${action.x}, ${action.y})` };
}

