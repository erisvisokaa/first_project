# Stockroom

A browser-based wholesale workspace for products, restaurant customers, stock deliveries, and sales. Built with React, TypeScript, and Vite.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm ci --cache /tmp/stockroom-npm-cache
npm run dev -- --port 5173
```

The development server listens on all interfaces. For a production build, run `npm run build`; `npm run preview` serves the build for local verification.

## First steps

The app opens with clearly labeled sample data. In **Settings & data**, choose your business currency and clear the sample workspace to enter your own records.

1. Add products with their unit, purchase cost, default selling price, opening stock, and restock threshold.
2. Add restaurant customers and their contact details.
3. Receive stock deliveries; each receipt adds to inventory and its movement history.
4. Create a sale for a customer. Default prices are filled in but can be overridden for that order. Recording a sale subtracts stock and preserves historical item names, quantities, units, costs, and selling prices.

Products support bottles, cases, kilograms, liters, bags, boxes, pieces, and custom units. Count units require whole quantities; weight and custom units support fractions. Bottles and cases are separate inventory products; automatic pack conversions are not implemented.

Sales reject insufficient stock, including duplicate product lines whose combined quantity exceeds stock. Amounts are rounded per line to two decimals. Sales and movement dates are recorded automatically. Payments, unpaid balances, tax calculations, cancellations, and returns are outside this version.

## Data and backups

Records are saved in localStorage in the current browser, without a backend or account. They are not shared between users or devices. Use **Settings & data → Export backup** regularly. **Restore backup** validates a JSON backup and asks before replacing the workspace. Changing currency changes display labels, without converting amounts.

If saved data is damaged or inaccessible, the app shows a warning and pauses automatic saves to protect the original data. Restoring a valid backup or explicitly clearing the workspace re-enables saving. Changes made while saving is paused remain temporary.

## Validation

```sh
npm test
npm run build
npm run test:e2e
```

The browser tests use `/usr/bin/chromium` in this cloud environment; adjust `playwright.config.ts` to use another installed Chromium executable when running elsewhere. The test runner starts Vite if needed. Tests cover stock receipts, price overrides, overselling protection, preserved sale history, browser persistence, backup restoration, damaged-data recovery, mobile navigation, and currency settings. Screenshots are generated in the ignored `.playwright/` directory.

## Open the hosted app with GitHub Pages

A static build is published to the `gh-pages` branch. To activate hosting, open this repository’s **Settings → Pages**, select **Deploy from a branch**, choose **gh-pages** and **/ (root)**, then click **Save**. GitHub will show the live site URL after deployment. Hosting availability depends on the repository’s visibility and GitHub plan.

To rebuild for this project’s hosted path, run:

```sh
npm run build -- --base /first_project/
```

The output in `dist/` must be published to `gh-pages` after source changes. Saving source on `main` alone does not update that static branch. Use the URL reported by GitHub Pages; the local cloud development server is not a public preview.
