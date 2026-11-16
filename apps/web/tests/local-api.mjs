export async function request(handler, { method = "POST", body, headers = {}, query = {}, remoteAddress = "127.0.0.1" } = {}) {
  const req = { method, body, query, headers: { host: "localhost:3100", "content-type": "application/json", ...headers }, socket: { remoteAddress } };
  const res = { code: 0, headers: {}, body: null, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, end() { return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res); return res;
}
