/**
 * 本地测试用的静态 + API 反向代理服务器。
 *
 * 用途:前端(web-host)用相对路径 /api/* 请求后端;独立静态部署时必须
 * 由反代把 /api/* 转发到 server-host(生产用 Caddy,见 templates/workbench-app/deploy)。
 * 本脚本提供等价的本地反代,便于不装 Caddy 直接跑测试实例。
 *
 * 用法:
 *   node tooling/scripts/static-proxy.mjs \
 *     --port 9911 \
 *     --static examples/reference-app/dist-web \
 *     --api-target http://127.0.0.1:9910
 */
import { createServer } from "node:http";
import { request } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith("--")) {
      args[key.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

const { port, static: staticDir, "api-target": apiTarget } = parseArgs(
  process.argv.slice(2),
);
if (!port || !staticDir || !apiTarget) {
  console.error("用法见文件头注释");
  process.exit(1);
}

/** 把 /api/* 请求转发到 server-host(保留 method/headers/body,回传响应头)。
 *  注意:保留原始 Host 头,保证 server-host 的 CSRF 同源校验(Origin vs Host)
 *  与浏览器看到的页面 origin 一致(与生产 Caddy 反代行为相同)。 */
function proxyApi(req, res) {
  const targetUrl = new URL(req.url ?? "/", apiTarget);
  const upstream = request(
    targetUrl,
    {
      method: req.method,
      headers: { ...req.headers },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: "proxy_error", message: String(err.message) } }));
  });
  req.pipe(upstream);
}

/** 静态文件服务;未知路径回退 index.html(SPA 路由,react-router)。 */
async function serveStatic(req, res, url) {
  let filePath = normalize(join(resolve(staticDir), url.pathname === "/" ? "index.html" : url.pathname));
  if (!filePath.startsWith(resolve(staticDir))) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    // SPA fallback:非文件请求(如 /notes、/settings)返回 index.html。
    try {
      const indexHtml = await readFile(join(resolve(staticDir), "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(indexHtml);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }
  void serveStatic(req, res, url);
});

server.listen(Number(port), "0.0.0.0", () => {
  console.log(`[static-proxy] http://0.0.0.0:${port}  (静态:${staticDir}, API 代理:${apiTarget})`);
});
