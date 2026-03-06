# Design System: RestroLogic SaaS
**Project ID:** restrologic-saas

## 1. Visual Theme & Atmosphere
RestroLogic aims for a **"Modern Professional & Efficient"** atmosphere.
- **Mood:** Clean, trustworthy, high-tech but accessible.
- **Density:** Comfortable density for touch targets (tablet/POS usage) but information-rich for admin dashboards.
- **Aesthetic:** Glassmorphism accents, smooth gradients, and reduced visual noise. Focus on content (menus, orders, analytics).

## 2. Color Palette & Roles
We use the OKLCH color space for perceptually uniform colors.

### Primary Brand (Deep Royal Blue)
- **Primary:** `oklch(0.55 0.2 260)` - Core brand identity, primary actions.
- **Primary Content:** `oklch(0.98 0 0)` - Text on primary backgrounds.

### Secondary (Vibrant Teal)
- **Secondary:** `oklch(0.7 0.15 180)` - Accents, secondary actions, "freshness".

### Functional Colors
- **Success:** `oklch(0.65 0.18 145)` - Order completed, payment success.
- **Warning:** `oklch(0.8 0.15 85)` - Low stock, kitchen delays.
- **Error:** `oklch(0.6 0.2 25)` - Payment failed, critical alerts.
- **Neutral:** `slate-based` - For text and backgrounds, keeping a cool tone.

### Backgrounds & Surfaces
- **Base-100 (Surface):** `oklch(1 0 0)` (Light) / `oklch(0.15 0.02 260)` (Dark)
- **Base-200 (Background):** `oklch(0.98 0.01 260)` / `oklch(0.12 0.02 260)`
- **Base-300 (Dividers/Borders):** `oklch(0.92 0.01 260)` / `oklch(0.25 0.02 260)`

## 3. Typography Rules
- **Font Family:** 'Inter', system-ui, sans-serif.
- **Headings:** Bold/Semi-bold, tight tracking.
- **Body:** Regular/Medium, optimized for readability.
- **Numbers:** Tabular nums for prices and data tables.

## 4. Component Stylings
### Buttons
- **Shape:** `rounded-lg` (Standard), `rounded-full` (Icon buttons).
- **Behavior:** Subtle scale on click, brightness hover effect.
- **Shadow:** `shadow-sm` for secondary, `shadow-md` for primary.

### Cards (DaisyUI extension)
- **Shape:** `rounded-xl` or `rounded-2xl`.
- **Style:** White/Dark gray background, subtle border `border-base-200`, `shadow-md`.
- **Glass:** Used for overlays and sticky headers (`backdrop-blur-md`).

### Inputs
- **Shape:** `rounded-lg`.
- **Style:** `bg-base-200` to `bg-base-100` on focus. Ring focus with primary color opacity.

## 5. Layout Principles
- **Sidebar:** Glassmorphism effect, collapsible.
- **Spacing:** standard 4px grid (`gap-4`, `p-6`).
- **Responsive:**
    - Mobile: Stacked cards, bottom navigation or hamburger menu.
    - Tablet/Desktop: Multi-column, persistent sidebar.
