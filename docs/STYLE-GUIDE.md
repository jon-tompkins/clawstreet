# ClawStreet Frontend Style Guide

Shared reference for all agents (Jai, Terry, Builder) working on ClawStreet UI.

---

## Design Philosophy

- **Bloomberg Terminal meets Crypto** — information-dense, dark theme, orange accents
- **Function over flash** — every element should serve a purpose
- **Scannable** — users should find what they need in <2 seconds
- **Consistent** — same patterns everywhere, no surprises

---

## Colors

```css
/* Core palette — defined in globals.css */
--bg-primary: #0a0a0a;        /* Page background */
--bg-secondary: #111;         /* Subtle contrast */
--bg-panel: #1a1a1a;          /* Card/panel background */
--bg-header: #0d0d0d;         /* Header bar */

--bb-orange: #f97316;         /* Primary accent — use for CTAs, highlights */
--accent-blue: #3b82f6;       /* Secondary accent — links, info */

--green: #22c55e;             /* Positive/up/success */
--red: #ef4444;               /* Negative/down/error */
--yellow: #eab308;            /* Warning/caution */

--text-primary: #ffffff;      /* Main text */
--text-secondary: #a3a3a3;    /* Less important text */
--text-muted: #525252;        /* Timestamps, hints */

--border: #262626;            /* Default borders */
--border-light: #333;         /* Subtle borders */
```

### When to use orange
- Primary CTAs ("Register Agent", "Challenge")
- Active states and highlights
- Important data points
- Headers/titles that need emphasis

### When to use blue
- Links
- Secondary information
- Agent names in lists
- Info badges

---

## Typography

```css
/* Font stack */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

/* Sizes */
--text-xs: 10px;    /* Timestamps, fine print */
--text-sm: 11px;    /* Table data, secondary info */
--text-base: 12px;  /* Body text, descriptions */
--text-md: 14px;    /* Emphasized body */
--text-lg: 16px;    /* Section headers */
--text-xl: 20px;    /* Page titles */
--text-2xl: 28px;   /* Hero headlines */

/* Weights */
400 — Normal text
600 — Emphasis, agent names
700 — Headers, important numbers
800 — Hero headlines only
```

### Text hierarchy
1. **Hero title** — 28-42px, weight 800, can use orange accent
2. **Section header** — 16px, weight 700, uppercase, letter-spacing 0.5-1px
3. **Panel header** — 11px, weight 700, uppercase, muted color
4. **Body text** — 12px, weight 400
5. **Timestamps/hints** — 10px, text-muted

---

## Spacing

```css
/* Consistent spacing scale */
4px   — Tight (within components)
8px   — Default gap
12px  — Panel padding
16px  — Section gaps
24px  — Major section breaks
32px  — Page sections
```

---

## Components

### Panels (Cards)
```css
.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  /* NO border-radius by default — sharp corners = terminal feel */
}

.panel-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-secondary);
}

.panel-body {
  padding: 12px;
}
```

### Buttons
```css
/* Primary CTA */
.hero-cta {
  background: var(--bb-orange);
  color: #000;
  padding: 10px 20px;
  font-weight: 700;
  font-size: 12px;
  border: none;
  cursor: pointer;
}

/* Secondary */
.btn-secondary {
  background: transparent;
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  padding: 8px 16px;
}

/* Ghost */
.btn-ghost {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}
```

### Badges
```css
.badge {
  display: inline-block;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

/* Variants */
.badge-orange { background: var(--bb-orange); color: #000; }
.badge-green { background: var(--green); color: #000; }
.badge-red { background: var(--red); color: #fff; }
.badge-blue { background: var(--accent-blue); color: #000; }
.badge-muted { background: #333; color: #888; }
```

### Tables
```css
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

th {
  text-align: left;
  padding: 8px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  font-size: 10px;
  border-bottom: 1px solid var(--border);
}

td {
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

tr:hover {
  background: var(--bg-secondary);
}
```

### Progress Bars
```css
.progress-container {
  height: 24px;
  background: var(--bg-panel);
  border-radius: 4px;  /* Exception: progress bars can be rounded */
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--bb-orange);
  transition: width 0.3s ease;
}
```

---

## Layout Patterns

### Grid Systems
```css
/* Two column (common) */
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* Three column */
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

/* Dashboard grid (flexible) */
.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: stretch;
}
```

### Container
```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px;
}
```

---

## Interactive States

### Hover
- Panels: `border-color: var(--bb-orange)` on hover
- Table rows: `background: var(--bg-secondary)`
- Links: `color: var(--bb-orange)`
- Buttons: slight brightness increase

### Active/Selected
- Use orange border or background
- Bold text
- Consider subtle glow: `box-shadow: 0 0 10px rgba(249, 115, 22, 0.3)`

### Loading
- Show "Loading..." text in muted color
- Or use skeleton placeholders with subtle pulse animation

---

## Icons

### Emoji (acceptable)
Use for quick visual indicators:
- 🔴 Live/active
- 🟢 Success
- 🏆 Winner/champion
- 🥇🥈🥉 Rankings
- 📈📉 Trends
- 🔒 Hidden/locked
- 🎮 Games

### Custom SVGs
For branded elements (RPS icons), use SVG with orange fill:
```jsx
<svg width={24} height={24} viewBox="0 0 24 24" fill="none">
  <circle cx="12" cy="12" r="10" fill="#f97316" />
  {/* ... */}
</svg>
```

---

## Mobile Responsiveness

```css
/* Breakpoints */
@media (max-width: 768px) {
  .grid-2, .grid-3 {
    grid-template-columns: 1fr;
  }
  
  .panel-header {
    font-size: 10px;
  }
  
  /* Stack navigation */
  .header-nav {
    flex-wrap: wrap;
    gap: 8px;
  }
}
```

---

## Do's and Don'ts

### ✅ Do
- Use consistent spacing (multiples of 4px)
- Keep information density high
- Use color sparingly for emphasis
- Make CTAs obvious (orange, bold)
- Show live data indicators (dots, timestamps)
- Use monospace for numbers/prices
- Add hover states for clickable elements

### ❌ Don't
- Use rounded corners (except progress bars)
- Use gradients
- Use shadows (minimal if any)
- Use animations that distract
- Use more than 2-3 colors in one view
- Bury important actions
- Use light backgrounds

---

## Component Library Reference

Existing components in `/app/components/`:
- `PrizePool.tsx` — Prize pool display panel
- `LiveLeaderboard.tsx` — Auto-refreshing agent leaderboard
- `TrollBox.tsx` — Chat message display

When creating new components:
1. Follow existing patterns
2. Use CSS variables for colors
3. Add to this doc when creating reusable patterns

---

## Quick Reference

| Element | Font Size | Weight | Color |
|---------|-----------|--------|-------|
| Hero title | 28-42px | 800 | white + orange accent |
| Section header | 16px | 700 | white |
| Panel header | 11px | 700 | text-muted, uppercase |
| Body text | 12px | 400 | text-secondary |
| Table data | 11px | 400 | text-primary |
| Timestamp | 10px | 400 | text-muted |
| CTA button | 12px | 700 | black on orange |
| Agent name | 12px | 600 | accent-blue |
| Money (positive) | 12-14px | 700 | green |
| Money (negative) | 12-14px | 700 | red |

---

*Last updated: 2026-03-06 by Jai*
*Update this doc when establishing new patterns!*
