import { HeadingItem } from "./renderer";

export class NavigationManager {
  private tocDrawer: HTMLElement;
  private tocList: HTMLElement;
  private readerContainer: HTMLElement;
  private isOpen: boolean = false;
  private onToggleCallback?: (isOpen: boolean) => void;

  constructor(
    tocDrawer: HTMLElement,
    tocList: HTMLElement,
    readerContainer: HTMLElement,
    onToggle?: (isOpen: boolean) => void
  ) {
    this.tocDrawer = tocDrawer;
    this.tocList = tocList;
    this.readerContainer = readerContainer;
    this.onToggleCallback = onToggle;

    this.initEvents();
  }

  private initEvents(): void {
    // Close on click outside
    document.addEventListener("click", (e) => {
      if (this.isOpen) {
        const target = e.target as HTMLElement;
        if (!this.tocDrawer.contains(target) && !target.closest("#btn-toc")) {
          this.closeToc();
        }
      }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) {
        this.closeToc();
      }
    });
  }

  public updateHeadings(headings: HeadingItem[]): void {
    if (headings.length === 0) {
      this.tocList.innerHTML = `<div class="toc-empty">No headings found in document</div>`;
      return;
    }

    let html = "";
    for (const h of headings) {
      const indentClass = `toc-level-${h.level}`;
      html += `
        <button class="toc-item ${indentClass}" data-heading-id="${h.id}">
          <span class="toc-item-text">${this.escapeHtml(h.text)}</span>
        </button>
      `;
    }
    this.tocList.innerHTML = html;

    // Attach click listeners to TOC items
    this.tocList.querySelectorAll<HTMLButtonElement>(".toc-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const headingId = btn.getAttribute("data-heading-id");
        if (headingId) {
          this.jumpToHeading(headingId);
          this.closeToc();
        }
      });
    });
  }

  public jumpToHeading(id: string): void {
    const el = this.readerContainer.querySelector(`[id="${CSS.escape(id)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  public toggleToc(): void {
    if (this.isOpen) {
      this.closeToc();
    } else {
      this.openToc();
    }
  }

  public openToc(): void {
    this.isOpen = true;
    this.tocDrawer.classList.add("open");
    this.tocDrawer.setAttribute("aria-hidden", "false");
    if (this.onToggleCallback) this.onToggleCallback(true);
  }

  public closeToc(): void {
    this.isOpen = false;
    this.tocDrawer.classList.remove("open");
    this.tocDrawer.setAttribute("aria-hidden", "true");
    if (this.onToggleCallback) this.onToggleCallback(false);
  }

  public isTocOpen(): boolean {
    return this.isOpen;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}

