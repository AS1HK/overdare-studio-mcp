import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runRpcMutationTool } from "./result.js";

/**
 * asset_drawer.import — 에셋 스토어(Asset Drawer)의 모델을 레벨에 임포트한다.
 * 소스는 `ovdrassetid://<숫자>` (로컬 파일 아님 → 경로검증 불필요).
 * 레벨을 바꾸므로 백업 가드(롤백 가능) 사용.
 */
export function register(server: McpServer): void {
  server.registerTool(
    "studio_import_model",
    {
      title: "Import a model from Asset Drawer",
      description:
        "에셋 스토어(Asset Drawer)의 모델을 레벨에 임포트한다 (계층 보존). " +
        "assetid 는 ovdrassetid://<숫자> 형식. 실패 시 자동 rollback. 지원 안 하면 capability 에러.",
      inputSchema: {
        assetid: z.string().regex(/^ovdrassetid:\/\/\d+$/, "ovdrassetid://<숫자> 형식이어야 함"),
        assetName: z.string().describe("Asset Drawer 에 표시되는 자산 이름"),
        assetType: z.literal("MODEL").default("MODEL").describe("현재 MODEL 만 지원"),
      },
    },
    async ({ assetid, assetName, assetType }) => {
      return runRpcMutationTool(
        "studio_import_model",
        "asset_drawer.import",
        { assetid, assetName, assetType },
        (result) => ({
          text: `Imported model "${assetName}" (${assetid}) into the level.`,
          data: result,
          metadata: { assetid },
        }),
        { backup: true },
      );
    },
  );
}
