/* ============================================================================
   MOZ COMPONENTS — lab reimplementations of Firefox toolkit widgets
   Taylor Silva · Staff Product Designer, AI UX

   These mirror the Acorn web components from mozilla-central so the lab
   markup reads like in-tree code. In Firefox, replace with the real ones:

     <moz-button>   → toolkit/content/widgets/moz-button/moz-button.mjs
     <moz-card>     → toolkit/content/widgets/moz-card/moz-card.mjs
     <moz-badge>    → toolkit/content/widgets/moz-badge/moz-badge.mjs
     <moz-toggle>   → toolkit/content/widgets/moz-toggle/moz-toggle.mjs

   Tokens consumed here are the Acorn tokens already verified in the motion
   SOT (sidebar.css / common.css names): --space-*, --border-radius-*,
   --button-background-color-ghost*, --panel-*, --text-color-deemphasized.
   All components respect color-scheme via light-dark().
   ============================================================================ */

const ACORN = `
  :host { font: menu; font-family: inherit; }
  :host([hidden]) { display: none !important; }
  *:focus-visible { outline: 2px solid var(--color-accent, #623ac3); outline-offset: 1px; }
`;

/* ── moz-button ──
   type: default | primary | ghost | icon  ·  size: default | small */
class MozButton extends HTMLElement {
  static get observedAttributes() { return ["type", "size", "disabled"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>${ACORN}
        button {
          font-family: inherit; font-size: 12.5px; font-weight: 600;
          padding: 7px 16px; cursor: pointer;
          border-radius: var(--border-radius-medium, 8px);
          border: 1px solid transparent;
          background: light-dark(rgba(21,20,26,0.07), rgba(255,255,255,0.1));
          color: light-dark(#15141a, rgba(255,255,255,0.88));
          transition: background 140ms var(--ease-warmth, ease), border-color 140ms;
        }
        button:hover { background: light-dark(rgba(21,20,26,0.12), rgba(255,255,255,0.16)); }
        :host([type="primary"]) button { background: var(--color-accent, #7542e5); color: #fff; }
        :host([type="primary"]) button:hover { background: #623ac3; }
        :host([type="ghost"]) button {
          background: var(--button-background-color-ghost, transparent);
          color: currentColor;
        }
        :host([type="ghost"]) button:hover { background: light-dark(rgba(0,0,0,0.08), rgba(255,255,255,0.12)); }
        :host([type="icon"]) button {
          width: 32px; height: 32px; padding: 0; display: inline-flex;
          align-items: center; justify-content: center;
          background: transparent;
        }
        :host([type="icon"]) button:hover { background: light-dark(rgba(0,0,0,0.07), rgba(255,255,255,0.12)); }
        :host([size="small"]) button { font-size: 11px; padding: 5px 12px; border-radius: 99px; }
        :host([disabled]) button { opacity: 0.45; cursor: default; pointer-events: none; }
      </style>
      <button part="button"><slot></slot></button>`;
  }
  attributeChangedCallback() {}
}

/* ── moz-card ── plain container card per Acorn (moz-card in sidebar.css) */
class MozCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>${ACORN}
        :host {
          display: block;
          background: light-dark(#fff, rgba(255,255,255,0.055));
          border: var(--sidebar-box-border-width, 0.5px) solid
                  light-dark(rgba(0,0,0,0.12), rgba(255,255,255,0.12));
          border-radius: var(--border-radius-medium, 8px);
          padding: var(--card-padding, 8px);
          color: light-dark(#15141a, rgba(255,255,255,0.88));
        }
      </style><slot></slot>`;
  }
}

/* ── moz-badge ── status pill; variant: live | met | paused | kept | offer */
class MozBadge extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>${ACORN}
        :host {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 9px; font-weight: 700; letter-spacing: 0.5px;
          text-transform: uppercase; padding: 2.5px 9px; border-radius: 99px;
          background: light-dark(#f0f0f4, rgba(255,255,255,0.1));
          color: light-dark(#52525e, rgba(255,255,255,0.6));
        }
        :host([variant="live"]) { background: light-dark(#e7f5e7, rgba(5,139,0,0.22)); color: light-dark(#058b00, #7fe07a); }
        :host([variant="live"])::before {
          content: ""; width: 6px; height: 6px; border-radius: 50%;
          background: currentColor;
          animation: breathe 3000ms ease-in-out infinite;
        }
        :host([variant="met"]) { background: light-dark(#ede6ff, rgba(153,89,255,0.22)); color: light-dark(#623ac3, #d4bfff); }
        :host([variant="kept"]) { background: light-dark(#fff3e8, rgba(255,151,40,0.16)); color: light-dark(#e66000, #ffb95e); }
        :host([variant="paused"]) { opacity: 0.7; }
        @keyframes breathe { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.82)} }
      </style><slot></slot>`;
  }
}

/* ── moz-toggle ── Acorn switch */
class MozToggle extends HTMLElement {
  static get observedAttributes() { return ["pressed"]; }
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${ACORN}
        button {
          width: 32px; height: 18px; border-radius: 99px; border: none; cursor: pointer;
          background: light-dark(#cfcfd8, rgba(255,255,255,0.25));
          position: relative; transition: background 140ms;
        }
        :host([pressed]) button { background: var(--color-accent, #7542e5); }
        button::after {
          content: ""; position: absolute; top: 2px; left: 2px;
          width: 14px; height: 14px; border-radius: 50%; background: #fff;
          transition: transform 140ms var(--ease-warmth, ease);
        }
        :host([pressed]) button::after { transform: translateX(14px); }
      </style><button role="switch"></button>`;
    root.querySelector("button").addEventListener("click", () => {
      this.toggleAttribute("pressed");
      this.dispatchEvent(new Event("toggle", { bubbles: true }));
    });
  }
  get pressed() { return this.hasAttribute("pressed"); }
  attributeChangedCallback() {}
}

customElements.define("moz-button", MozButton);
customElements.define("moz-card", MozCard);
customElements.define("moz-badge", MozBadge);
customElements.define("moz-toggle", MozToggle);
