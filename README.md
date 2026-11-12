# Snip Frontend

Angular 19 client for the Snip URL shortener. The form validates HTTP(S) URLs,
creates short links, and lists links with their original URLs and hit counts.

## Run locally

Start the backend on `http://localhost:3000`, then run:

```sh
npm install
npx ng serve
```

The app opens at `http://localhost:4200`. Create a production build with
`npx ng build`; its files are written to `dist/snip-frontend/browser`.
