import MarkdownIt from "markdown-it";
import footnotePlugin from "markdown-it-footnote";
import taskListsPlugin from "markdown-it-task-lists";
import katex from "katex";
import mermaid from "mermaid";
import hljs from "highlight.js";
import DOMPurify from "dompurify";
import { readLocalAsset, openInBrowser } from "./api";
import { isDarkModeActive } from "./theme";

export interface HeadingItem {
  level: number;
  text: string;
  id: string;
}

let lastParsedHeadings: HeadingItem[] = [];

// Helper to escape HTML characters
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Slug generator for heading IDs
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "heading";
}

// Math protection before markdown-it parsing
interface MathToken {
  id: string;
  tex: string;
  display: boolean;
}

function protectMath(markdown: string): { source: string; tokens: MathToken[] } {
  const tokens: MathToken[] = [];
  // Split out fenced code blocks and inline code
  const parts = markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g);

  const processed = parts.map((part) => {
    // Check if it's a fenced code block with math/katex
    if (part.startsWith("```") || part.startsWith("~~~")) {
      const mathBlockMatch = part.match(/^(?:```|~~~)(?:math|katex)[^\S\r\n]*\r?\n([\s\S]*?)\r?\n?(?:```|~~~)$/i);
      if (mathBlockMatch) {
        const id = `@@MATH_BLOCK_${tokens.length}@@`;
        tokens.push({ id, tex: mathBlockMatch[1].trim(), display: true });
        return `\n\n${id}\n\n`;
      }
      return part;
    }

    // Leave standard inline code untouched
    if (part.startsWith("`")) {
      return part;
    }

    let text = part;

    // 1. Replace display math $$...$$
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      const id = `@@MATH_BLOCK_${tokens.length}@@`;
      tokens.push({ id, tex: tex.trim(), display: true });
      return `\n\n${id}\n\n`;
    });

    // 2. Replace display math \[...\]
    text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => {
      const id = `@@MATH_BLOCK_${tokens.length}@@`;
      tokens.push({ id, tex: tex.trim(), display: true });
      return `\n\n${id}\n\n`;
    });

    // 3. Replace standard LaTeX environments (\begin{align}...\end{align}, etc.)
    text = text.replace(/(\\begin\{([a-zA-Z*]+)\}[\s\S]+?\\end\{\2\})/g, (_, fullTex) => {
      const id = `@@MATH_BLOCK_${tokens.length}@@`;
      tokens.push({ id, tex: fullTex.trim(), display: true });
      return `\n\n${id}\n\n`;
    });

    // 4. Replace inline math \(...\)
    text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => {
      const id = `@@MATH_INLINE_${tokens.length}@@`;
      tokens.push({ id, tex: tex.trim(), display: false });
      return id;
    });

    // 5. Replace inline math $...$ (ensuring not double $$ or currency amounts like $10 and $20)
    text = text.replace(/(^|[^\w\\\$])\$([^\s\$](?:[^\\\$]*?(?:\\.[^\\\$]*?)*?[^\s\$]|))\$(?!\d)/g, (match, prefix, tex) => {
      if (!tex.trim() || /\n\s*\n/.test(tex)) return match;
      const id = `@@MATH_INLINE_${tokens.length}@@`;
      tokens.push({ id, tex: tex.trim(), display: false });
      return `${prefix}${id}`;
    });

    return text;
  });

  return { source: processed.join(""), tokens };
}

// Configure markdown-it instance
const md = new MarkdownIt({
  html: true,
  xhtmlOut: false,
  breaks: true,
  langPrefix: "language-",
  linkify: true,
  typographer: true,
  highlight(code: string, lang: string): string {
    const trimmedLang = lang.trim().toLowerCase();
    if (trimmedLang === "mermaid") {
      const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
      return `<div class="mermaid-diagram" data-id="${id}"><pre class="mermaid-source">${escapeHtml(code)}</pre></div>`;
    }

    if (trimmedLang === "math" || trimmedLang === "katex") {
      return `<div class="katex-display-wrapper">${renderTex(code.trim(), true)}</div>`;
    }

    if (trimmedLang && hljs.getLanguage(trimmedLang)) {
      try {
        const highlighted = hljs.highlight(code, { language: trimmedLang, ignoreIllegals: true }).value;
        return `<pre class="hljs"><button class="code-copy-btn" title="Copy code" aria-label="Copy code">Copy</button><code class="language-${trimmedLang}">${highlighted}</code></pre>`;
      } catch {
        // Fallback below
      }
    }

    return `<pre class="hljs"><button class="code-copy-btn" title="Copy code" aria-label="Copy code">Copy</button><code>${escapeHtml(code)}</code></pre>`;
  },
});

md.use(footnotePlugin);
md.use(taskListsPlugin, { enabled: true, label: true, labelAfter: false });

// Custom table renderer to ensure responsive container
const originalTableOpen = md.renderer.rules.table_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
const originalTableClose = md.renderer.rules.table_close || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
  return `<div class="table-wrapper">${originalTableOpen(tokens, idx, options, env, self)}`;
};

md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
  return `${originalTableClose(tokens, idx, options, env, self)}</div>`;
};

// Add heading anchor IDs and populate TOC headings
md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx];
  const nextToken = tokens[idx + 1];
  if (nextToken && nextToken.type === "inline") {
    const headingText = nextToken.content;
    const slug = slugify(headingText);
    token.attrSet("id", slug);
  }
  return self.renderToken(tokens, idx, options);
};

// Render TeX safely with KaTeX
function renderTex(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      errorColor: "#ef4444",
      output: "htmlAndMathml",
      strict: false,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "LaTeX render error";
    const tag = display ? "div" : "span";
    return `<${tag} class="katex-error" title="${escapeHtml(errorMsg)}">${escapeHtml(tex)}</${tag}>`;
  }
}

// Restore math tokens
function restoreMath(html: string, tokens: MathToken[]): string {
  let result = html;
  for (const token of tokens) {
    const rendered = renderTex(token.tex, token.display);
    const replacement = token.display
      ? `<div class="katex-display-wrapper">${rendered}</div>`
      : `<span class="katex-inline-wrapper">${rendered}</span>`;

    // Handle when markdown-it wraps placeholder in <p>
    if (token.display) {
      const pPattern = new RegExp(`<p>(?:\\s|<br\\s*\\/?>)*${token.id}(?:\\s|<br\\s*\\/?>)*<\\/p>`, "g");
      result = result.replace(pPattern, replacement);
    }
    result = result.replaceAll(token.id, replacement);
  }
  return result;
}

// Extract headings for Table of Contents
export function extractHeadings(markdown: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      // Strip inline markdown symbols for cleaner TOC text
      const rawText = match[2].trim()
        .replace(/[*_~`]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
      const id = slugify(rawText);
      headings.push({ level, text: rawText, id });
    }
  }

  lastParsedHeadings = headings;
  return headings;
}

export function getLastHeadings(): HeadingItem[] {
  return lastParsedHeadings;
}

// Configure Mermaid
let mermaidInitialized = false;
let currentMermaidDark: boolean | null = null;

function ensureMermaidInitialized(isDark: boolean): void {
  if (!mermaidInitialized || currentMermaidDark !== isDark) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: isDark ? "dark" : "neutral",
      themeVariables: isDark
        ? {
            darkMode: true,
            background: "#000000",
            primaryColor: "#27272a",
            primaryTextColor: "#f4f4f5",
            primaryBorderColor: "#3f3f46",
            lineColor: "#71717a",
            secondaryColor: "#18181b",
            tertiaryColor: "#09090b",
          }
        : {
            darkMode: false,
            background: "#ffffff",
            primaryColor: "#f4f4f5",
            primaryTextColor: "#18181b",
            primaryBorderColor: "#d4d4d8",
            lineColor: "#71717a",
            secondaryColor: "#f8fafc",
            tertiaryColor: "#ffffff",
          },
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    });
    mermaidInitialized = true;
    currentMermaidDark = isDark;
  }
}

// Render all Mermaid diagrams inside a container
export async function renderMermaidDiagrams(container: HTMLElement): Promise<void> {
  const isDark = isDarkModeActive();
  ensureMermaidInitialized(isDark);

  const diagramNodes = container.querySelectorAll<HTMLElement>(".mermaid-diagram");
  for (const node of diagramNodes) {
    const rawSource = node.querySelector(".mermaid-source")?.textContent?.trim() || "";
    if (!rawSource) continue;

    const diagramId = `mmd-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const { svg } = await mermaid.render(diagramId, rawSource);
      node.innerHTML = `<div class="mermaid-svg-wrapper">${svg}</div>`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Mermaid syntax error";
      node.innerHTML = `
        <div class="mermaid-fallback-box">
          <div class="mermaid-fallback-header">
            <span class="mermaid-fallback-title">Mermaid Diagram Fallback</span>
            <span class="mermaid-fallback-desc">${escapeHtml(errorMsg)}</span>
          </div>
          <pre class="mermaid-fallback-code">${escapeHtml(rawSource)}</pre>
        </div>
      `;
    }
  }
}

// Resolve local relative image paths to base64 Data URIs
export async function resolveLocalImages(container: HTMLElement, docDirectory: string | null): Promise<void> {
  const images = container.querySelectorAll<HTMLImageElement>("img");
  for (const img of images) {
    const src = img.getAttribute("src");
    if (!src) continue;

    // External URLs or existing data URIs are left as-is
    if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:") || src.startsWith("blob:")) {
      continue;
    }

    if (docDirectory) {
      try {
        const dataUri = await readLocalAsset(docDirectory, src);
        img.src = dataUri;
      } catch {
        // Create an unobtrusive missing image indicator
        const placeholder = document.createElement("span");
        placeholder.className = "broken-image-fallback";
        placeholder.textContent = `[Image not found: ${src}]`;
        img.replaceWith(placeholder);
      }
    } else {
      // No directory context (e.g. unsaved buffer)
      const placeholder = document.createElement("span");
      placeholder.className = "broken-image-fallback";
      placeholder.textContent = `[Local image relative to unsaved document: ${src}]`;
      img.replaceWith(placeholder);
    }
  }
}

// Setup link interceptors and copy button handlers
export function setupInteractiveBehaviors(container: HTMLElement): void {
  // External links open in default web browser; internal anchors smoothly scroll
  container.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLAnchorElement>("a");
    if (link) {
      const href = link.getAttribute("href");
      if (href) {
        if (href.startsWith("http://") || href.startsWith("https://")) {
          e.preventDefault();
          openInBrowser(href).catch((err) => console.error("Failed to open URL:", err));
        } else if (href.startsWith("#")) {
          e.preventDefault();
          const targetId = href.slice(1);
          const targetElement = container.querySelector(`[id="${CSS.escape(targetId)}"]`);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      }
    }

    // Code copy buttons
    const copyBtn = target.closest<HTMLButtonElement>(".code-copy-btn");
    if (copyBtn) {
      e.preventDefault();
      const codeBlock = copyBtn.parentElement?.querySelector("code");
      if (codeBlock) {
        navigator.clipboard.writeText(codeBlock.innerText).then(() => {
          const originalText = copyBtn.innerText;
          copyBtn.innerText = "Copied";
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.innerText = originalText;
            copyBtn.classList.remove("copied");
          }, 1800);
        }).catch((err) => {
          console.error("Clipboard copy failed:", err);
        });
      }
    }
  });
}

// Main render pipeline: Markdown -> Sanitized HTML -> Async enhancements
export async function renderDocument(
  markdown: string,
  container: HTMLElement,
  docDirectory: string | null
): Promise<HeadingItem[]> {
  // 1. Protect LaTeX math
  const { source: mathProtectedMd, tokens: mathTokens } = protectMath(markdown);

  // 2. Parse Markdown to HTML
  const rawHtml = md.render(mathProtectedMd);

  // 3. Restore LaTeX math
  const withMathHtml = restoreMath(rawHtml, mathTokens);

  // 4. Sanitize HTML with DOMPurify
  const cleanHtml = DOMPurify.sanitize(withMathHtml, {
    ADD_TAGS: [
      "style",
      // MathML tags
      "math", "semantics", "mrow", "mi", "mo", "mn", "msup", "msub", "mfrac", "mtable", "mtr", "mtd",
      "annotation", "mover", "munder", "munderover", "msubsup", "msqrt", "mroot", "mspace", "mtext",
      "mpadded", "mphantom", "menclose", "mfenced",
      // SVG elements used by KaTeX for roots, arrows, and wide delimiters
      "svg", "path", "circle", "rect", "line", "polyline", "polygon", "use", "defs", "g",
    ],
    ADD_ATTR: [
      "aria-hidden", "focusable", "data-id", "data-mermaid-id", "target", "class", "style", "id",
      "xmlns", "viewBox", "d", "fill", "stroke", "stroke-width", "preserveAspectRatio", "width", "height",
      "x", "y", "r", "cx", "cy", "transform",
    ],
    ALLOW_DATA_ATTR: true,
    FORCE_BODY: true,
  });

  // 5. Update DOM
  container.innerHTML = cleanHtml;

  // 6. Extract headings for TOC
  const headings = extractHeadings(markdown);

  // 7. Resolve local relative images
  await resolveLocalImages(container, docDirectory);

  // 8. Render Mermaid vector SVGs
  await renderMermaidDiagrams(container);

  return headings;
}
