import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoViewer } from "../src/components/fundgraph/MemoViewer";
import { FundGraphProvider } from "../src/fundgraph/state";
import type { Memo } from "../src/lib/fundgraph/types";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
  (globalThis as { window?: Window }).window = dom.window as unknown as Window;
  (globalThis as { document?: Document }).document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = dom.window.HTMLElement;
  (globalThis as { Node?: typeof Node }).Node = dom.window.Node;
  (globalThis as { DOMParser?: typeof DOMParser }).DOMParser = dom.window.DOMParser;
  (globalThis as { self?: unknown }).self = dom.window;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mountMemoViewer(input: {
  memo: Memo;
  fundsShouldFail?: boolean;
  failFirstPatch?: boolean;
}) {
  const dom = installDom();
  const container = dom.window.document.getElementById("root");
  assert.ok(container, "expected test root container");

  let memo = input.memo;
  let patchCount = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/api/fundgraph/memos/") && method === "GET") {
      return new Response(JSON.stringify({ mode: "hybrid", memo }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/api/fundgraph/funds") && method === "GET") {
      if (input.fundsShouldFail) {
        return new Response(JSON.stringify({ error: "funds_failed" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ mode: "hybrid", count: 0, funds: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/api/fundgraph/memos/") && method === "PATCH") {
      patchCount += 1;
      if (input.failFirstPatch && patchCount === 1) {
        return new Response(JSON.stringify({ error: "memo_save_failed" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      const body = JSON.parse(String(init?.body || "{}")) as { memoMarkdown?: string; editorHtml?: string };
      memo = {
        ...memo,
        memoMarkdown: body.memoMarkdown ?? memo.memoMarkdown,
        editorHtml: body.editorHtml ?? memo.editorHtml,
        isEdited: true,
        lastEditedAt: "2026-03-05T12:00:00.000Z",
      };
      return new Response(JSON.stringify({ mode: "hybrid", memo }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };

  const root = createRoot(container);
  await act(async () => {
    root.render(
      <FundGraphProvider>
        <MemoViewer memoId={memo.id} />
      </FundGraphProvider>
    );
  });
  await wait(40);

  return {
    dom,
    container,
    getPatchCount: () => patchCount,
    async clickButton(label: string) {
      const target = Array.from(container.querySelectorAll("button")).find((node) => (node.textContent ?? "").includes(label));
      assert.ok(target, `expected button containing text: ${label}`);
      await act(async () => {
        target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    async edit(html: string) {
      const editor = container.querySelector(".memo-editor") as HTMLDivElement | null;
      assert.ok(editor, "expected memo editor");
      await act(async () => {
        editor.innerHTML = html;
        editor.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      globalThis.fetch = originalFetch;
      dom.window.close();
    },
  };
}

function baseMemo(overrides?: Partial<Memo>): Memo {
  return {
    id: "fg-memo-ui-test",
    userId: "demo",
    artifactType: "fund_memo",
    memoType: "investment_memo",
    generationMode: "deterministic",
    primaryFundId: "fund-1",
    fundIds: ["fund-1"],
    memoMarkdown: "# Memo\n\nInitial content.",
    editorHtml: "<h1>Memo</h1><p>Initial content.</p>",
    sections: [],
    citations: [],
    createdAt: "2026-03-05T11:00:00.000Z",
    ...overrides,
  };
}

test("MemoViewer owner mode is editable and autosaves", async () => {
  const mounted = await mountMemoViewer({ memo: baseMemo() });
  const editor = mounted.container.querySelector(".memo-editor") as HTMLDivElement | null;
  assert.ok(editor, "expected memo editor");
  assert.equal(editor.getAttribute("contenteditable"), "true", "expected editor to be editable for owner");

  await mounted.edit("<h1>Memo</h1><p>Edited content.</p>");
  await wait(1500);
  assert.ok(mounted.getPatchCount() >= 1, "expected autosave PATCH call");
  assert.match(mounted.container.textContent ?? "", /Saved|Saving|Ready/, "expected save status text to render");
  await mounted.unmount();
});

test("MemoViewer read-only mode for non-owner", async () => {
  const mounted = await mountMemoViewer({
    memo: baseMemo({ userId: "owner-only-user" }),
  });
  const editor = mounted.container.querySelector(".memo-editor") as HTMLDivElement | null;
  assert.ok(editor, "expected memo editor");
  assert.equal(editor.getAttribute("contenteditable"), "false", "expected read-only editor for non-owner");
  assert.match(mounted.container.textContent ?? "", /Read-only/, "expected read-only notice");
  await mounted.unmount();
});

test("MemoViewer manual save retry succeeds after failed save", async () => {
  const mounted = await mountMemoViewer({
    memo: baseMemo(),
    failFirstPatch: true,
  });
  await mounted.edit("<h1>Memo</h1><p>Manual save content.</p>");
  await mounted.clickButton("Save");
  await wait(80);
  assert.match(mounted.container.textContent ?? "", /Save failed/, "expected failed save status");
  await mounted.clickButton("Retry Save");
  await wait(80);
  assert.ok(mounted.getPatchCount() >= 2, "expected retry to trigger another PATCH");
  await mounted.unmount();
});

test("MemoViewer still renders when fund metadata fetch fails", async () => {
  const mounted = await mountMemoViewer({
    memo: baseMemo(),
    fundsShouldFail: true,
  });
  assert.match(mounted.container.textContent ?? "", /Memo/, "expected memo content to render");
  assert.doesNotMatch(mounted.container.textContent ?? "", /Memo loading failed/, "expected no blocking load failure");
  await mounted.unmount();
});
