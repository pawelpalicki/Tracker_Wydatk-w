# Repository Guidelines

A Firebase-based expense tracking application consisting of a modular web frontend and a Cloud Functions backend.

## Project Structure & Module Organization

- **APP/**: Frontend application (ES Modules).
  - **js/**: Modular JavaScript implementation.
    - `main.js`: Main entry point (Type="module"). Manages Auth state and initialization.
    - **core/**: Essential application logic.
      - `bootstrap.js`: App initialization, event listeners setup.
      - `state.js`: Global application state management.
      - `api.js`: Communication layer with backend functions.
      - `config.js`: Firebase configuration and constants.
      - `data-loader.js`: Initial data fetching logic.
    - **shared/**: Reusable UI components and utilities.
      - `drawer.js`: Unified Drawer system (`Drawer.open()`).
      - `ui.js`: Common UI logic (navigation, tabs, navbar).
      - `format.js`: Formatting utilities (currency, dates).
      - `notifications.js`: Notifications and AI insights system.
      - `categories.js`, `tags.js`: Shared data helpers.
    - **views/**: Feature-specific views (Lazy loaded where possible).
      - `dashboard.js`, `analysis.js`, `purchase-form.js`, `purchase-list.js`, `special-budgets.js`.
      - **settings/**: Sub-views for app configuration.
  - **css/**: Stylesheets.
    - `styles.css`: Global styles and typography.
    - `drawer.css`: Specific styles for the unified Drawer and Swipe components.
- **functions/**: Firebase Cloud Functions (Node.js 22).
  - Uses CommonJS (`require`).
  - `index.js`: Express-based API entry point.
  - `prompt.js`: AI prompt definitions for Gemini AI.

## Build and Development Commands

### Frontend (APP/)
- `npm run build`: Builds and minifies CSS using Tailwind.
- `npm run build-css`: Watches for changes and builds CSS for development.

### Backend (functions/)
- `npm run serve`: Starts Firebase emulators for local testing.
- `npm run deploy`: Deploys Cloud Functions to Firebase.

## Coding Style & Naming Conventions

- **Frontend**: **Strictly ES Modules**. No global variables on `window`. No inline event handlers (onclick) in HTML — use `addEventListener`.
- **UI Components**: Use the unified `Drawer` system for all modals and panels.
- **Backend**: Node.js 22 using CommonJS.

## Architecture Overview

- **Database**: Firestore (collections: `users`, `expenses`, `recurringExpenses`).
- **AI Integration**: Google Generative AI (Gemini) for receipt analysis and voice expenses.
- **Navigation**: Single Page Application (SPA) using hash-less history state for tab management.

## Commit Guidelines

Follow conventional commit prefixes:
- `feat:` for new features.
- `fix:` for bug fixes.
- `refactor:` for code restructuring.
- `UI/UX:` for visual improvements.
- `chore:` for maintenance tasks.
