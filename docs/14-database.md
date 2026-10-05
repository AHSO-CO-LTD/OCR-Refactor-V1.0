# Database

## Ownership

PostgreSQL is owned by the NestJS backend. The frontend, Electron renderer, and
Device Tool must not query it directly. Prisma schema and committed migrations
are authoritative for structure.

## Main Domains

| Domain | Models |
| --- | --- |
| Identity | `User`, `Role`, `Permission`, `RolePermission`, `UserPermission` |
| Product setup | `Product`, `CameraIdentity`, `CameraConfig`, `RoiRegion` |
| Production | `InspectionJob`, `InspectionLog`, `LineResultSettings` |
| Test evidence | `TestSessionReport`, `TestSessionFailedImage`, `TestSessionFailedRoiResult` |
| PLC | `PlcConfig`, `PlcCustomKey` |
| License and audit | `LicenseLog`, `AuditLog` |
| Dongil live sync | `DongilSyncConfiguration`, `DongilMachineInfo`, `DongilProductAssignment`, `DongilSyncOutbox` |
| Dongil history | `DongilHistorySyncRun`, `DongilHistorySyncScope`, `DongilHistorySyncItem`, `DongilHistorySyncInvalidItem`, `DongilSyncWorkerLease` |

## Important Relationships

- Users belong to one fixed top-level role and may have an explicit permission set.
- Product code and name are unique.
- Each product may own one camera configuration and indexed ROI regions.
- Inspection jobs reference the starting operator and optionally the ending operator.
- Inspection logs are deleted with their inspection job.
- Test report failures are deleted with their parent test report.
- Dongil history run items and scopes are deleted with their run; production
  outbox records remain independent and are not deleted after synchronization.

`InspectionJob.productId` currently stores the product identifier without a
database foreign key. This preserves historical session data when product
records change, but integrity must be enforced by the application and reports
must tolerate a missing current product row.

## Singleton Configuration Rows

The following models use the stable ID `default`:

- `DongilSyncConfiguration`
- `DongilMachineInfo`
- `DongilSyncWorkerLease`
- `LineResultSettings`
- `PlcConfig`

Code should use upsert or an equivalent atomic path for these records.

## Migration Policy

- Development uses Prisma migration tooling from the backend workspace.
- Packaged startup runs `prisma migrate deploy` before the backend is opened.
- Installer bootstrap runs committed migrations and production seed data.
- Schema edits without a migration are not accepted.
- High-risk migrations require a database backup and an explicit recovery plan.
- Generated Prisma Client freshness must be checked before diagnosing missing
  models or enums as source defects.

## Seed Policy

Development seed creates `dev`, `admin`, `engineer`, and `operator` accounts
with the documented development password. Production seed creates only the
hidden support `dev` using an installer-generated password. The customer creates
the first active admin through `/setup`.

Seed also upserts the permission catalog and replaces role-permission mappings
with the repository defaults. Run it deliberately because reseeding can reset
role permission customization.

## Concurrency And Transactions

- Role permission replacement is transactional.
- Product profile and related camera/ROI writes use service-level transactions where required.
- Dongil outbox and history workers use durable states, stable IDs, a worker lease, and transactional checkpoints.
- First-admin creation and line-result initialization share a transaction.
- The last-active-admin protection currently performs count and mutation as
  separate operations; concurrent administrator changes require additional review.

## Data Retention

- Production inspection records are durable operational history.
- Dongil delivery never deletes the corresponding local record.
- Test report images may contain large base64 payloads in PostgreSQL; capacity
  and retention must be assessed on the target workstation.
- `LicenseLog` has no automatic retention implementation in the current source.
- Hard deletion of a product or user can be blocked by related records or can
  affect historical lookup. Production policy should prefer deactivation where available.

## Current Verification Status

Schema and migration files were inspected during the documentation refresh.
No live database, data distribution, migration deployment, backup, restore, or
constraint behavior was tested.
