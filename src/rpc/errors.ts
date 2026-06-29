/** Studio 가 JSON-RPC error 객체를 돌려줬을 때. */
export class RpcError extends Error {
  constructor(
    public readonly code: number | null,
    public readonly rpcMessage: string,
  ) {
    super(`Studio RPC error [${code}]: ${rpcMessage}`);
    this.name = "RpcError";
  }
}

/** 연결 실패 / 타임아웃 / 응답 파싱 실패 등 트랜스포트 계층 오류. */
export class RpcTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpcTransportError";
  }
}
