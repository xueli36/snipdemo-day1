import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const links = new Map();
const port = Number(process.env.PORT || 3000);
const publicRoot = process.env.PUBLIC_DIR ? resolve(process.env.PUBLIC_DIR) : null;

function getBaseUrl() {
  if (process.env.BASE_URL) return new URL(process.env.BASE_URL).origin;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return new URL(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`).origin;
  }
  return `http://localhost:${port}`;
}

const baseUrl = getBaseUrl();
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function createCode() {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let code = "";

  while (code.length < 6) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte < 248) code += alphabet[byte % alphabet.length];
      if (code.length === 6) break;
    }
  }

  return code;
}

async function serveStatic(pathname) {
  if (!publicRoot) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes("\0") || decodedPath.includes("\\")) return null;
  const relativePath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = resolve(publicRoot, `.${relativePath}`);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) return null;

  try {
    if (!(await stat(filePath)).isFile()) return null;
  } catch {
    return null;
  }

  const file = Bun.file(filePath);
  return new Response(file, {
    headers: {
      ...corsHeaders,
      "Content-Type": file.type || "application/octet-stream",
    },
  });
}

Bun.serve({
  port,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET" && publicRoot) {
      const staticResponse = await serveStatic(pathname);
      if (staticResponse) return staticResponse;
    }

    if (pathname === "/api/links") {
      if (request.method === "GET") return jsonResponse([...links.values()]);
      if (request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }

        if (typeof body?.url !== "string") {
          return jsonResponse({ error: "A valid HTTP or HTTPS URL is required" }, 400);
        }

        let parsedUrl;
        try {
          parsedUrl = new URL(body.url);
        } catch {
          return jsonResponse({ error: "A valid HTTP or HTTPS URL is required" }, 400);
        }
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return jsonResponse({ error: "A valid HTTP or HTTPS URL is required" }, 400);
        }

        let code;
        do {
          code = createCode();
        } while (links.has(code));

        const link = {
          code,
          url: parsedUrl.href,
          shortUrl: `${baseUrl}/${code}`,
          hits: 0,
          createdAt: new Date().toISOString(),
        };
        links.set(code, link);
        return jsonResponse(link, 201);
      }

      return jsonResponse({ error: "Method not allowed" }, 405, {
        Allow: "GET, POST, OPTIONS",
      });
    }

    if (request.method === "GET" && pathname !== "/" && !pathname.slice(1).includes("/")) {
      const code = pathname.slice(1);
      const link = links.get(code);
      if (!link) return jsonResponse({ error: "Link not found" }, 404);

      link.hits += 1;
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: link.url },
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
});

console.log(`Snip backend listening on ${baseUrl}`);
