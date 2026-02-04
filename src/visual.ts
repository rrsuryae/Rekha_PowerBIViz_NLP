/*
JEGF
*/
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;

import { VisualFormattingSettingsModel } from "./settings";
import * as config from "../config.json";

export class Visual implements IVisual {
    private target: HTMLElement;
    private updateCount: number;
    private textNode: Text;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private dataView: powerbi.DataView;

    // Keep a stable root so update() doesn't wipe constructor content
    private root: HTMLDivElement;

    constructor(options: VisualConstructorOptions) {
        console.log("Visual constructor", options);

        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.updateCount = 0;

        // Stable root container for everything we render
        this.root = document.createElement("div");
        this.target.appendChild(this.root);

        // Optional: keep/update count line (won't be wiped)
        const new_p: HTMLElement = document.createElement("p");
        new_p.appendChild(document.createTextNode("Update count:"));
        const new_em: HTMLElement = document.createElement("em");
        this.textNode = document.createTextNode(this.updateCount.toString());
        new_em.appendChild(this.textNode);
        new_p.appendChild(new_em);
        this.root.appendChild(new_p);
    }

    public update(options: VisualUpdateOptions) {
        if (!options?.dataViews?.length) {
            // No data yet — keep UI but avoid crashes
            this.dataView = undefined as any;
        } else {
            this.dataView = options.dataViews[0];
        }

        console.log(this.dataView);

        // Update count display
        this.updateCount++;
        if (this.textNode) {
            this.textNode.textContent = this.updateCount.toString();
        }

        // Clear only the dynamic UI portion (keep update count line)
        // Child 0 is the update count paragraph; keep it.
        while (this.root.childNodes.length > 1) {
            this.root.removeChild(this.root.lastChild as ChildNode);
        }

        const container = document.createElement("div");

        const h1 = document.createElement("h1");
        h1.textContent = "🔍 NLP Analysis tool";

        const h3 = document.createElement("h3");
        h3.textContent = "Ask questions about data";

        const h6 = document.createElement("h6");
        h6.textContent = "Powered by OpenAI GPT API ⚡";

        const textarea = document.createElement("textarea");
        textarea.id = "gptQuestionInput";
        textarea.placeholder = "Ask a question about the data";

        const br = document.createElement("br");

        const button = document.createElement("button");
        button.id = "gptSubmitButton";
        button.textContent = "Submit";

        const responseDiv = document.createElement("div");
        responseDiv.id = "gptResponse";
        responseDiv.textContent = "🤖";

        const logoDiv = document.createElement("div");
        logoDiv.id = "UGXlogo";

        container.appendChild(h1);
        container.appendChild(h3);
        container.appendChild(h6);
        container.appendChild(textarea);
        container.appendChild(br);
        container.appendChild(button);
        container.appendChild(responseDiv);
        container.appendChild(logoDiv);

        this.root.appendChild(container);

        // Avoid adding multiple listeners if update() runs repeatedly:
        // Bind a fresh handler to this button instance only.
        button.addEventListener("click", async () => {
            const question = textarea.value?.trim() ?? "";
            if (!question) {
                responseDiv.textContent = "Please enter a question.";
                return;
            }

            responseDiv.textContent = "Thinking…";

            try {
                const response = await this.getGptResponse(question);
                // Safe: set as text (prevents HTML injection)
                responseDiv.textContent = response || "(No response)";
            } catch (e: any) {
                console.error(e);
                responseDiv.textContent = `Error: ${e?.message ?? "Failed to get response"}`;
            }
        });
    }

    /**
     * Returns properties pane formatting model content hierarchies, properties and latest formatting values, Then populate properties pane.
     * This method is called once every time we open properties pane or when the user edit any format property.
     */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    private async getGptResponse(question: string): Promise<string> {
        const apiKey = (config as any).OPENAI_API_KEY;
        const apiUrl = "https://api.openai.com/v1/chat/completions";
        const model = "gpt-4o-mini";

          const userContent =
            `Question: ${question}\n` +
            `Dataset:\n${this.formatDataForGpt()}\n\n` +
            `Answer briefly:`;

        console.log(userContent);

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: "You are a concise data analyst. Use only the dataset provided." },
                { role: "user", content: userContent }
              ],
              temperature: 0.2,
              max_tokens: 120
            })
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${txt}`);
        }

        const data = await response.json();
        console.log(data);

        return (data?.choices?.[0]?.message?.content ?? "").trim();
    }

    private formatDataForGpt(): string {
        if (!this.dataView?.categorical) {
            return "No data available";
        }

        const maxRows = 50;
        const categories = this.dataView.categorical.categories ?? [];
        const values = this.dataView.categorical.values ?? [];

        if (!categories.length && !values.length) {
            return "No categorical data available";
        }

        const categoryColumns = categories.map(c => c.source?.displayName ?? "Category");
        const valueColumns = values.map(v => v.source?.displayName ?? "Value");
        const columns = categoryColumns.concat(valueColumns);

        // Determine row count safely (use first available series)
        const firstSeriesLen =
            (categories[0]?.values?.length ?? 0) ||
            (values[0]?.values?.length ?? 0);

        const rowCount = Math.min(firstSeriesLen, maxRows);

        let formattedData = columns.join(", ") + "\n";

        // FIX: < rowCount (not <=)
        for (let i = 0; i < rowCount; i++) {
            const categoryRow = categories.map(c => c.values?.[i]);
            const valueRow = values.map(v => v.values?.[i]);
            const row = categoryRow.concat(valueRow);
            formattedData += row.join(", ") + "\n";
        }

        return formattedData;
    }
}
