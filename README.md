# Snip backend

A zero-dependency Bun URL shortener. Links are stored in memory and are cleared
when the server restarts.

## Run

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it, `BASE_URL`
to set the origin used in generated short links, or
`RAILWAY_PUBLIC_DOMAIN` to use a Railway-provided hostname when `BASE_URL` is
unset. `PUBLIC_DIR` optionally enables static file serving; `/` serves
`index.html`.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link.
- `GET /api/links` lists links.
- `GET /:code` redirects to the original URL and increments its hit count.

Invalid JSON and non-HTTP(S) URLs return `400`.
