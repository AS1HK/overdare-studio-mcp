import net from "node:net";
import readline from "node:readline";
import { afterEach, describe, expect, it } from "vitest";

import { call } from "../src/rpc/client.js";
import { RpcError, RpcTransportError } from "../src/rpc/errors.js";

type Responder = (req: any) => unknown | "NO_REPLY";

let servers: net.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
  servers = [];
});

/** 줄단위 JSON-RPC mock 서버. responder 가 응답 객체를 반환(또는 "NO_REPLY"로 무응답). */
function startMock(responder: Responder): Promise<{ port: number; lastRequest: () => any }> {
  let last: any = null;
  const server = net.createServer((socket) => {
    socket.on("error", () => {}); // 클라이언트가 연결을 끊을 때의 ECONNRESET 흡수
    const rl = readline.createInterface({ input: socket });
    rl.once("line", (line) => {
      const req = JSON.parse(line);
      last = req;
      const out = responder(req);
      if (out === "NO_REPLY") return; // 타임아웃 테스트용
      socket.write(`${JSON.stringify({ jsonrpc: "2.0", id: req.id, ...(out as object) })}\n`);
    });
  });
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, lastRequest: () => last });
    });
  });
}

describe("rpc/client.call", () => {
  it("returns result on success", async () => {
    const { port } = await startMock(() => ({ result: { ok: true, n: 7 } }));
    const res = await call<{ ok: boolean; n: number }>("level.browse", undefined, { port });
    expect(res).toEqual({ ok: true, n: 7 });
  });

  it("throws RpcError with code/message on error response", async () => {
    const { port } = await startMock(() => ({ error: { code: -32002, message: "Method not found: x" } }));
    await expect(call("x", undefined, { port })).rejects.toMatchObject({
      name: "RpcError",
      code: -32002,
    });
    await expect(call("x", undefined, { port })).rejects.toBeInstanceOf(RpcError);
  });

  it("omits params when empty, includes when provided", async () => {
    const mock = await startMock(() => ({ result: 1 }));
    await call("m", undefined, { port: mock.port });
    expect("params" in mock.lastRequest()).toBe(false);
    await call("m", {}, { port: mock.port });
    expect("params" in mock.lastRequest()).toBe(false);
    await call("m", { a: 1 }, { port: mock.port });
    expect(mock.lastRequest().params).toEqual({ a: 1 });
  });

  it("sends a well-formed jsonrpc 2.0 envelope", async () => {
    const mock = await startMock(() => ({ result: 1 }));
    await call("level.apply", undefined, { port: mock.port });
    const req = mock.lastRequest();
    expect(req.jsonrpc).toBe("2.0");
    expect(req.method).toBe("level.apply");
    expect(typeof req.id).toBe("number");
  });

  it("rejects with RpcTransportError on timeout", async () => {
    const { port } = await startMock(() => "NO_REPLY");
    await expect(call("slow", undefined, { port, timeoutMs: 200 })).rejects.toBeInstanceOf(RpcTransportError);
  });

  it("rejects with RpcTransportError when nothing is listening", async () => {
    // 사용 안 하는 포트(서버 미기동)
    await expect(call("x", undefined, { port: 59999, timeoutMs: 500 })).rejects.toBeInstanceOf(RpcTransportError);
  });
});
