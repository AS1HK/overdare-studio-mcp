import net from "node:net";
import { RpcTransportError } from "./errors.js";

export interface TransportTarget {
  host: string;
  port: number;
  timeoutMs: number;
}

/**
 * 줄단위 JSON-RPC 트랜스포트. 요청 1줄(\n 종료) 쓰고 첫 \n 까지 응답 읽고 닫음.
 * 줄단위 JSON-RPC 와이어 프로토콜. 요청 한 줄을 쓰고 응답 한 줄을 읽는다.
 * (수동 버퍼링으로 스트림 에러 처리 풋건을 피한다.)
 */
export function sendRequestLine(target: TransportTarget, rawRequest: string): Promise<string> {
  const { host, port, timeoutMs } = target;
  const connectHost = host === "localhost" ? "127.0.0.1" : host;
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let buffer = "";
    const socket = net.createConnection({ host: connectHost, port });

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const cleanup = () => {
      socket.removeAllListeners();
      socket.on("error", () => {}); // 정리 후 늦게 오는 소켓 에러 흡수(uncaught 방지)
      if (!socket.destroyed) socket.destroy();
    };

    socket.on("error", (err) =>
      settle(() => reject(new RpcTransportError(
        `Could not connect to Studio RPC at ${connectHost}:${port} — is OVERDARE Studio running? (${err.message})`,
      ))));
    socket.setTimeout(timeoutMs, () =>
      settle(() => reject(new RpcTransportError(`Studio RPC timed out after ${timeoutMs}ms.`))));
    socket.on("connect", () => socket.write(`${rawRequest}\n`));
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const nl = buffer.indexOf("\n");
      if (nl !== -1) settle(() => resolve(buffer.slice(0, nl)));
    });
    socket.on("close", () =>
      settle(() => reject(new RpcTransportError("Studio RPC connection closed before a response was received."))));
  });
}
