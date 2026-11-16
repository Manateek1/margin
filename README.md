# Margin

Margin is a roommate planning app. It supports up to 12 roommates with customizable illustrated avatars, recurring costs, month-specific paid status, and equal or available-income splits. Users can preview one-time costs or credits, export the plan to CSV, and draft a conversation opener with Cloudflare Workers AI.

## Privacy and cost

- Household names, income, essentials, bill amounts, and split results stay in this browser’s local storage.
- Optional password lock (Security page): the plan is encrypted in the browser with AES-256-GCM using a key derived from your password (PBKDF2-SHA-256, 600,000 iterations). The password never leaves the device, the app locks again on reload, and any existing unencrypted plan is migrated into the encrypted vault and removed. There is no password reset.
- The public app works online, but plans do not sync across browsers or devices, and adding a roommate does not send an invitation.
- The AI request contains only one selected conversation goal and one tone. Personalized numbers are added in the browser after the model replies.
- The Worker uses Cloudflare Workers AI’s free model allowance. This app does not use a paid API key, paid database, or bank connection.
- The Wrangler configuration targets the `Margin` Cloudflare account explicitly.

## Run it locally

Install dependencies once with `npm install`, then start the Worker and UI in two terminals:

```sh
npm run dev:worker
npm run dev
```

Open `http://localhost:5173`. The Vite UI forwards `/api/*` to the local Wrangler Worker on port `8787`. The AI binding is remote so it can use the connected Cloudflare account’s free Workers AI allowance.

For the full AI flow, sign into the free Cloudflare account with `npx wrangler login` first. If the AI service is unavailable, the rest of the local planner still works and the coach displays a retry message.

## Check and build

```sh
npm test
npm run lint
npm run build
```

## Deploy

```sh
npm run deploy
```

The Worker is named `margin` and the Pages project is named `getmargin`; the deploy command updates both in the configured `Margin` account. Keep that account on the Workers Free plan; the app does not require a paid provider or paid database.

The shorter Pages deployment reuses the same AI endpoint through `pages/functions/api/coach.ts`. Use `npm run deploy:worker` or `npm run deploy:pages` to update either address individually. Plans are stored per browser origin, so a plan saved on one address does not automatically appear on the other.
