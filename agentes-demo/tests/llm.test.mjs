import assert from "node:assert/strict";
import Module from "node:module";
import process from "node:process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};
let callModel;
try {
  const llmUrl = pathToFileURL(`${process.env.WORKFLOW_TEST_BUILD_DIR}/lib/llm.js`);
  ({ callModel } = (await import(llmUrl)).default);
} finally {
  Module._load = originalLoad;
}

test("plain-text Gemini calls preserve chat-completion request and response contract", async (context) => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  context.after(() => {
    if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch;
  });
  process.env.GEMINI_API_KEY = "test-key";
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return Response.json({ choices: [{ message: { content: "plain answer" } }] });
  };
  const answer = await callModel([{ role: "user", content: "hello" }]);
  assert.equal(answer, "plain answer");
  assert.match(request.url, /chat\/completions$/);
  assert.deepEqual(request.body.messages, [{ role: "user", content: "hello" }]);
  assert.equal("response_format" in request.body, false);
});

test("JSON Gemini calls request JSON mode and return model content", async (context) => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  context.after(() => {
    if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousApiKey;
    globalThis.fetch = previousFetch;
  });
  process.env.GEMINI_API_KEY = "test-key";
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };
  assert.equal(await callModel([{ role: "user", content: "json please" }], { json: true }), '{"ok":true}');
  assert.deepEqual(body.response_format, { type: "json_object" });
});
