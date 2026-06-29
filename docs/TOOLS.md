# MCP Tools API

> 이 문서는 `npm run gen:docs` 로 서버의 `tools/list` 에서 자동 생성된다. 직접 수정하지 말 것.

도구 13개.

## 공통 반환 계약 (Tool Result Contract — stable, v1.x)

모든 도구는 사람용 `content[text]` 와 함께 `structuredContent: ToolResult` 를 반환한다:

```ts
interface ToolResult {
  success: boolean;               // 실패해도 throw 하지 않고 success:false 로 반환
  operation: string;              // 도구 이름 (예: "studio_create_part")
  affected: { guid: string; name?: string; class?: string }[]; // 영향받은 인스턴스(읽기는 [])
  rollbackComplete?: boolean;     // 쓰기 실패 시 롤백 완료 여부
  warnings: string[];
  data?: unknown;                 // 도구별 주 결과(예: browse 트리)
  metadata?: Record<string, unknown>;
  error?: { stage?: string; message: string }; // success=false 일 때
}
```
실패도 `success:false` + `error` 로 구조화되며 `isError:true` 로 표시된다(throw 안 함).
Phase 3 의 모든 도구도 이 계약을 그대로 사용한다.

## `studio_add_script`

부모 인스턴스(parentGuid) 하위에 Script/LocalScript/ModuleScript 를 추가한다. 쓰기 파이프라인(backup→modify→validate→level.apply→level.save.file)을 강제하며, 실패 시 자동 rollback. 들여쓰기는 탭 사용 권장(선행 4-스페이스 그룹은 자동으로 탭 변환).

### 입력 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `parentGuid` | string | ✓ | 부모 인스턴스 GUID (예: ServerScriptService) |
| `scriptClass` | `Script` \| `LocalScript` \| `ModuleScript` | ✓ | 스크립트 종류 |
| `name` | string | ✓ | 스크립트 이름 |
| `source` | string | ✓ | Luau 소스 코드 |


### 예제

```json
{
  "parentGuid": "B19F8DF642807EC0846E32B3BF34B66E",
  "scriptClass": "Script",
  "name": "Main",
  "source": "print('hello from OVERDARE')"
}
```

### 반환

텍스트. `Added Script "Main" (guid ...) under ...`. 실패 시 자동 rollback 후 에러.

## `studio_apply`

디스크의 .ovdrjm 변경분을 라이브 씬에 반영한다 (RPC level.apply). 보통 .ovdrjm 편집 직후 호출하는 쓰기 파이프라인의 일부. 보류분이 없으면 사실상 no-op.

### 입력 스키마

_입력 없음._


### 예제

```json
{}
```

### 반환

텍스트(JSON). `{ success: true, messages: [] }`.

## `studio_apply_action_sequence`

기존 ActionSequencer 인스턴스(instanceGuid)에 시퀀서 JSON 파일을 적용한다. jsonFilePath 는 프로젝트 경계 안의 .json 파일이어야 한다(경로검증). 실패 시 자동 rollback. 지원 안 하면 capability 에러.

### 입력 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `instanceGuid` | string | ✓ | 대상 ActionSequencer 인스턴스 GUID |
| `jsonFilePath` | string | ✓ | 시퀀서 JSON 파일 경로(절대경로 권장, 프로젝트 경계 안) |


### 예제

```json
{
  "instanceGuid": "0000000000000000000000000000ASEQ",
  "jsonFilePath": "/absolute/path/inside/project/seq.json"
}
```

### 반환

텍스트 + structuredContent(affected:[{guid}]). jsonFilePath 경로검증(.json) 후 적용. 실패 시 rollback.

## `studio_browse`

OVERDARE Studio 레벨 인스턴스 트리를 조회한다 (RPC level.browse). 각 노드는 guid/name/class/children 을 가진다. startGuid 로 특정 노드부터, classType 으로 클래스 필터(예 Part/Script), maxDepth 로 깊이 제한(1=최상위만 권장).

### 입력 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `startGuid` | string |  | 이 GUID 노드부터 조회 |
| `classType` | string |  | 이 클래스만 (예 "Part", "Script") |
| `maxDepth` | integer |  | 트리 깊이 제한 (1=최상위만) |


### 예제

```json
{
  "classType": "Part",
  "maxDepth": 2
}
```

### 반환

텍스트(JSON). 노드 배열 `[{ guid, name, class, children?, filename? }]`.

## `studio_capabilities`

Studio RPC 기능 지원 여부(capability)와 버전을 보고한다. 최초 1회 probe 후 캐시. refresh:true 면 강제 재확인. 지원하지 않는 기능을 호출하면 각 도구가 capability 에러를 계약 형태로 반환한다.

### 입력 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `refresh` | boolean |  | true 면 캐시 무시하고 재-probe |


### 예제

```json
{
  "refresh": false
}
```

### 반환

structuredContent(data) = { probedAt, studioVersion, methods }.

## `studio_create_part`

부모 인스턴스(parentGuid) 하위에 Part 를 생성한다. 쓰기 파이프라인(backup→modify→validate→level.apply→level.save.file)을 강제하며, 실패 시 자동 rollback. parentGuid 는 studio_browse 로 먼저 확인할 것. 속성: Size/CFrame/Color/Material/Anchored 등. Position 은 CFrame.Position 으로 지정한다. Size 단위는 cm.

### 입력 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `parentGuid` | string | ✓ | 부모 인스턴스 GUID (예: Workspace) |
| `name` | string | ✓ | 생성할 Part 이름 |
| `properties` | object |  | Part 속성 (생략 시 기본값 적용) |


### 예제

```json
{
  "parentGuid": "0000000000000000000000000000WSPC",
  "name": "MyPart",
  "properties": {
    "Size": {
      "X": 4,
      "Y": 1,
      "Z": 4
    },
    "Color": {
      "R": 120,
      "G": 200,
      "B": 120
    },
    "Material": "Plastic"
  }
}
```

### 반환

텍스트. `Created Part "MyPart" (guid ...) under ...`. 실패 시 자동 rollback 후 에러.

## `studio_delete`

인스턴스를 삭제한다 (자식 포함 — 서브트리 통째로 제거). 쓰기 파이프라인(backup→modify→validate→level.apply→level.save.file)을 강제하며 실패 시 자동 rollback. 서비스(Workspace/Lighting/Players 등 싱글톤)는 삭제할 수 없다. guid 는 studio_browse 로 확인.

### 입력 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `guid` | string | ✓ | 삭제할 인스턴스 GUID |


### 예제

```json
{
  "guid": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01"
}
```

### 반환

텍스트 + structuredContent(affected). 자식 포함 삭제. 서비스는 삭제 불가. 실패 시 rollback.

## `studio_import_image`

로컬 이미지 파일을 에셋 매니저에 임포트하고 asset id 를 반환한다. 경로는 프로젝트 경계(기본) 또는 OVERDARE_ASSET_ROOTS 안의 이미지 파일만 허용된다. 지원 확장자: .png, .jpg, .jpeg, .bmp, .tga, .gif, .webp. 지원 안 하면 capability 에러.

### 입력 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `file` | string | ✓ | 이미지 파일 경로(절대경로 권장). 프로젝트 경계 안이어야 함. |


### 예제

```json
{
  "file": "/absolute/path/inside/project/logo.png"
}
```

### 반환

텍스트 + structuredContent(data.assetId). 경로검증(경계/심링크/확장자) 후 임포트. 경계 밖이면 path 에러.

## `studio_import_model`

에셋 스토어(Asset Drawer)의 모델을 레벨에 임포트한다 (계층 보존). assetid 는 ovdrassetid://<숫자> 형식. 실패 시 자동 rollback. 지원 안 하면 capability 에러.

### 입력 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `assetid` | string | ✓ |  |
| `assetName` | string | ✓ | Asset Drawer 에 표시되는 자산 이름 |
| `assetType` | string |  | 현재 MODEL 만 지원 |


### 예제

```json
{
  "assetid": "ovdrassetid://12345",
  "assetName": "Tree",
  "assetType": "MODEL"
}
```

### 반환

텍스트 + structuredContent. 에셋 스토어 모델을 레벨에 임포트. 실패 시 자동 rollback. 미지원 시 capability 에러.

## `studio_publish`

월드를 OVERDARE 플랫폼에 공개한다. **비가역·외부공개.** 기본은 dry-run(미리보기). 실제 발사는 OVERDARE_ALLOW_PUBLISH=1 + confirm:true + dryRun:false 가 모두 충족돼야 한다. 하나라도 빠지면 RPC 를 호출하지 않는다.

### 입력 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `worldName` | string |  | 월드 이름(첫 publish 에만 반영) |
| `description` | string |  |  |
| `category` | array |  | 카테고리 태그(최대 3) |
| `keyword` | array |  | 검색 키워드(최대 5) |
| `confirm` | boolean |  | 실제 발사 확인(기본 false) |
| `dryRun` | boolean |  | true(기본)면 미리보기만 — RPC 미호출 |


### 예제

```json
{
  "worldName": "My World",
  "category": [
    "TPS"
  ],
  "confirm": false,
  "dryRun": true
}
```

### 반환

비가역. 기본 dry-run(미발사). 실제 발사는 OVERDARE_ALLOW_PUBLISH=1 + confirm:true + dryRun:false 4중 게이트 충족 시에만. 미충족이면 success:false + metadata.unmetGates.

## `studio_save`

편집 중인 월드를 파일로 저장한다 (RPC level.save.file). .umap 과 .ovdrjm 둘 다 갱신됨.

### 입력 스키마

_입력 없음._


### 예제

```json
{}
```

### 반환

텍스트(JSON). `{ success: true }`. .umap + .ovdrjm 저장.

## `studio_screenshot`

OVERDARE Studio 뷰포트 스크린샷을 캡처해 파일로 저장한다 (RPC game.screenshot, captureType=Viewport). 현재 Viewport 모드만 지원. 응답이 느릴 수 있어 타임아웃을 길게 잡는다.

### 입력 스키마

_입력 없음._


### 예제

```json
{}
```

### 반환

텍스트(JSON). Studio 가 저장한 스크린샷 결과(파일 경로 등).

## `studio_update_part`

기존 Part(또는 인스턴스)의 이름/속성을 수정한다. 쓰기 파이프라인(backup→modify→validate→level.apply→level.save.file)을 강제하며 실패 시 자동 rollback. 전달한 필드만 바뀌고 나머지는 보존된다(부분 업데이트). guid 는 studio_browse 로 확인. 속성: Size/CFrame(Position·Orientation)/Color/Material/Anchored/Transparency 등. name 으로 이름 변경.

### 입력 스키마

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `guid` | string | ✓ | 수정할 인스턴스 GUID |
| `name` | string |  | 새 이름 (이름 변경 시) |
| `properties` | object |  | 바꿀 속성만 (미지정 필드는 보존) |


### 예제

```json
{
  "guid": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01",
  "name": "RenamedPart",
  "properties": {
    "Color": {
      "R": 200,
      "G": 50,
      "B": 50
    },
    "Material": "Neon"
  }
}
```

### 반환

텍스트 + structuredContent(affected). 부분 업데이트(전달 필드만 변경). 실패 시 자동 rollback.
