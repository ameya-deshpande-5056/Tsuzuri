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

interface MarkdownSegment {
  type: "code" | "html_comment" | "text";
  info?: string;
  text: string;
}

// Helper to accurately segment Markdown into code fences, HTML comments, and standard text blocks
function splitMarkdownBlocks(markdown: string): MarkdownSegment[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const segments: MarkdownSegment[] = [];
  let currentSegment: string[] = [];
  let inCodeFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let fenceInfo = "";
  let inHtmlComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inCodeFence) {
      currentSegment.push(line);
      const closeMatch = line.match(/^[ ]{0,3}(`{3,}|~{3,})[ ]*$/);
      if (closeMatch && closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLength) {
        segments.push({ type: "code", info: fenceInfo, text: currentSegment.join("\n") });
        currentSegment = [];
        inCodeFence = false;
      }
      continue;
    }

    if (inHtmlComment) {
      currentSegment.push(line);
      if (line.includes("-->")) {
        segments.push({ type: "html_comment", text: currentSegment.join("\n") });
        currentSegment = [];
        inHtmlComment = false;
      }
      continue;
    }

    // HTML comment opening on its own line (CommonMark HTML Block Type 2)
    if (/^[ ]{0,3}<!--/.test(line)) {
      if (currentSegment.length > 0) {
        segments.push({ type: "text", text: currentSegment.join("\n") });
        currentSegment = [];
      }
      currentSegment.push(line);
      if (!line.includes("-->")) {
        inHtmlComment = true;
      } else {
        segments.push({ type: "html_comment", text: currentSegment.join("\n") });
        currentSegment = [];
      }
      continue;
    }

    // Fenced code block opening (CommonMark Section 4.5)
    const openMatch = line.match(/^[ ]{0,3}(`{3,}|~{3,})[ \t]*(.*)$/);
    if (openMatch) {
      const char = openMatch[1][0];
      const info = openMatch[2].trim();
      // Backtick fences cannot have backticks in their info string
      if (char === "~" || !info.includes("`")) {
        if (currentSegment.length > 0) {
          segments.push({ type: "text", text: currentSegment.join("\n") });
          currentSegment = [];
        }
        fenceChar = char;
        fenceLength = openMatch[1].length;
        fenceInfo = info;
        inCodeFence = true;
        currentSegment.push(line);
        continue;
      }
    }

    currentSegment.push(line);
  }

  if (currentSegment.length > 0) {
    segments.push({
      type: inCodeFence ? "code" : (inHtmlComment ? "html_comment" : "text"),
      info: fenceInfo,
      text: currentSegment.join("\n"),
    });
  }

  return segments;
}

function protectMath(markdown: string): { source: string; tokens: MathToken[] } {
  const tokens: MathToken[] = [];
  const segments = splitMarkdownBlocks(markdown);

  const processed = segments.map((seg) => {
    // 1. Fenced code blocks
    if (seg.type === "code") {
      const lowerInfo = (seg.info || "").toLowerCase();
      if (lowerInfo === "math" || lowerInfo === "katex") {
        const lines = seg.text.split("\n");
        const inner = lines.slice(1, -1).join("\n").trim();
        const id = `@@MATH_BLOCK_${tokens.length}@@`;
        tokens.push({ id, tex: inner, display: true });
        return `\n\n${id}\n\n`;
      }
      return seg.text;
    }

    // 2. HTML comments: preserve untouched
    if (seg.type === "html_comment") {
      return seg.text;
    }

    // 3. Regular text: isolate inline code spans so math is never matched inside `...`
    const inlineParts = seg.text.split(/(`+[^`\r\n]+?`+)/g);
    const handledParts = inlineParts.map((part) => {
      if (part.startsWith("`")) return part;

      let t = part;

      // 3.1. Display math $$...$$
      t = t.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
        const id = `@@MATH_BLOCK_${tokens.length}@@`;
        tokens.push({ id, tex: tex.trim(), display: true });
        return `\n\n${id}\n\n`;
      });

      // 3.2. Display math \[...\] (ensuring not preceded by backslash, e.g. \\[6pt])
      t = t.replace(/(^|[^\\])\\\[([\s\S]+?)\\\]/g, (_, prefix, tex) => {
        const id = `@@MATH_BLOCK_${tokens.length}@@`;
        tokens.push({ id, tex: tex.trim(), display: true });
        return `${prefix}\n\n${id}\n\n`;
      });

      // 3.3. LaTeX environments (\begin{align}...\end{align}, \begin{gathered}...\end{gathered}, etc.)
      t = t.replace(
        /(^|[^\\])(\\begin\{(?:equation\*?|align\*?|gather\*?|gathered|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|split|aligned)\}[\s\S]+?\\end\{[a-zA-Z*]+\})/g,
        (_, prefix, fullTex) => {
          const id = `@@MATH_BLOCK_${tokens.length}@@`;
          tokens.push({ id, tex: fullTex.trim(), display: true });
          return `${prefix}\n\n${id}\n\n`;
        }
      );

      // 3.4. Inline math \(...\)
      t = t.replace(/(^|[^\\])\\\(([\s\S]+?)\\\)/g, (_, prefix, tex) => {
        const id = `@@MATH_INLINE_${tokens.length}@@`;
        tokens.push({ id, tex: tex.trim(), display: false });
        return `${prefix}${id}`;
      });

      // 3.5. Inline math $...$
      t = t.replace(
        /(^|[^\w\\\$])\$([^\s\$](?:[^\\\$]*?(?:\\.[^\\\$]*?)*?[^\s\$\\]|))\$(?!\d)/g,
        (match, prefix, tex) => {
          if (!tex.trim() || /\n\s*\n/.test(tex)) return match;
          const id = `@@MATH_INLINE_${tokens.length}@@`;
          tokens.push({ id, tex: tex.trim(), display: false });
          return `${prefix}${id}`;
        }
      );

      return t;
    });

    return handledParts.join("");
  });

  return { source: processed.join("\n"), tokens };
}

function normalizeCodeLang(language: string): string {
  const raw = String(language || "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    cplusplus: "cpp",
    cxx: "cpp",
    "c++": "cpp",
    csharp: "cs",
    "c#": "cs",
    golang: "go",
    javascript: "js",
    node: "js",
    nodejs: "js",
    typescript: "ts",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "bash",
    zsh: "bash",
    shell: "bash",
    docker: "dockerfile",
    gql: "graphql",
    yml: "yaml",
  };
  if (aliases[raw]) return aliases[raw];
  const cleaned = raw.replace(/[^\w-]/g, "");
  return aliases[cleaned] || cleaned;
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

    const normLang = normalizeCodeLang(trimmedLang);
    const resolvedLang = hljs.getLanguage(normLang) ? normLang : (hljs.getLanguage(trimmedLang) ? trimmedLang : "");

    if (resolvedLang) {
      try {
        const highlighted = hljs.highlight(code, { language: resolvedLang, ignoreIllegals: true }).value;
        return `<pre class="hljs"><button class="code-copy-btn" title="Copy code" aria-label="Copy code">Copy</button><code class="language-${resolvedLang}">${highlighted}</code></pre>`;
      } catch {
        // Fallback below
      }
    }

    return `<pre class="hljs"><button class="code-copy-btn" title="Copy code" aria-label="Copy code">Copy</button><code>${escapeHtml(code)}</code></pre>`;
  },
});

md.use(footnotePlugin);
md.use(taskListsPlugin, { enabled: true, label: true, labelAfter: false });

// Custom fence renderer to ensure mermaid and math blocks render directly as top-level containers
// without being incorrectly wrapped in <pre><code class="language-...">
const defaultFenceRenderer =
  md.renderer.rules.fence ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = token.info ? token.info.trim() : "";
  const lang = info.split(/\s+/)[0].toLowerCase();

  if (lang === "mermaid") {
    const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
    return `<div class="mermaid-diagram" data-id="${id}"><pre class="mermaid-source">${escapeHtml(token.content)}</pre></div>\n`;
  }

  if (lang === "math" || lang === "katex") {
    return `<div class="katex-display-wrapper">${renderTex(token.content.trim(), true)}</div>\n`;
  }

  return defaultFenceRenderer(tokens, idx, options, env, self);
};

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

// In-memory cache for rendered KaTeX HTML strings
const katexCache = new Map<string, string>();

// Render TeX safely with KaTeX
function renderTex(tex: string, display: boolean): string {
  const cacheKey = `${display ? "D" : "I"}:${tex}`;
  const cached = katexCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const rendered = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      errorColor: "#ef4444",
      output: "html",
      strict: false,
    });
    katexCache.set(cacheKey, rendered);
    return rendered;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "LaTeX render error";
    const tag = display ? "div" : "span";
    return `<${tag} class="katex-error" title="${escapeHtml(errorMsg)}">${escapeHtml(tex)}</${tag}>`;
  }
}

// Restore math tokens
function restoreMath(html: string, tokens: MathToken[]): string {
  if (!tokens.length) return html;

  const tokenMap = new Map<string, { replacement: string; display: boolean }>();
  for (const token of tokens) {
    const rendered = renderTex(token.tex, token.display);
    const replacement = token.display
      ? `<div class="katex-display-wrapper">${rendered}</div>`
      : `<span class="katex-inline-wrapper">${rendered}</span>`;
    tokenMap.set(token.id, { replacement, display: token.display });
  }

  // 1. Replace standalone paragraph-wrapped display math blocks
  let result = html.replace(
    /<p>(?:\s|<br\s*\/?>)*(@@MATH_BLOCK_\d+@@)(?:\s|<br\s*\/?>)*<\/p>/g,
    (_, id) => tokenMap.get(id)?.replacement || id
  );

  // 2. Replace any remaining math token IDs (inline math or inline-display math)
  result = result.replace(
    /@@MATH_(?:BLOCK|INLINE)_\d+@@/g,
    (id) => tokenMap.get(id)?.replacement || id
  );

  return result;
}

// Extract headings for Table of Contents
export function extractHeadings(markdown: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```") || line.trim().startsWith("~~~")) {
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

// Generate in-document Table of Contents HTML for [[toc]] or [toc]
export function buildEmbeddedToc(markdown: string): string {
  const headings = extractHeadings(markdown).filter(
    (h) => !h.text.toLowerCase().includes("[[toc]]") && !h.text.toLowerCase().includes("[toc]")
  );
  if (!headings.length) return "";
  const items = headings.map(
    (h) => `<li class="toc-item-level-${h.level}" style="margin-left: ${(h.level - 1) * 1}rem;"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`
  ).join("");
  return `<nav class="document-toc" aria-label="Table of Contents"><div class="document-toc-title">Table of Contents</div><ol class="document-toc-list">${items}</ol></nav>`;
}

export function getLastHeadings(): HeadingItem[] {
  return lastParsedHeadings;
}

// Configure Mermaid
let mermaidInitialized = false;
let currentMermaidDark: boolean | null = null;

export function clearMermaidCache(): void {
  mermaidSvgCache.clear();
  mermaidInitialized = false;
  currentMermaidDark = null;
}

function ensureMermaidInitialized(isDark: boolean): void {
  if (!mermaidInitialized || currentMermaidDark !== isDark) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      themeVariables: isDark
        ? {
            darkMode: true,
            background: "transparent",
            primaryColor: "#1f2937",
            primaryTextColor: "#f4f4f5",
            primaryBorderColor: "#5b6472",
            lineColor: "#a1a1aa",
            secondaryColor: "#0f172a",
            tertiaryColor: "#111827",
            clusterBkg: "transparent",
            clusterBorder: "#3f3f46",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }
        : {
            darkMode: false,
            background: "transparent",
            primaryColor: "#f4f4f5",
            primaryTextColor: "#18181b",
            primaryBorderColor: "#d4d4d8",
            lineColor: "#52525b",
            secondaryColor: "#eef2ff",
            tertiaryColor: "#ffffff",
            clusterBkg: "transparent",
            clusterBorder: "#d4d4d8",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          },
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
      },
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      themeCSS: `
        svg { background: transparent; }
        .node rect, .node circle, .node ellipse, .node polygon, .node path { stroke-width: 1.5px; }
        .edgePath .path { stroke-width: 1.5px; }
      `,
    });
    mermaidInitialized = true;
    currentMermaidDark = isDark;
  }
}

// In-memory cache for rendered Mermaid SVGs: key = `${theme}:${rawSource}` -> SVG markup
const mermaidSvgCache = new Map<string, string>();

// Render all Mermaid diagrams inside a container with caching and non-blocking event loop yielding
export async function renderMermaidDiagrams(container: HTMLElement, forceAll: boolean = false): Promise<void> {
  const isDark = isDarkModeActive();
  ensureMermaidInitialized(isDark);

  const diagramNodes = container.querySelectorAll<HTMLElement>(".mermaid-diagram");
  if (!diagramNodes.length) return;

  for (const node of diagramNodes) {
    if (node.dataset.rendered === "true" && !forceAll) continue;

    const rawSource = node.querySelector(".mermaid-source")?.textContent?.trim() || node.dataset.rawSource || "";
    if (!rawSource) continue;
    node.dataset.rawSource = rawSource;

    const cacheKey = `${isDark ? "dark" : "light"}:${rawSource}`;
    const cached = mermaidSvgCache.get(cacheKey);
    if (cached) {
      node.innerHTML = `<div class="mermaid-svg-wrapper">${cached}</div>`;
      node.dataset.rendered = "true";
      continue;
    }

    const diagramId = `mmd-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const { svg } = await mermaid.render(diagramId, rawSource);
      mermaidSvgCache.set(cacheKey, svg);
      node.innerHTML = `<div class="mermaid-svg-wrapper">${svg}</div>`;
      node.dataset.rendered = "true";
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
      node.dataset.rendered = "true";
    }

    if (diagramNodes.length > 3) {
      await new Promise((resolve) => setTimeout(resolve, 0));
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
  // 0. Normalize explicit page-break directives (\pagebreak, \newpage, <!-- pagebreak -->)
  const normalizedMd = markdown.replace(
    /(?:^|\n)[ \t]*(?:\\(?:pagebreak|newpage)|<!--[ \t]*page-?break[ \t]*-->)[ \t]*(?:\r?\n|$)/gi,
    "\n\n<div class=\"page-break\"></div>\n\n"
  );

  // 0.5. Expand embedded Table of Contents ([[toc]] or [toc])
  const withToc = normalizedMd.replace(/\[\[toc\]\]|\[toc\]/gi, () => buildEmbeddedToc(normalizedMd));

  // 1. Protect LaTeX math
  const { source: mathProtectedMd, tokens: mathTokens } = protectMath(withToc);

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
