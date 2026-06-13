import { GoogleGenerativeAI, SchemaType, FunctionDeclarationSchemaProperty } from "@google/generative-ai";
import { IBrain } from "./interface";
import { ICore, BrowserAction } from "../core/interface";
import * as fs from 'fs/promises';
import * as path from 'path';

interface HistoryEntry {
    call: {
        name: string;
        args: object;
    };
    response: unknown;
}

export class Brain implements IBrain {
    private genAI: GoogleGenerativeAI;
    private modelName: string = "gemini-1.5-flash";
    private debug: boolean = false;

    constructor(apiKey: string, debug: boolean = false) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.debug = debug;
    }

    setModel(modelName: string): void {
        this.modelName = modelName;
    }

    private async logDebug(filename: string, content: string) {
        if (!this.debug) return;
        const dir = path.join(process.cwd(), 'debug_logs');
        try {
            await fs.mkdir(dir, { recursive: true });
            // Thay đổi sang append để lưu vào cùng 1 file
            await fs.appendFile(path.join(dir, filename), content + "\n\n---SEPARATOR---\n\n");
        } catch (e) {
            console.error("Failed to write debug log:", e);
        }
    }

    async process(prompt: string, core: ICore): Promise<void> {
        console.log("Brain processing prompt:", prompt);
        const sessionId = Date.now().toString();
        const logFilename = `session_${sessionId}.log`;

        const model = this.genAI.getGenerativeModel({
            model: this.modelName,
            tools: [{
                functionDeclarations: core.getTools().map(tool => ({
                    name: tool.name,
                    description: tool.description,
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: tool.parameters.properties as { [k: string]: FunctionDeclarationSchemaProperty },
                        required: tool.parameters.required
                    }
                }))
            }]
        });

        const history: HistoryEntry[] = [];
        let running = true;
        let turn = 0;

        while (running && turn <= 20) {
            turn++;
            const state = await core.getCurrentState();
            const screenshotBase64 = state.screenshot.toString("base64");

            const historyText = history.slice(-20).map((h, i) =>
                `Lần ${i + 1}: Gọi ${h.call.name}(${JSON.stringify(h.call.args)}) -> Kết quả: ${JSON.stringify(h.response)}`
            ).join("\n");

            const promptText = `
                HƯỚNG DẪN:
                 - nếu nhiệm vụ đã hoàn thành thì phản hồi mà ko gọi tool để kết thúc vòng lặp này!
                 - các phản hồi khi đang trong vòng lặp vẫn có thể phản hồi text nhưng cần kèm function calling để giữ cho vòng lặp sống!
                 - đối với tham số selector cho các tool **nên** sử dụng **nguyên văn** phần selectors gắn sẵn trong SemanticUItree (runtime đã tính sẵn selector để unique nhất có thể cho element đó). nếu fail thì fallback sang selector tiếp theo!
                 - lịch sử các hành động cung cấp cho bạn 1 góc nhìn về quá trình thực hiện nhiệm vụ 1 cách liền mạch (bạn đóng vai như 1 statemachine)
                 - nếu trong lịch sử hành động phát hiện fail loop liên tục/vấn đề khó automate, hãy cầu cứu human để tránh đốt token vô ích!

                Nhiệm vụ: \`${prompt}\`.
                Lịch sử các hành động gần nhất của bạn (tối đa 20):
                \`\`\`log
                ${historyText || "Chưa có hành động nào."}
                \`\`\`

                Cấu trúc trang rút gọn (Simplified DOM/SemanticUItree):
                \`\`\`json
                ${state.semanticUiTree}
                \`\`\`
            `;

            if (this.debug) {
                await this.logDebug(logFilename, `[TURN ${turn} - PROMPT]\n${promptText}`);
            }

            process.stdout.write("\x1b[2mrequest sent to API...\x1b[0m\r");
            const startTime = Date.now();
            const result = await model.generateContent([
                { text: promptText },
                //{ inlineData: { mimeType: "image/png", data: screenshotBase64 } }
            ]);
            const duration = Date.now() - startTime;
            process.stdout.write(" ".repeat(40) + "\r");

            console.log(`\x1b[2mLLM response in ${duration}ms\x1b[0m`);

            if (this.debug) {
                await this.logDebug(logFilename, `[TURN ${turn} - RESPONSE]\n${JSON.stringify(result.response, null, 2)}`);
            }

            const calls = result.response.functionCalls();

            if (calls && calls.length > 0) {
                const call = calls[0];
                console.log(`\x1b[36m[ACTION]\x1b[0m \x1b[1m${call.name}\x1b[0m`, call.args);

                const action: BrowserAction = {
                    type: call.name as BrowserAction['type'],
                    ...(call.args as object)
                } as BrowserAction;

                const actionResult = await core.performAction(action);
                console.log(`\x1b[32m[RESULT]\x1b[0m`, actionResult);

                history.push({
                    call: { name: call.name, args: call.args as object },
                    response: actionResult
                });

                await new Promise(r => setTimeout(r, 2000));
            } else {
                const finalResponse = result.response.text();
                console.log(`\x1b[35m[FINAL]\x1b[0m ${finalResponse}`);
                if (this.debug) {
                    await this.logDebug(logFilename, `[FINAL RESPONSE]\n${finalResponse}`);
                }
                running = false;
            }
        }
    }
}

