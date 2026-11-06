# Crop Top Wardrobe — Cloudflare edition

# ✂️ Crop Top Wardrobe

**A cut-and-paste wardrobe for your real clothes.** Snap a photo of a piece, let the in-browser AI cut it out, then dress a punk paper doll (or a cut-out of yourself) on a collage poster and save the looks you love.

**[▶ Live demo](https://crop-top-wardrobe.croptopwardrobe.workers.dev)**

![React Router 8](https://img.shields.io/badge/React_Router-8-CA4245?logo=reactrouter&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers_·_D1_·_R2-F38020?logo=cloudflare&logoColor=white)
![Transformers.js](https://img.shields.io/badge/AI-Transformers.js_(in_browser)-FFD21E?logo=huggingface&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)

<!-- Add a screenshot or GIF here, e.g. ![Dressing the paper doll](docs/screenshot.png) -->

---

## Features

### 📸 AI cut-outs, right in the browser

- Upload a clothing photo and an AI model removes the background on your device. The photo never leaves it until you press **Add to wardrobe**.
- Tell it what the photo shows:
  - **Just the item** (flat-lay, hanger, product shot) keeps the main object.
  - **Someone wearing it** keeps only the piece you're adding, such as the pants and not the person, top or shoes.
- See the original next to the cut-out and keep whichever you prefer. Edges are softened and the empty border is trimmed.

### 🏷️ Tag everything

- Pick **as many** colors, moods, vibes and weathers as fit each piece, like a hoodie that's *cozy + lazy*, *streetwear + grunge*, *cold + rainy*.
- **Generate a fit:** choose any mix of moods, vibes, weathers and colors, and it picks one piece per body zone. It prefers pieces that match everything and falls back to the closest matches.

### 🧍 Dress the paper doll

- Drag pieces from the wardrobe onto the doll, or tap to put them on.
- **Move** them anywhere, **rotate** with the ↻ handle (Shift snaps to 15°) and **resize** from the corner.
- **Bring to front / send to back**, reset or take off.
- Works with touch, and from the keyboard: arrows nudge, `[` `]` rotate, `+` `-` resize, Page Up / Page Down layer, Delete removes.
- Saved looks remember exactly where every piece sits. Click one to open it **large**, then flip through with ← →.

### 🎨 Collage poster avatar

- Pick a poster: **Punk** (yellow halftone, red cast shadow, electric-blue cut-out edge) or **Cute** (sky and field, stars, pixel blocks, white cut-out edge).
- Halftone and paper grain are printed over everything, clothes included.
- The figure is a drawn punk paper doll whose hair, eyes, skin and body type you choose, or **your own photo**, cut out by the same AI.

### 🔐 Accounts

- Email and password sign-up. Each user only ever sees their own wardrobe, looks and avatar.

---

## Tech stack

| Layer         | Tech                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| App           | [React Router 8](https://reactrouter.com) (SSR), React 19, Tailwind CSS 3, Radix UI, lucide icons                |
| Hosting       | [Cloudflare Workers](https://developers.cloudflare.com/workers/) (via `@cloudflare/vite-plugin`)               |
| Database      | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite)                                                  |
| Photo storage | [Cloudflare R2](https://developers.cloudflare.com/r2/), with automatic fallback to D1                            |
| Auth          | Built in: PBKDF2-SHA256 password hashing, hashed bearer session tokens, per-IP rate limit on login              |
| AI            | [Transformers.js](https://huggingface.co/docs/transformers.js) running ONNX models in a Web Worker (WebAssembly) |

Everything runs on Cloudflare's **free tier**, and the AI runs on the visitor's device, so there are no AI servers to pay for.

---

## Getting started

**You need:** Node.js 22+ and a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
git clone https://github.com/<you>/crop-top-wardrobe.git
cd crop-top-wardrobe
npm install
```

### Run locally

```bash
npm run db:migrate:local   # creates the local database in .wrangler/
npm run dev                # opens the local dev server (the URL is printed)
```

Local dev simulates D1 and R2 on your machine, so you need no Cloudflare setup to try it.

> With npm 11+, approve the install scripts for `esbuild`, `workerd` and `sharp` if prompted (`npm approve-scripts --allow-scripts-pending`). They download platform binaries.

### Deploy to Cloudflare

1. **Log in:**

   ```bash
   npx wrangler login
   ```
2. **Create the database** and paste the printed `database_id` into `wrangler.jsonc`:

   ```bash
   npx wrangler d1 create crop-top-wardrobe
   ```
3. **Enable R2:** in the Cloudflare dashboard, open **R2 Object Storage** and enable it. It's free up to 10 GB, but Cloudflare asks for a payment method. Then create the bucket:

   ```bash
   npx wrangler r2 bucket create crop-top-wardrobe-images
   ```

   If you'd rather not add a card, remove the `r2_buckets` block from `wrangler.jsonc` and photos are stored in D1 instead.
4. **Create the tables** and **deploy:**

   ```bash
   npm run db:migrate:remote
   npm run deploy
   ```

Your app is live at `https://crop-top-wardrobe.<your-subdomain>.workers.dev`.

**Updating:** after pulling changes that add files to `migrations/`, run `npm run db:migrate:local` (dev) and/or `npm run db:migrate:remote` (live). Only new migrations are applied.

---

## Scripts

| Command                                    | What it does                                               |
| ------------------------------------------ | ---------------------------------------------------------- |
| `npm run dev`                            | Dev server with local D1 + R2                              |
| `npm run build`                          | Production build                                           |
| `npm run deploy`                         | Build and deploy to Cloudflare                             |
| `npm run db:migrate:local` / `:remote` | Apply database migrations                                  |
| `npm run typecheck`                      | Generate Cloudflare + route types, then type-check         |
| `npm run test:api`                       | API tests against a real SQLite database (D1 and R2 modes) |

---

## Free-tier limits

| Resource        | Free allowance                                        | In practice                                                                                                    |
| --------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Worker requests | 100,000 / day                                         | Thousands of visits a day                                                                                      |
| D1              | 5M rows read, 100k written / day; 500 MB per database | Plenty for accounts, pieces and looks                                                                          |
| R2              | 10 GB, 1M writes, 10M reads / month; free egress      | Roughly **25,000–100,000** cut-out photos (100–400 KB each)                                            |
| Worker CPU      | 10 ms / request (with burst leeway)                   | Login hashing takes about 13 ms and fits the leeway. If you see *Error 1102*, Workers Paid ($5/mo) lifts it. |

Daily D1 limits reset at 00:00 UTC.

---

## Project structure

```
├── migrations/                 D1 schema (SQL), applied in order
├── public/                     Static files
├── src/                        React Router app
│   ├── components/
│   │   ├── home/               Landing page, saved looks, large look viewer
│   │   ├── workshop/           Upload desk, outfit builder, doll stage, avatar + posters
│   │   └── ui/                 shadcn/ui components
│   ├── hooks/use-auth.ts       Session state
│   ├── lib/
│   │   ├── api-client.ts       Typed browser client for /api
│   │   ├── cutout.ts           Mask → transparency, soft edges, trimming
│   │   ├── cutout.worker.ts    Runs the AI models (Web Worker)
│   │   └── image-resize.ts     Shrinks photos before upload
│   └── routes/                 /, /login, /workshop, sitemap, robots
├── workers/
│   ├── app.ts                  Worker entry: /api/* → API, everything else → SSR
│   └── api/                    Auth, garments, outfits, avatar, file storage
├── tests/                      API tests (Node + SQLite)
└── wrangler.jsonc              Cloudflare config (D1, R2)
```

<details>
<summary><strong>API reference</strong></summary>

All data routes require `Authorization: Bearer <token>` and only touch the signed-in user's own rows.

| Method                | Path                  | Body / notes                                                                                                              |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `POST`              | `/api/auth/signup`  | `{ email, password, name }` → `{ token, user }`                                                                      |
| `POST`              | `/api/auth/login`   | `{ email, password }` → `{ token, user }` (rate-limited)                                                             |
| `POST`              | `/api/auth/logout`  |                                                                                                                           |
| `GET`               | `/api/auth/me`      | `{ user }`                                                                                                              |
| `GET`               | `/api/garments`     | List pieces                                                                                                               |
| `POST`              | `/api/garments`     | Multipart: `name`, `category`, `image`, plus repeatable `colors`, `mood`, `vibe`, `weather`                 |
| `DELETE`            | `/api/garments/:id` | Also deletes the photo                                                                                                    |
| `GET`               | `/api/outfits`      | List saved looks                                                                                                          |
| `POST`              | `/api/outfits`      | `{ title, items: [{ id, name, category, image, place? }] }`, where `place` is `{ x, y, w, r, z }` in % of the stage |
| `DELETE`            | `/api/outfits/:id`  |                                                                                                                           |
| `GET` / `PUT`     | `/api/avatar`       | `{ bodyType, hairColor, eyeColor, skinColor, figure, backdrop }`                                                        |
| `POST` / `DELETE` | `/api/avatar/photo` | Upload (already cut out) or remove your photo                                                                             |
| `GET`               | `/api/files/:key`   | Photos, served by unguessable key                                                                                         |
| `GET`               | `/api/health`       |                                                                                                                           |

</details>

<details>
<summary><strong>Customising</strong></summary>

- **Default figure:** to use a photo instead of the drawn doll, put a full-length cut-out (transparent PNG, about 2:3) that you own or have rights to in `public/`. Set `CUSTOM_DEFAULT_FIGURE` in `src/components/workshop/paper-avatar.tsx` to its path.
- **Posters:** `PosterBackdrop` and `BACKDROPS` in the same file. To add a style, also add it to `BACKDROPS` in `workers/api/index.ts` and to the `CHECK` constraint in a new migration.
- **Clothing zones:** the default spots and sizes are in `ZONE_PLACE` in `src/components/workshop/doll-stage.tsx`.
- **AI models:** the model IDs are in `src/lib/cutout.worker.ts` (see the licence note below).

</details>

---

## AI models & licences

| Used for                   | Model                                                                            | Download (once per device, then cached) | Licence                                    |
| -------------------------- | -------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------ |
| Item photos, avatar photos | [briaai/RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4)                         | ≈ 44 MB                                | BRIA RMBG-1.4: **non-commercial**    |
| Clothing worn by a person  | [Xenova/segformer_b2_clothes](https://huggingface.co/Xenova/segformer_b2_clothes) | ≈ 29 MB                                | NVIDIA SegFormer: **non-commercial** |

The models load from Hugging Face's CDN, and Transformers.js from jsDelivr. Nothing is bundled into the deployment.

> ⚠️ **Both models are licensed for non-commercial use only.** That's fine for a personal or portfolio project. Before making money from the app:
>
> - swap `ITEM_MODEL` for a permissive model such as [`onnx-community/BiRefNet_lite-ONNX`](https://huggingface.co/onnx-community/BiRefNet_lite-ONNX) (MIT, ≈ 115 MB)
> - license, or replace, the clothing model

---

## Notes

- **Accounts:** stored in D1. Passwords are salted PBKDF2 hashes, and only SHA-256 hashes of session tokens are stored.
- **Photos:** served by long, random, unguessable URLs so `<img>` tags work without login headers, the same model as most photo apps.
- **Hero image:** `src/components/home/hero.tsx` still references an image on `images.hostinger.com` from the original prototype. Replace it with your own file in `public/`.

## Credits

Originally prototyped with Hostinger Horizons on PocketBase, then rebuilt for Cloudflare Workers, D1 and R2.

## License

No license has been chosen yet. Until one is added, all rights are reserved. To let others use the code, add a `LICENSE` file (for example [MIT](https://choosealicense.com/licenses/mit/)

[crop-top-wardrobe.croptopwardrobe.workers.dev](https://crop-top-wardrobe.croptopwardrobe.workers.dev)

Your Hostinger Horizons app, moved off PocketBase onto Cloudflare's **free** tier:

| Before (Hostinger)      | Now (Cloudflare)                                                                |
| ----------------------- | ------------------------------------------------------------------------------- |
| Node server             | **Workers**: the same React Router app, server-rendered at the edge       |
| PocketBase database     | **D1**: free SQLite database                                              |
| PocketBase users/auth   | Email + password auth in the Worker (PBKDF2 hashing, hashed session tokens)     |
| PocketBase file storage | Photos in **R2** (10 GB free). D1-only storage still works without a card |
| PocketBase realtime     | Same-page events (new uploads appear in the outfit builder instantly)           |

The pages, components and styling are unchanged. Only the data layer was swapped.

## Features added on Cloudflare

- **AI cut-outs.** When you choose a clothing photo, an AI model cuts the piece out of its background in your browser. The upload desk shows the original next to the cut-out, and you pick which one to keep. Tell it what the photo shows:
  - **just the item** (flat-lay, hanger, product shot) keeps the main object.
  - **someone wearing it** keeps only the clothing that matches "Where does it go?". For example, it keeps just the pants and drops the person, top and shoes.
- **Dress the doll freely.** Click a piece in the wardrobe, or drag it straight onto the doll. On the doll you can:
  - drag pieces anywhere
  - turn them with the ↻ handle (hold Shift to snap to 15°)
  - resize them from the pink corner
  - bring them to the front or send them to the back
  - take them off
    On phones, tap a piece to add it, then drag it with your finger. Keyboard: arrows nudge, `[` `]` rotate, `+` `-` resize, Delete removes. Saved looks remember where every piece sits, and the home page shows each look as a small dressed doll.
- **Your own avatar.** In "Make your avatar", choose **My own photo** and upload a full-length picture. The AI cuts you out, and you become the paper doll. You can switch back to the collage figure at any time.

## Deploy (about 10 minutes)

You need Node 22+ and a free Cloudflare account.

```bash
npm install
npx wrangler login                          # opens the browser once
npx wrangler d1 create crop-top-wardrobe    # prints a database_id
```

Paste that `database_id` into `wrangler.jsonc`, then:

```bash
npm run db:migrate:remote    # creates/updates the tables in your Cloudflare D1
npm run deploy               # builds and publishes → https://crop-top-wardrobe.<you>.workers.dev
```

Whenever you pull an update that adds a file to `migrations/`, run the migrate
command again (`:local` for dev, `:remote` before deploying). Wrangler only applies
the new files.

### Run locally

```bash
npm run db:migrate:local     # once: creates a local copy of the database in .wrangler/
npm run dev                  # http://localhost:5173, using the local D1
```

### Before you shut down Hostinger

The paper-doll figure is still loaded from Hostinger's CDN. Open the URL in
`src/components/workshop/paper-avatar.tsx` (`AVATAR_PNG`), save the image as
`public/paper-doll.png`, and change `AVATAR_PNG` to `'/paper-doll.png'`.

Existing PocketBase accounts and wardrobes are **not** copied over. PocketBase's
password hashes can't be reused, so people sign up again on the new site.

## What "free" covers

Workers Free and D1 Free, as of November 2026:

- **Requests:** 100,000 per day.
- **D1:** 5 million rows read and 100,000 rows written per day, and 500 MB per database. Since September 2026, queries fail once a daily limit is hit, until midnight UTC.
- **R2 (photos):** 10 GB of storage, 1 million uploads and 10 million photo loads per month, and downloads are always free. Cut-outs are usually 100–400 KB, so that's roughly **25,000–100,000 photos**. Each photo can be up to 10 MB. Beyond the free tier, storage costs $0.015 per GB a month.
- **Photo sizing:** the browser shrinks each photo to at most 1600 px and roughly 1 MB before upload, keeping transparency on PNG/WebP cut-outs. GIFs are uploaded as-is.
- **CPU:** Workers Free allows 10 ms of CPU per request, with some leeway for occasional spikes. Signing up or logging in takes about 13 ms, because passwords are hashed at Workers' maximum PBKDF2 strength (100,000 iterations). Occasional logins fit within that leeway. If you ever see *Error 1102* on login, the Workers Paid plan ($5/month) raises the CPU limit.

### R2 for photos (on by default)

R2's free tier needs a payment method on your Cloudflare account. You won't be charged under the limits above. Do this once before deploying:

1. In the Cloudflare dashboard, open **R2 Object Storage**, add a payment method if asked, and enable R2.
2. Run `npx wrangler r2 bucket create crop-top-wardrobe-images`.

`npm run dev` simulates the bucket locally, so step 2 is only needed for the live site.

- **Photos uploaded before R2:** these were stored in D1. They stay there and keep loading; new photos go to R2.
- **Running without a card:** delete the `r2_buckets` block in `wrangler.jsonc` and photos go back to D1. That caps you at about 500 MB in total, roughly 2 MB per photo.

## The cut-out AI

The models run on the visitor's own device, using WebAssembly in a background worker
(`src/lib/cutout.worker.ts`), so there is no server to host or pay for:

| Photo shows                       | Model                                                                     | Download (once per device) |
| --------------------------------- | ------------------------------------------------------------------------- | -------------------------- |
| just the item / your avatar photo | [BRIA RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4)                    | ≈44 MB                    |
| someone wearing it                | [SegFormer-B2 clothes](https://huggingface.co/Xenova/segformer_b2_clothes) | ≈29 MB                    |

- **Where the files come from:** Hugging Face's CDN (the models) and jsDelivr ([Transformers.js](https://huggingface.co/docs/transformers.js) 4.3.1). Each model downloads the first time it's needed, then the browser caches it. Nothing extra is added to your Cloudflare deployment.
- **Privacy:** photos never leave the device until you press "Add to wardrobe".
- **Speed:** a cut-out takes a few seconds on a laptop and longer on older phones. Clothing photos are scaled to 1024 px before the AI sees them.
- **If something goes wrong:** if the browser can't run the AI or the model can't download, the original photo is used. GIFs are never cut out, so their animation survives.

> **Licences: non-commercial only.** Both models are licensed for non-commercial use: RMBG-1.4 under BRIA's licence, the SegFormer clothes model under NVIDIA's SegFormer licence. That's fine for a personal or portfolio project. Before charging money or running ads:
>
> - replace `ITEM_MODEL` in `src/lib/cutout.worker.ts` with an MIT-licensed model such as `onnx-community/BiRefNet_lite-ONNX` (≈115 MB)
> - license, or replace, the clothing model

## How it fits together

```
browser ──► Cloudflare Worker (workers/app.ts)
              ├─ /api/*  → workers/api/index.ts ──► D1 (users, sessions, garments, outfits, avatars, files)
              │                                  └─► R2 (photos, if bound)
              └─ pages   → React Router SSR (src/)
```

- `migrations/0001_init.sql`: the database schema, mirroring the old PocketBase collections.
- `workers/api/`: the API. Every route only touches the signed-in user's own rows, the same rule as the old `@request.auth.id = owner` PocketBase rules.
- `src/lib/api-client.ts`: the browser client that replaced the PocketBase SDK. The session token is stored in localStorage and sent as a Bearer header.
- `src/lib/image-resize.ts`: shrinks photos in the browser before upload.
- `src/lib/cutout.ts` and `cutout.worker.ts`: the AI cut-out (mask, soft edges, trimming).
- `src/components/workshop/doll-stage.tsx`: the drag/rotate/resize paper-doll stage.

### API

| Method        | Path                  | Notes                                                                                                                          |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| POST          | `/api/auth/signup`  | `{ email, password, name }`                                                                                                  |
| POST          | `/api/auth/login`   | `{ email, password }`, rate-limited per IP                                                                                   |
| POST          | `/api/auth/logout`  |                                                                                                                                |
| GET           | `/api/auth/me`      |                                                                                                                                |
| GET / POST    | `/api/garments`     | POST is a multipart form: `name, category, colors[], mood, vibe, weather, image`                                             |
| DELETE        | `/api/garments/:id` | also deletes the photo                                                                                                         |
| GET / POST    | `/api/outfits`      | `{ title, items: [{ id, name, category, image, place? }] }`, where `place` is `{ x, y, w, r, z }` in % of the doll stage |
| DELETE        | `/api/outfits/:id`  |                                                                                                                                |
| GET / PUT     | `/api/avatar`       | one per user; `figure` is `collage` or `photo`                                                                           |
| POST / DELETE | `/api/avatar/photo` | upload (already cut out) or remove your photo                                                                                  |
| GET           | `/api/files/:key`   | photos, served by unguessable key so `<img>` works                                                                           |

## Tests

```bash
npm run test:api   # runs the real API code against SQLite, in both D1 and R2 photo modes
```

## Changes besides the database swap

- **Saved looks now show their pictures.** The outfit builder saved each piece as an object, but the home page's "Saved looks" treated them as plain IDs and never matched anything. Pieces later deleted from the wardrobe now show as labelled placeholders.
- **Logging out of the Workshop now takes you to the login page.** Before, it left you on the protected page.
- **Removed Hostinger editor files:** the visual editor, preview banner and e-commerce tracking plugins, and the PocketBase dev plugin.


## License 



# MIT-Style Non-Commercial License

Copyright (c) 2026/11/06 Deividas Malaska

## 1. Permission

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to use, copy, modify, merge, publish, and distribute the Software for **non-commercial purposes only**, subject to the following conditions.

## 2. Non-Commercial Use

The Software may be used freely for personal, educational, academic, and non-commercial research purposes.

Any commercial use of the Software, including but not limited to selling, licensing, incorporating it into commercial products or services, or using it to generate revenue or obtain commercial advantage, is strictly prohibited without prior written authorization from the copyright holder.

## 3. Commercial Licensing

Commercial use may be permitted under a separate written agreement with the copyright holder.

To request commercial authorization, contact:

**malaska.q@gmail.com**

No commercial rights are granted unless explicitly authorized in writing.

## 4. Attribution

The above copyright notice and this license must be included in all copies or substantial portions of the Software, including modified or redistributed versions.

## 5. Disclaimer

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
