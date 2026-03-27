# Obsidian Archive

### 1. Overview & Creative North Star
**Creative North Star: The Monochromatic High-Precision Ledger**

Obsidian Archive is a design system built for high-stakes clarity and sophisticated financial management. It rejects the "app-like" playfulness of traditional fintech in favor of a high-end editorial aesthetic. By utilizing a stark black-and-white foundation punctuated by ultra-refined pastel accents, the system creates a sense of "digital luxury."

The layout strategy relies on intentional nesting and radical contrast. We break the grid through the use of high-impact typography scales and high-radius containers (24px - 32px) that "float" within deep black space, creating a sense of infinite depth.

### 2. Colors
The palette is rooted in true black (`#000000`) and pure white (`#FFFFFF`). 

- **The "No-Line" Rule:** Visual separation is strictly achieved through surface shifts. For instance, a `surface-variant` (`#1E1E1E`) card sits on a `background` (`#000000`) field. Borders are only permitted as `1px solid white/5%` to catch light, never as structural dividers.
- **Surface Hierarchy & Nesting:** 
    - **Tier 0 (Background):** Pure Black.
    - **Tier 1 (Base Container):** `surface-variant` (`#1E1E1E`) for primary grouping.
    - **Tier 2 (Inner Highlight):** Pure White (`#FFFFFF`) for critical data entry or primary balance views, creating a "punch-out" effect.
- **The "Glass & Gradient" Rule:** Use `backdrop-blur-xl` (24px blur) on fixed elements like the Header and Navigation Bar to maintain context while ensuring legibility.
- **Pastel Accents:** Use `pastel-green`, `pastel-purple`, and `pastel-blue` at 20% opacity for category tagging, allowing the vibrant icons to pop without overwhelming the monochrome base.

### 3. Typography
Obsidian Archive uses **Manrope** exclusively, leveraging its geometric balance to drive the brand's precision.

- **Display (2.25rem / 36px):** Extrabold. Used for primary financial figures. Must be tracked tightly (-0.025em) to feel architectural.
- **Headline (1.5rem / 24px):** Bold. Used for page titles and high-level section headers.
- **Title (1.125rem / 18px):** Bold. Used for category titles.
- **Body (0.875rem / 14px):** Medium. The standard for transactional descriptions and list items.
- **Labels & Metadata (8px - 11px):** Uppercase, Bold, with high tracking (0.1em). This is the signature "Editorial" touch—small but highly legible "micro-labels" used for section headers and dates.

### 4. Elevation & Depth
Depth is created through "Tonal Stacking" and refined light-modeling.

- **The Layering Principle:** Instead of shadows, we stack `surface-container` tiers. A dark card containing a white sub-card creates a visual "lift" without traditional drop shadows.
- **Ambient Shadows:** Where shadows are required (e.g., the Floating Action Button), use `shadow-2xl`—a very wide, low-opacity spread that mimics a soft light source directly above the element.
- **Glassmorphism:** Navigation bars use `80%` opacity with a heavy blur. This prevents the "hard cut" look of traditional bottom navs.

### 5. Components
- **Primary Balance Card:** A high-contrast component. A pure white container with black text, featuring a progress bar that is `black/10%` background and `black` fill.
- **Category Chips:** Rectangular-to-pill shapes with 20% opacity backgrounds. Icons are the primary carrier of color (e.g., Green-400, Purple-400).
- **Transaction Items:** Minimalist. Circular initials in `surface-variant` containers. Use the "Editorial Micro-Label" (8-10px) for the date.
- **Floating Action Button:** A pure white circle (`h-14 w-14`) with a bold black icon. It should appear to "float" above all other surfaces.
- **Bottom Navigation:** Icons use a `filled` state for the active item. Non-active items are reduced to 60% opacity.

### 6. Do's and Don'ts
**Do:**
- Use extreme contrast (Black vs. White) for primary actions.
- Use uppercase, wide-tracked labels for small text.
- Rely on background color shifts for nesting logic.
- Use `rounded-3xl` for main outer containers and `rounded-2xl` for inner containers.

**Don't:**
- Never use a grey background that isn't derived from the surface-container scale.
- Do not use 1px solid grey borders to separate sections.
- Avoid using standard font weights for numbers; always prefer Bold or Extrabold for currency.
- Do not introduce bright colors outside of the defined pastel/accent palette.