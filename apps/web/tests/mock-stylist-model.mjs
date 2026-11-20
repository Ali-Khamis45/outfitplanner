import http from "node:http";

export const toolCall = (name, args, id = name) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
export const completion = (content = null, tool_calls = []) => ({ choices: [{ message: { role: "assistant", content, ...(tool_calls.length ? { tool_calls } : {}) }, finish_reason: tool_calls.length ? "tool_calls" : "stop" }] });
export async function startMockModel(script, intentScript) {
  const requests = [], intentRequests = [], allRequests = [], warmups = [];
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/v1/models") { res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ object: "list", data: [] })); return; }
    if (req.method === "POST" && req.url === "/api/chat") { let raw = ""; for await (const chunk of req) raw += chunk; warmups.push(JSON.parse(raw)); res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ done: true })); return; }
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") { res.writeHead(404).end(); return; }
    try {
      let raw = ""; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw); allRequests.push(body);
      const isIntent = body.response_format?.json_schema?.name === "stylist_intent";
      const list = isIntent ? intentRequests : requests; list.push(body);
      const response = await (isIntent && intentScript ? intentScript : script)(body, list.length - 1);
      if (response?.redirect) { res.writeHead(302, { Location: response.redirect }).end(); return; }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(response));
    } catch { res.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { requests, intentRequests, allRequests, warmups, baseUrl: `http://127.0.0.1:${server.address().port}/v1`, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
