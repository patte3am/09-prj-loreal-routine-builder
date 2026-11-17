# Project 9: L'Oréal Routine Builder

Browse the supplied product catalog, select products, and build a personalized routine with the Cloudflare Worker API. The frontend remains a static site and can continue to deploy independently through GitHub Pages.

## Cloudflare Worker setup

The Worker entry point is `src/worker.js`. `wrangler.jsonc` configures Wrangler to deploy that executable handler alongside the existing site files as static assets. The Worker handles `/api/chat` and serves static assets for other requests.

1. Install Node.js, then authenticate Wrangler with `npx wrangler@4 login`.
2. Deploy the Worker once to create it in Cloudflare:

   ```powershell
   npx wrangler@4 deploy
   ```

3. Add the OpenAI API key as a Cloudflare production secret. Wrangler prompts for the value; do not put it in a file:

   ```powershell
   npx wrangler@4 secret put OPENAI_API_KEY
   ```

   `wrangler secret put` publishes a new Worker version with the secret binding.

4. Copy the `workers.dev` URL Wrangler prints. In `index.html`, add the following immediately before the `script.js` tag, replacing the value with that actual URL:

   ```html
   <script>
     window.LOREAL_WORKER_URL =
       "https://09-prj-loreal-routine-builder.<your-account-subdomain>.workers.dev/api/chat";
   </script>
   <script src="script.js"></script>
   ```

   The URL includes the Cloudflare account's `workers.dev` subdomain, which is not known until deployment. Do not publish a guessed hostname.

The API accepts JSON `POST` requests with a `messages` array. The `/api/chat` endpoint supports CORS only for `https://patte3am.github.io`; `/api/health` can be used to confirm that the Worker is deployed. Requests are size- and message-limited and use a best-effort per-isolate IP rate limit. For stronger abuse prevention on a public endpoint, add a Cloudflare Turnstile check or a persistent rate limiter before broad public use.

The `OPENAI_API_KEY` is read only from the Worker runtime environment and is never sent to the browser. The frontend only reports a successful routine after it receives a valid API response.