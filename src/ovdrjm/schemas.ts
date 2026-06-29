import { z } from "zod";

/**
 * 인스턴스 속성 zod 스키마 — Studio 가 받아들이는 속성 키/타입/기본값을 정의한다.
 */

export const vec3 = z.object({ X: z.number(), Y: z.number(), Z: z.number() });

const channel = z.number().int().min(0).max(255);
export const rgb = z.object({ R: channel, G: channel, B: channel });

/** Part 등에 쓰는 머티리얼 값. */
export const materialEnum = z.enum([
  "Basic", "Plastic", "Brick", "Rock", "Metal", "Unlit", "Bark", "SmallBrick",
  "LeafyGround", "MossyGround", "Ground", "Glass", "Paving", "MossyRock", "Wood", "Neon",
]);

/** class=Part 의 공통 속성 필드 (불린 4종 제외). */
const partFields = {
  Shape: z.enum(["Block", "Ball", "Cylinder"]).optional(),
  CFrame: z.object({ Position: vec3, Orientation: vec3 }).optional(),
  Size: vec3.describe("units in cm").optional(),
  CastShadow: z.boolean().optional(),
  CollisionGroup: z.string().optional(),
  Color: rgb.optional(),
  Locked: z.boolean().optional(),
  Mass: z.number().optional(),
  Massless: z.boolean().optional(),
  Material: materialEnum.optional(),
  MaterialVariant: z.string().optional(),
  Reflectance: z.number().describe("(0~1)").optional(),
  RootPriority: z.number().optional(),
  Transparency: z.number().describe("(0~1)").optional(),
} as const;

/**
 * create 용 Part 속성. Anchored/CanCollide/CanQuery/CanTouch 는 신규 노드 기본값으로 default(true).
 */
export const partProperties = z.object({
  ...partFields,
  Anchored: z.boolean().default(true),
  CanCollide: z.boolean().default(true),
  CanQuery: z.boolean().default(true),
  CanTouch: z.boolean().default(true),
}).strict();

/**
 * update 용 Part 속성 — 모든 필드 선택, **기본값 없음**.
 * 부분 업데이트에서 미지정 필드가 기본값으로 덮어써지지 않도록(예: Color 만 바꿨는데 Anchored 가
 * 리셋되는 일이 없도록) default 를 두지 않는다.
 */
export const partPropertiesUpdate = z.object({
  ...partFields,
  Anchored: z.boolean().optional(),
  CanCollide: z.boolean().optional(),
  CanQuery: z.boolean().optional(),
  CanTouch: z.boolean().optional(),
}).strict();

export type PartProperties = z.infer<typeof partProperties>;

/** 스크립트 클래스. */
export const scriptClassEnum = z.enum(["LocalScript", "Script", "ModuleScript"]);

/** 싱글톤 서비스 클래스 — 삭제 불가. */
export const serviceClasses: ReadonlySet<string> = new Set([
  "Workspace", "Lighting", "Atmosphere", "Players", "StarterPlayer", "MaterialService", "HttpService",
  "CollectionService", "DataModel", "DataStoreService", "PhysicsService", "RunService",
  "ServerScriptService", "ServerStorage", "StarterCharacterScripts", "StarterGui", "StarterPlayerScripts", "ReplicatedStorage",
]);
