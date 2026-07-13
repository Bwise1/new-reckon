# Sync layer rebuild

## Why

The current sync layer has repeatedly failed cross-device and cross-browser tests. Root cause: the app shoves the entire project state into one `project_web_data.payload` JSON column and races clients on a `since`-timestamp filter with a 3s debounce. Every fix has been a workaround for a symptom.

Symptoms seen: plans not deleting, disciplines not persisting, measurements wiped on cache clear, empty pushes overwriting good data, calibrations not surviving reload on the same browser. All trace back to "there is no clear source of truth."

## New model

Server-authoritative, per-entity REST. Client is a thin cache.

### Server tables

**`project_calibrations`**

| column | type | notes |
|---|---|---|
| id | INT PK AUTO_INCREMENT | |
| project_id | INT FK projects(id) ON DELETE CASCADE | |
| plan_client_uuid | VARCHAR(36) | app-enforced FK to project_plans |
| page | INT | 1-based page number within the plan |
| scale_pixels_per_meter | DOUBLE | image-pixel space |
| p1_x, p1_y, p2_x, p2_y | DOUBLE | image-pixel coordinates of the calibration line |
| distance_meters | DOUBLE | user-entered real-world distance |
| created_at, updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP NULL | soft delete |
| UNIQUE KEY (project_id, plan_client_uuid, page) | | one calibration per plan+page |

**`project_measurements`**

| column | type | notes |
|---|---|---|
| id | INT PK AUTO_INCREMENT | |
| project_id | INT FK projects(id) ON DELETE CASCADE | |
| plan_client_uuid | VARCHAR(36) | which plan the measurement lives on |
| takeoff_item_client_uuid | VARCHAR(36) | groups measurements into TakeoffItems client-side |
| client_uuid | VARCHAR(36) UNIQUE | measurement identity |
| page | INT | which page of the plan |
| type | ENUM('linear','polyline','area','count') | |
| color | VARCHAR(9) | e.g. `#f2b134` |
| points | JSON | `[{x, y}, ...]` in image-pixel space |
| quantity | DOUBLE | in meters or m² depending on type |
| hidden | TINYINT(1) NOT NULL DEFAULT 0 | client visibility toggle |
| metadata | JSON NULLABLE | `{createdAt, lastModified, confidence}` |
| created_at, updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP NULL | soft delete |
| INDEX (project_id, plan_client_uuid) | | |

### Endpoints

All under `/projects/:projectId/`, auth-scoped through `projects.user`.

```
GET    /calibrations                            -> Calibration[]
PUT    /calibrations/:planUuid/:page            -> Calibration     (upsert)
DELETE /calibrations/:planUuid/:page            -> 204

GET    /measurements                            -> Measurement[]
POST   /measurements                            -> Measurement     (client sends client_uuid; server upserts on conflict)
PATCH  /measurements/:clientUuid                -> Measurement     (partial: points, quantity, color, hidden)
DELETE /measurements/:clientUuid                -> 204
```

### Deprecated

- `project_web_data` table — stops receiving writes.
- `POST /projects/sync/web-data/push` — remove after client cutover.
- `GET /projects/sync/web-data/pull` — remove after client cutover.

## Client

### Kill list

- `src/services/projectSync.service.ts` (entire file)
- `sync.service.ts` push/pull functions for web-data
- Client-side `deletedPlanIds` tombstones (real DELETE now works)
- `since` timestamp gymnastics in `projectMeta`
- Schema-version wipe logic (still keep the store's own image-pixel migration on legacy localStorage)
- The debounced `scheduleProjectSyncPush` / `flushProjectSyncPush`
- `triggerAutoSave` in the store (localStorage save stays — it's just no longer a sync trigger)

### New: `src/services/entitySync.service.ts`

Thin per-entity CRUD wrappers around `apiClient`:

```ts
export const calibrationSync = {
  list: (projectId) => apiClient.get(`/projects/${projectId}/calibrations`),
  upsert: (projectId, planUuid, page, body) => apiClient.put(...),
  delete: (projectId, planUuid, page) => apiClient.delete(...),
};

export const measurementSync = {
  list: (projectId) => apiClient.get(`/projects/${projectId}/measurements`),
  create: (projectId, body) => apiClient.post(...),
  update: (projectId, clientUuid, patch) => apiClient.patch(...),
  delete: (projectId, clientUuid) => apiClient.delete(...),
};
```

### New: `src/services/syncQueue.ts`

In-memory op queue that persists to localStorage under `reckon_sync_queue_${projectId}`. Op shape:

```ts
type Op =
  | { kind: 'measurement.create'; projectId; body }
  | { kind: 'measurement.update'; projectId; clientUuid; patch }
  | { kind: 'measurement.delete'; projectId; clientUuid }
  | { kind: 'calibration.upsert'; projectId; planUuid; page; body }
  | { kind: 'calibration.delete'; projectId; planUuid; page };
```

Dedup rules:
- Two `measurement.update` ops on the same clientUuid → merged (patch overlay).
- `measurement.create` followed by `measurement.delete` on the same uuid → both dropped.
- `measurement.update` on a uuid pending create → merged into the create.
- `calibration.upsert` on the same planUuid+page → latest wins.

Drain: fires ops sequentially, retries with exponential backoff on 5xx, drops on 4xx (with warning). No `since` filtering — just replay.

### New: `src/hooks/useProjectData.ts`

Replaces `useProjectSync`. On project mount:
1. Fetch `plans`, `calibrations`, `measurements` in parallel.
2. Populate Zustand store (see mapping below).
3. Start queue drainer.
4. On unmount, `await queue.flush()`.

### Store changes

Every mutation function is a two-step: update local state, enqueue op.

| Store action | Op enqueued |
|---|---|
| `addMeasurement(itemId, m)` | `measurement.create` (with `takeoff_item_client_uuid=itemId`) |
| `removeMeasurement(itemId, mId)` | `measurement.delete` |
| `updateMeasurement(...)` (drag, rename, etc.) | `measurement.update` |
| `toggleMeasurementHidden(...)` | `measurement.update` (patch: `{hidden}`) |
| `setScale(page, scale)` + `setCalibrationLine(page, line)` | `calibration.upsert` |
| Plan CRUD | already REST (unchanged) |

Drop: `applyServerSync`, `triggerAutoSave` (localStorage save happens as a side effect of mutations, but no sync push scheduling).

### Bootstrapping

On first load per session, `useProjectData`:
- Fetch server state → replace store.
- Read persisted queue → drain any pre-existing ops.
- After that, all mutations enqueue + drain live.

### What we keep

- `plan.service.ts` and its GET/POST/PATCH/DELETE (unchanged).
- Local PDF cache (`planPdfCache.ts`).
- BOQ sync path (`syncService.pullBoq/pushBoq`) — separate concern, works.
- ConfirmDialog, dark sidebar, everything UI.

## Migration & rollout

1. Backend migrations for the two new tables. Old `project_web_data` untouched.
2. Backend models + routes + controllers for the new endpoints.
3. Backend smoke test with curl.
4. Client-side sync queue + entity CRUD (not wired to store yet).
5. Client cutover: store mutations enqueue; useProjectData replaces useProjectSync.
6. Rip out `projectSync.service.ts`, tombstones, schema wipes.
7. Test cross-browser: draw on Brave → reload Chrome → measurements appear.
8. Later: drop `project_web_data` table after confidence.

## Not in this rebuild

- Realtime collaboration (websockets/SSE). The per-entity endpoints are collab-ready; add a channel later.
- Undo/redo across devices. Local undo continues to work; distributed undo needs a separate model.
- Conflict resolution beyond last-write-wins per entity.
- Migrating existing `project_web_data` blobs into the new tables. Pre-production data; users re-do work.
