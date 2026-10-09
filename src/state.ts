export type ViewMode = "reader" | "editor";
export type ThemeMode = "system" | "light" | "dark";

export interface DocumentState {
  path: string | null;
  fileName: string;
  directory: string | null;
  content: string;
  savedSnapshot: string;
  isDirty: boolean;
}

export interface AppState {
  doc: DocumentState;
  activeView: ViewMode;
  themeMode: ThemeMode;
  tocOpen: boolean;
  findOpen: boolean;
  findQuery: string;
  replaceQuery: string;
}

const DEFAULT_MARKDOWN = `# Tsuzuri (綴り)

A quiet, lightweight, and offline Markdown document reader and editor.

## Welcome

Tsuzuri is designed as a **reader-first** document utility. When reading, all visual noise recedes so you can focus entirely on the text, mathematics, diagrams, and code.

- **Editor ↔ Reader**: Press \`Ctrl+E\` (or \`Cmd+E\` on macOS) to switch between the raw editor and the typeset reader.
- **Zoom In / Out**: Press \`Ctrl+=\` / \`Ctrl+-\` (or \`Ctrl+Scroll\`) to scale the entire interface, \`Ctrl+0\` to reset.
- **Open file**: Press \`Ctrl+O\`
- **Save document**: Press \`Ctrl+S\`
- **Search & Replace**: Press \`Ctrl+F\` or \`Ctrl+H\`

---

## Typography & Hierarchy

### Third Level Heading
Regular paragraph text with **bold**, *italic*, ~~strikethrough~~, \`inline code\`, and [hyperlinks](https://github.com/ameya-deshpande-5056/md-latex-mermaid2pdf).

> "Simplicity is the prerequisite for reliability."
> — Edsger W. Dijkstra

Nested task lists:
- [x] Completely offline operation
- [x] Responsive layout with strict viewport width fitting
- [x] AMOLED dark mode
- [ ] Explore technical documents

Footnote reference test.[^tsuzuri-note]

[^tsuzuri-note]: Tsuzuri (綴り) refers to the Japanese concept of binding, spelling, and composing words into documents.

---

## Mathematics (LaTeX)

Inline equations fit directly within sentences: $e^{i\\pi} + 1 = 0$ and $\\nabla \\times \\vec{B} = \\mu_0 \\vec{J} + \\mu_0 \\epsilon_0 \\frac{\\partial \\vec{E}}{\\partial t}$.

Display equations are formatted cleanly:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

Complex matrices adapt to available screen width without expanding the document:

$$
\\mathbf{A} = \\begin{pmatrix}
a_{11} & a_{12} & a_{13} \\\\
a_{21} & a_{22} & a_{23} \\\\
a_{31} & a_{32} & a_{33}
\\end{pmatrix}
$$

---

## Diagrams (Mermaid)

Flowcharts, sequence diagrams, and class charts render locally to vector SVGs:

\`\`\`mermaid
flowchart LR
    A[Markdown Source] --> B[Tsuzuri Parser]
    B --> C[KaTeX + Mermaid]
    C --> D[Typeset Reader]
\`\`\`

---

## Code Blocks

Fenced code blocks with language syntax highlighting:

\`\`\`rust
fn calculate_entropy(data: &[u8]) -> f64 {
    let mut counts = [0usize; 256];
    for &byte in data {
        counts[byte as usize] += 1;
    }
    let total = data.len() as f64;
    counts.iter().filter(|&&c| c > 0).fold(0.0, |acc, &count| {
        let p = count as f64 / total;
        acc - p * p.log2()
    })
}
\`\`\`

---

## Tables

| Format | Support | Offline | Responsive |
| :--- | :---: | :---: | :--- |
| CommonMark | Yes | Yes | Fits viewport |
| GFM Tables | Yes | Yes | Horizontal scroll contained |
| LaTeX Math | Yes | Yes | KaTeX bundled |
| Mermaid | Yes | Yes | Offline vector SVG |
`;

export function createInitialState(): AppState {
  const savedTheme = (localStorage.getItem("tsuzuri_theme") as ThemeMode) || "system";
  const validTheme: ThemeMode = ["system", "light", "dark"].includes(savedTheme) ? savedTheme : "system";

  return {
    doc: {
      path: null,
      fileName: "untitled.md",
      directory: null,
      content: DEFAULT_MARKDOWN,
      savedSnapshot: DEFAULT_MARKDOWN,
      isDirty: false,
    },
    activeView: "reader",
    themeMode: validTheme,
    tocOpen: false,
    findOpen: false,
    findQuery: "",
    replaceQuery: "",
  };
}

