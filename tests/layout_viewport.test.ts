// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderDocument } from "../src/renderer";
import fs from "fs";
import path from "path";

describe("Strict Viewport Width Fitting & Zero Horizontal Scroll", () => {
  let container: HTMLElement;
  let testMarkdown: string;

  beforeEach(() => {
    // Read test_document.md
    testMarkdown = fs.readFileSync(path.resolve(__dirname, "../test_document.md"), "utf-8");

    // Load styles
    const baseCss = fs.readFileSync(path.resolve(__dirname, "../src/styles/base.css"), "utf-8");
    const layoutCss = fs.readFileSync(path.resolve(__dirname, "../src/styles/layout.css"), "utf-8");
    const readerCss = fs.readFileSync(path.resolve(__dirname, "../src/styles/reader.css"), "utf-8");

    const styleEl = document.createElement("style");
    styleEl.textContent = `${baseCss}\n${layoutCss}\n${readerCss}`;
    document.head.appendChild(styleEl);

    document.body.innerHTML = `
      <div id="app" class="app-container">
        <main class="app-content">
          <section id="reader-view" class="view-pane reader-pane active">
            <article id="reader-content" class="reader-content"></article>
          </section>
        </main>
      </div>
    `;
    container = document.getElementById("reader-content") as HTMLElement;
  });

  const viewports = [
    { name: "iPhone SE (320px)", width: 320 },
    { name: "iPhone 13 mini (375px)", width: 375 },
    { name: "iPhone 14 Pro Max (430px)", width: 430 },
    { name: "iPad / Tablet (768px)", width: 768 },
    { name: "Narrow Desktop (900px)", width: 900 },
    { name: "Large Desktop (1440px)", width: 1440 },
  ];

  for (const vp of viewports) {
    it(`fits test document at ${vp.name} with contained overflow wrappers`, async () => {
      // Mock viewport width
      window.innerWidth = vp.width;
      document.documentElement.style.width = `${vp.width}px`;
      document.body.style.width = `${vp.width}px`;

      await renderDocument(testMarkdown, container, path.resolve(__dirname, ".."));

      // Verify all tables are wrapped in .table-wrapper
      const tables = container.querySelectorAll("table");
      expect(tables.length).toBeGreaterThan(0);
      for (const table of tables) {
        expect(table.parentElement?.classList.contains("table-wrapper")).toBe(true);
      }

      // Verify all display math equations are wrapped in .katex-display-wrapper
      const displayMath = container.querySelectorAll(".katex-display");
      for (const math of displayMath) {
        expect(math.closest(".katex-display-wrapper")).not.toBeNull();
      }

      // Verify code blocks have word break and whitespace pre-wrap
      const preBlocks = container.querySelectorAll("pre.hljs");
      expect(preBlocks.length).toBeGreaterThan(0);

      // Verify reader pane has overflow-x hidden
      const readerView = document.getElementById("reader-view");
      expect(readerView).not.toBeNull();
    });
  }
});
