import assert from "node:assert/strict";
import test from "node:test";
import {
  captureEvent,
  captureSession,
} from "../skills/currai/scripts/lib/currai.mjs";
import { runDemo } from "../skills/currai/scripts/send-demo.mjs";

test("sends schema-compatible sessions and every event kind in order", async () => {
  const { fetchImpl, requests } = receiver();
  const options = {
    baseUrl: "https://currai.example",
    workspaceId: "workspace-test",
    fetchImpl,
  };
  const session = await captureSession(options, {
    user_data: { user_id: "user-1", properties: { plan: "pro" } },
  });
  assert.equal(session.ok, true);

  const kinds = [
    "agent",
    "model",
    "tool",
    "mcp_tool",
    "retriever",
    "guardrail",
    "evaluator",
    "event",
  ];
  for (const [index, kind] of kinds.entries()) {
    const event = await captureEvent(options, {
      session_id: session.sessionId,
      kind,
      primitive_name: `${kind}-operation`,
      args: { authorization: "Bearer secret", index },
      result: index === 1 ? { error: "provider failed" } : { ok: true },
      success: index !== 1,
      latency: index,
    });
    assert.equal(event.ok, true);
  }

  assert.equal(requests[0].path, "/api/v1/capture-session");
  assert.match(requests[0].body.session_id, /^[0-9a-f-]{36}$/);
  assert.equal(requests[0].headers["x-currai-workspace-id"], "workspace-test");
  assert.deepEqual(
    requests.slice(1).map((request) => request.body.kind),
    kinds,
  );
  assert.equal(JSON.parse(requests[1].body.args).authorization, "[REDACTED]");
  assert.equal(requests[2].body.success, false);
  assert.ok(requests.slice(1).every((request) => request.body.session_id === session.sessionId));
});

test("send-demo validates connectivity but identifies itself as a demo", async () => {
  const { fetchImpl, requests } = receiver();
  const result = await runDemo({
    workspaceId: "workspace-demo",
    baseUrl: "https://currai.example",
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.match(result.note, /real application interaction/i);
  assert.equal(requests[0].path, "/api/v1/capture-session");
  assert.deepEqual(
    requests.slice(1).map((request) => request.body.kind),
    ["agent", "model", "tool", "guardrail", "evaluator"],
  );
});

function receiver() {
  const requests = [];
  return {
    requests,
    fetchImpl: async (url, init) => {
      requests.push({
        path: new URL(url).pathname,
        headers: init.headers,
        body: JSON.parse(init.body),
      });
      return new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    },
  };
}
