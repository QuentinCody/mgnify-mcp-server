import { afterEach, expect, it, vi } from "vitest";
import { normalizeMgnifyPage, readMgnifyBody, readMgnifyText } from "./response";
afterEach(() => vi.useRealTimers());

it("retains catalogue and pagination metadata without confusing page size with total", () => {
  const page = {data:[{id:"MGYG000000001",attributes:{contamination:0.7}}],meta:{pagination:{page:1,count:4744}},links:{next:"?page=2"}};
  expect(normalizeMgnifyPage(page)).toEqual({...page,total_count:4744,next:"?page=2"});
  expect(normalizeMgnifyPage({...page,meta:{pagination:{count:-1}},links:{next:null}})).toEqual({...page,meta:{pagination:{count:-1}},links:{next:null},next:null});
  expect(normalizeMgnifyPage({data:{id:"human-gut-v2-0-2"}})).toEqual({data:{id:"human-gut-v2-0-2"}});
  expect(normalizeMgnifyPage(null)).toBeNull();
});

it("cancels a stalled body at its deadline and rejects invalid UTF-8", async () => {
  await expect(readMgnifyText(new Response(new Uint8Array([255])))).rejects.toThrow();
  vi.useFakeTimers(); const cancel = vi.fn();
  const pending = expect(readMgnifyText(new Response(new ReadableStream({ cancel })), 100, Date.now() + 1000)).rejects.toThrow("deadline");
  await vi.advanceTimersByTimeAsync(1000); await pending;
  expect(cancel).toHaveBeenCalled();
});

it("counts streamed bytes, rejects oversized artifacts, and preserves split Unicode", async () => {
  const bytes = new TextEncoder().encode("αβ");
  const response = new Response(new ReadableStream({start(controller) {controller.enqueue(bytes.slice(0,1));controller.enqueue(bytes.slice(1));controller.close();}}));
  expect(await readMgnifyText(response,4)).toBe("αβ");
  await expect(readMgnifyText(new Response("αβ"),3)).rejects.toThrow("read budget");
  await expect(readMgnifyText(new Response(null))).rejects.toThrow("no body");
});

it("retains complete JSON/text HTTP failures and the native status when its body cannot be read", async () => {
  const text = "native evidence α🧬".repeat(6000);
  await expect(readMgnifyBody(new Response(text, { status: 400 }))).rejects.toMatchObject({ status: 400, data: text });
  const detail = [{ msg: text, type: "value_error" }];
  await expect(readMgnifyBody(Response.json({ detail }, { status: 422 }))).rejects.toMatchObject({ status: 422, data: { detail } });
  const read = vi.fn(() => new Promise(() => {}));
  const cancel = vi.fn(() => new Promise(() => {}));
  const releaseLock = vi.fn();
  const response = { ok: false, status: 503, headers: new Headers(), body: { getReader: () => ({ read, cancel, releaseLock }) } };
  vi.useFakeTimers();
  const checked = expect(readMgnifyBody(response as unknown as Response, 100, Date.now() + 100)).rejects.toMatchObject({ status: 503,
    data: { http_status: 503, body_unavailable: true, body_error: expect.stringContaining("deadline") } });
  await vi.advanceTimersByTimeAsync(100); await checked;
  expect(cancel).toHaveBeenCalled(); expect(releaseLock).toHaveBeenCalled();
});

it("rejects advertised oversize before reading and preserves a leading BOM in text evidence", async () => {
  const pull = vi.fn();
  await expect(readMgnifyText(new Response(new ReadableStream({ pull }, { highWaterMark: 0 }), { headers: { "content-length": "101" } }), 100)).rejects.toMatchObject({ status: 413 });
  expect(pull).not.toHaveBeenCalled();
  expect(await readMgnifyText(new Response("\uFEFFα"))).toBe("\uFEFFα");
});
