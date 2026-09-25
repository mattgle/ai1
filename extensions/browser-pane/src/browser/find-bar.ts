// What the find bar needs from its browser tab.
export interface FindBarHost {
  // Starts a find on the page. Returns the request id, or `undefined` when
  // the page cannot find yet.
  find(text: string, options: { forward: boolean; findNext: boolean }): number | undefined;
  // Stops the find and removes the marks on the page.
  stop(): void;
  // The bar opened or closed.
  openChanged(open: boolean): void;
  // The owner closed the bar with its Close button: give the focus back to
  // the page.
  returnFocus(): void;
}

// The part of the Electron `found-in-page` result that the bar uses.
export interface FindResult {
  requestId: number;
  activeMatchOrdinal: number;
  matches: number;
}

// The find bar of a browser tab: a text field, the match count, and the
// Previous, Next, and Close buttons. The tab owns it and shows it below the
// toolbar.
export class FindBar {
  readonly node = document.createElement("div");
  protected readonly input = document.createElement("input");
  protected readonly count = document.createElement("span");
  protected readonly previousButton = document.createElement("button");
  protected readonly nextButton = document.createElement("button");
  protected readonly closeButton = document.createElement("button");
  // The id of the last find request. A result of an older request is
  // ignored.
  protected lastRequestId: number | undefined;

  constructor(protected readonly host: FindBarHost) {
    this.node.className = "ai1-browser-find";
    this.node.hidden = true;
    this.input.className = "ai1-browser-find-input theia-input";
    this.input.placeholder = "Find in page";
    this.input.spellcheck = false;
    this.input.addEventListener("input", () => this.search());
    this.input.addEventListener("keydown", (event) => this.onKeyDown(event));
    this.count.className = "ai1-browser-find-count";
    const button = (element: HTMLButtonElement, icon: string, title: string, action: () => void): void => {
      element.className = `ai1-browser-button codicon ${icon}`;
      element.title = title;
      element.addEventListener("click", action);
    };
    button(this.previousButton, "codicon-arrow-up", "Previous match (⇧Enter)", () => this.previous());
    button(this.nextButton, "codicon-arrow-down", "Next match (Enter)", () => this.next());
    button(this.closeButton, "codicon-close", "Close (Escape)", () => {
      this.close();
      this.host.returnFocus();
    });
    this.previousButton.classList.add("ai1-browser-find-previous");
    this.nextButton.classList.add("ai1-browser-find-next");
    this.closeButton.classList.add("ai1-browser-find-close");
    this.node.append(this.input, this.count, this.previousButton, this.nextButton, this.closeButton);
  }

  get isOpen(): boolean {
    return !this.node.hidden;
  }

  // Opens the bar, or selects its text again when it is open.
  open(): void {
    if (!this.isOpen) {
      this.node.hidden = false;
      this.host.openChanged(true);
      this.search();
    }
    this.input.focus();
    this.input.select();
  }

  close(): void {
    if (!this.isOpen) {
      return;
    }
    this.node.hidden = true;
    this.lastRequestId = undefined;
    this.count.textContent = "";
    this.host.stop();
    this.host.openChanged(false);
  }

  next(): void {
    this.findAgain(true);
  }

  previous(): void {
    this.findAgain(false);
  }

  showResult(result: FindResult): void {
    if (result.requestId !== this.lastRequestId || typeof result.matches !== "number") {
      return;
    }
    this.count.textContent =
      result.matches === 0 ? "No results" : `${result.activeMatchOrdinal} of ${result.matches}`;
  }

  // Each change of the text starts a new search.
  protected search(): void {
    const text = this.input.value;
    if (text === "") {
      this.lastRequestId = undefined;
      this.count.textContent = "";
      this.host.stop();
      return;
    }
    this.lastRequestId = this.host.find(text, { forward: true, findNext: true });
  }

  protected findAgain(forward: boolean): void {
    const text = this.input.value;
    if (!this.isOpen || text === "") {
      return;
    }
    this.lastRequestId = this.host.find(text, { forward, findNext: false });
  }

  // Esc is a Theia keybinding (see `BrowserContribution`).
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        this.previous();
      } else {
        this.next();
      }
    }
  }
}
