import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { IMAGE_EXTENSIONS, PathSecurityError, validatePath } from "../security/path-guard.js";
import { rejectResult, runRpcMutationTool } from "./result.js";

/**
 * asset_manager.image.import — 로컬 이미지 파일을 에셋 매니저에 임포트하고 asset id 를 받는다.
 * 파일 경로 입력 → **pathGuard 로 검증**(traversal/symlink/경계/확장자).
 * 레벨이 아니라 에셋 매니저에 등록 → .ovdrjm 백업 가드 미사용(되돌릴 .ovdrjm 변경 없음).
 */
export function register(server: McpServer): void {
  server.registerTool(
    "studio_import_image",
    {
      title: "Import a local image asset",
      description:
        "로컬 이미지 파일을 에셋 매니저에 임포트하고 asset id 를 반환한다. " +
        "경로는 프로젝트 경계(기본) 또는 OVERDARE_ASSET_ROOTS 안의 이미지 파일만 허용된다. " +
        "지원 확장자: " + IMAGE_EXTENSIONS.join(", ") + ". 지원 안 하면 capability 에러.",
      inputSchema: {
        file: z.string().describe("이미지 파일 경로(절대경로 권장). 프로젝트 경계 안이어야 함."),
      },
    },
    async ({ file }) => {
      let realPath: string;
      try {
        realPath = validatePath(file, { extensions: IMAGE_EXTENSIONS });
      } catch (e) {
        if (e instanceof PathSecurityError) return rejectResult("studio_import_image", "path", e.message);
        throw e;
      }
      return runRpcMutationTool(
        "studio_import_image",
        "asset_manager.image.import",
        { file: realPath },
        (result) => ({
          text: `Imported image, asset id: ${typeof result === "string" ? result : JSON.stringify(result)}`,
          data: { assetId: result },
        }),
        { backup: false },
      );
    },
  );
}
