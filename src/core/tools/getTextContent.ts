import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import { Page } from 'playwright-core';

export const getTextContentTool: ToolDefinition = {
    name: 'getTextContent',
    description: 'Lấy nội dung văn bản của một phần tử dựa trên selector và giới hạn số ký tự',
    parameters: {
        type: 'object',
        properties: {
            selector: { type: 'string' },
            max_characters: { type: 'number', description: 'Số ký tự tối đa muốn lấy' }
        },
        required: ['selector', 'max_characters']
    }
};

export async function performGetTextContent(page: Page, action: BrowserAction): Promise<ActionResult> {
    const { selector, max_characters } = action;

    if (!selector) {
        return { success: false, message: "Thiếu selector", errorType: 'selector_not_found' };
    }

    try {
        const locator = page.locator(selector);
        const count = await locator.count();

        if (count === 0) {
            return {
                success: false,
                message: `Không tìm thấy phần tử nào với selector: ${selector}`,
                errorType: 'element_not_found'
            };
        }

        let text = await locator.first().innerText();
        
        if (max_characters !== undefined && text.length > max_characters) {
            text = text.substring(0, max_characters) + "...";
        }

        return { 
            success: true, 
            message: `Nội dung văn bản: ${text}` 
        };
    } catch (e: unknown) {
        const error = e instanceof Error ? e.message : String(e);
        return {
            success: false,
            message: `Không thể lấy nội dung từ ${selector}: ${error}`,
            errorType: 'error'
        };
    }
}
