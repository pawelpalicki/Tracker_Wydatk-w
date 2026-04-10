# Repository Guidelines

A Firebase-based expense tracking application consisting of a web frontend and Cloud Functions backend.

## Project Structure & Module Organization

- **APP/**: Frontend application assets and logic.
  - **js/**: Modular JavaScript implementation.
    - `app.js`: Main application entry point and state coordination.
    - `api.js`: Communication layer with backend functions.
    - `auth.js`: User authentication logic.
    - `categories-v2.js`: Hierarchical category management.
    - `ui.js`: DOM manipulation and UI component management.
    - Specialized modules: `budget.js`, `purchases.js`, `statistics.js`, `special-budgets.js`, `long-term-budget.js`.
  - **css/**: Stylesheets, primarily managed via Tailwind CSS.
- **functions/**: Firebase Cloud Functions (Node.js 22).
  - `index.js`: Express-based API handling Firestore operations and external integrations.
  - `prompt.js`: AI prompt definitions for Gemini AI integration.
- **Root**: Configuration files for Firebase (`firebase.json`, `.firebaserc`), Firestore (`firestore.rules`, `firestore.indexes.json`), and project-wide settings.

## Build, Test, and Development Commands

### Frontend (APP/)
- `npm run build`: Builds and minifies CSS using Tailwind.
- `npm run build-css`: Watches for changes and builds CSS for development.

### Backend (functions/)
- `npm run serve`: Starts Firebase emulators for local function testing.
- `npm run shell`: Launches the Firebase functions interactive shell.
- `npm run deploy`: Deploys Cloud Functions to Firebase.
- `npm run logs`: Streams logs from deployed Firebase functions.

## Coding Style & Naming Conventions

- **Frontend**: Uses standard ES6+ JavaScript. Styling is strictly managed through Tailwind CSS classes.
- **Backend**: Node.js 22 environment using CommonJS (`require`).
- **CSS**: Custom styles should be added to `APP/src/input.css` (if exists) or managed via Tailwind.

## Architecture Overview

- **Database**: Firestore is used for data storage (collections: `users`, `expenses`, `recurringExpenses`).
- **API**: Frontend requests to `/api/**` are rewritten to the `api_v2` Cloud Function via `firebase.json`.
- **AI Integration**: Integrates with Google Generative AI (Gemini) for advanced expense analysis and categorization.

## Commit Guidelines

Follow conventional commit prefixes:
- `feat:` for new features.
- `fix:` for bug fixes.
- `refactor:` for code restructuring without changing behavior.
- `UI/UX:` for visual and user experience improvements.
