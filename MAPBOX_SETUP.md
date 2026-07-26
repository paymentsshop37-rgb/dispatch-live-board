# Mapbox production setup

Add this environment variable to the Vercel project for Production, Preview,
and Development:

`VITE_MAPBOX_ACCESS_TOKEN`

Use a public Mapbox browser token beginning with `pk.`. It needs only the public
style and font read scopes. Never use a secret token beginning with `sk.` in
this frontend application.

Restrict the production token in Mapbox to:

- `https://roadservicelive.com`
- `https://www.roadservicelive.com`

Use a separate development token that permits `http://localhost` if local map
testing is required. Redeploy the Vercel production deployment after adding or
changing the environment variable.
