---
name: Capitalis Institutional
colors:
  surface: '#f9f9ff'
  surface-dim: '#cbdbfa'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d5e3ff'
  on-surface: '#0b1c33'
  on-surface-variant: '#434654'
  inverse-surface: '#213149'
  inverse-on-surface: '#ebf1ff'
  outline: '#737685'
  outline-variant: '#c3c6d6'
  surface-tint: '#1b55d0'
  primary: '#003594'
  on-primary: '#ffffff'
  primary-container: '#004ac6'
  on-primary-container: '#b8c8ff'
  inverse-primary: '#b4c5ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#d7dff9'
  on-secondary-container: '#5a6278'
  tertiary: '#2c3f54'
  on-tertiary: '#ffffff'
  tertiary-container: '#43566c'
  on-tertiary-container: '#b7cbe5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dae2fc'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3e465b'
  tertiary-fixed: '#d0e4ff'
  tertiary-fixed-dim: '#b4c8e2'
  on-tertiary-fixed: '#071d30'
  on-tertiary-fixed-variant: '#35485e'
  background: '#f9f9ff'
  on-background: '#0b1c33'
  surface-variant: '#d5e3ff'
typography:
  headline-xl:
    fontFamily: DM Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: DM Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: DM Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: DM Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: DM Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: DM Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: DM Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2.5rem
  gutter: 1.5rem
  margin: 2rem
  max-width: 1280px
---

## Brand & Style
The brand personality is **Institutional, Precise, and Authoritative**. It is designed for high-net-worth individuals and institutional investors who require clarity, data density, and a sense of "quiet luxury" in their financial tools. 

The design style is **Corporate Modern with Tonal Layering**. It avoids loud gradients or skeuomorphism in favor of a sophisticated "blueprint" aesthetic. The interface uses a systematic approach to information hierarchy, utilizing subtle background shifts (surfaces) and refined typography to guide the user through complex data sets without visual fatigue. The emotional response should be one of confidence, stability, and professional-grade performance.

## Colors
The palette is rooted in a "Deep Slate & Cobalt" foundation. 
- **Primary Cobalt (#004AC6):** Used for actionable items, primary buttons, and critical data indicators.
- **Institutional Slate (#0F172A):** Used for the persistent sidebar to provide a strong visual anchor and high-contrast environment for navigation.
- **Surface Strategy:** The main canvas uses a very light cool-grey (#F9F9FF), while containers are pure white (#FFFFFF). This subtle contrast creates "elevation through color" rather than relying on heavy shadows.
- **Semantic Accents:** Red is reserved strictly for negative performance and "close" actions, while the primary blue doubles as a "growth" indicator for expected returns.

## Typography
The system uses a pairing of **Manrope** for structural navigation/headers and **DM Sans** for data and content. 
- **Navigation:** Manrope provides a modern, geometric clarity for the sidebar and top-level headers.
- **Data Display:** DM Sans is used for its exceptional readability in dense data environments. 
- **Hierarchy:** We utilize tight tracking and semi-bold weights for "Label" styles to create a clear distinction from "Body" text. 
- **Numerical Data:** Use tabular figures where possible to ensure alignment in lists and metrics cards.

## Layout & Spacing
The system utilizes a **12-column fixed grid** with a maximum content width of 1280px. 
- **Sidebar:** A fixed 256px (w-64) sidebar creates a consistent anchor on the left.
- **Content Rhythms:** A standard 8px (0.5rem) base unit is used. Margins around the main canvas are set to 32px (2rem) to allow the data-heavy cards room to breathe.
- **Component Spacing:** Use `lg` (24px) for internal card padding and `gutter` (24px) for the gap between grid items.

## Elevation & Depth
Elevation is achieved primarily through **Tonal Layering and Border Definition** rather than shadows.
- **Level 0 (Canvas):** The background surface (#F9F9FF).
- **Level 1 (Cards):** White (#FFFFFF) surfaces with a thin, 1px border (`outline-faint`).
- **Interaction (Hover):** A very subtle `shadow-sm` is applied to cards or buttons on interaction to indicate clickability.
- **Sticky Elements:** The Top Navigation uses a `backdrop-blur-md` with 80% opacity to maintain context while scrolling.

## Shapes
The shape language is **Conservative and Rectilinear**.
- **Standard Radius:** 4px (rounded-DEFAULT) for buttons and inputs, providing a precise, technical feel.
- **Container Radius:** 12px (rounded-xl) for main content cards to soften the data-heavy layout and provide a modern "app" feel.
- **Search/Pills:** Use `full` (9999px) for search bars and status tags to distinguish them from structural elements like cards or inputs.

## Components
- **Buttons:** Primary buttons use the Cobalt background with white text. Secondary buttons use a transparent background with a thin border. All buttons should have a `transition-all` and a slight `scale-95` on active state.
- **Inputs:** Fields should have a subtle background tint (#F0F3FF) to distinguish them from the card surface. Focus states should use a 1px solid Primary border and a soft ring.
- **Chips/Tags:** Used for stock symbols (e.g., AAPL). These feature a light grey background, a 1px border, and a small 'close' icon in the Secondary color.
- **Data Metrics:** Metric cards should feature a label in `label-sm` (uppercase) and the value in `headline-md`. Negative values must be strictly Error-Red.
- **Sidebar Nav:** Icons should be 20px. Active states are indicated by a subtle blue tint (10% opacity) and a 2px right-side primary border.
- **Donut Charts:** Use a 16px stroke width for donut segments with 0px spacing between them.