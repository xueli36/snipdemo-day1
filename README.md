# Snip

Snip is a tiny URL shortener with one backend and two independent clients: an
Angular web app and a Node.js CLI. The backend stores links in an in-memory
`Map`; restarting it clears the links.

## Repository layout

Each layer is a branch in this repository. The `main` branch mounts the layer
branches as Git submodules:

| Branch | Path | Contents |
| --- | --- | --- |
| `backend` | `backend/` | Bun API server |
| `frontend` | `frontend/` | Angular 19 web app |
| `cli` | `cli/` | CommonJS Node.js CLI |
| `bundle` | `bundle/` | Generated release: API, web UI, and CLI |
| `main` | repository root | Submodules, build script, and CI |

Clone with submodules populated:

```sh
git clone --recurse-submodules https://github.com/xueli36/snipdemo-day1.git
```

A plain clone leaves the submodule directories empty. To populate them later,
run `git submodule update --init --recursive`.

## Shared API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `POST` | `/api/links` | `{"url":"https://…"}` | `201` with `{code, url, shortUrl, hits, createdAt}`; `400` for invalid JSON or a non-HTTP(S) URL |
| `GET` | `/api/links` | — | `200` with an array of link records |
| `GET` | `/:code` | — | `302` to the original URL and increments `hits`; `404` for an unknown code |

## Run from the main checkout

Start the backend in one terminal:

```sh
cd backend && bun start
```

In another terminal, run the web app:

```sh
cd frontend && npm install && npx ng serve
```

The web app is available at `http://localhost:4200`; the development backend
uses `http://localhost:3000`. To list links with the CLI:

```sh
cd cli && node cli.js ls
```

## Updating components

Edit a component on its own branch, commit and push from that component
checkout, then update its pointer in the superproject:

```sh
git submodule update --remote <path>
git add <path>
git commit -m "Bump <path> submodule"
git push
```

After updating source branches, regenerate and publish the bundle:

```sh
node scripts/build-bundle.mjs --push
```

The bundle is generated output; make changes in the component branches rather
than editing files in `bundle/` by hand.
