// DEV store only: this is not IPFS and must not be used as a production store.
const http = require("node:http");
const { put, get } = require("./lib/devIpfsStore");

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const DEFAULT_PORT = 5055;

function cors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendError(res, status, message) {
    cors(res);
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(message);
}

function createServer() {
    return http.createServer(async (req, res) => {
        cors(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        try {
            if (req.method === "POST" && req.url === "/add") {
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                    size += chunk.length;
                    if (size > MAX_BODY_BYTES) {
                        sendError(res, 413, "request body exceeds 12 MB");
                        req.destroy();
                        return;
                    }
                    chunks.push(chunk);
                }
                const id = await put(Buffer.concat(chunks));
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ cid: id }));
                return;
            }

            if (req.method === "GET" && req.url.startsWith("/cat/")) {
                const id = decodeURIComponent(req.url.slice("/cat/".length));
                const bytes = await get(id);
                res.writeHead(200, { "Content-Type": "application/octet-stream" });
                res.end(bytes);
                return;
            }

            sendError(res, 404, "not found");
        } catch (error) {
            sendError(res, error.message === "invalid dev IPFS id" ? 400 : 404, error.message);
        }
    });
}

if (require.main === module) {
    const port = Number(process.env.DEV_IPFS_PORT || DEFAULT_PORT);
    createServer().listen(port, "127.0.0.1", () => {
        console.log(`DEV IPFS store listening on http://127.0.0.1:${port}`);
    });
}

module.exports = { createServer };
