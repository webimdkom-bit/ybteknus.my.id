# Database

## Tenant Model

Every tenant-scoped document stores `organizationId`. Operational documents also
store `businessId`. A user has one profile in `users/{uid}` and can have several
business memberships through `memberships/{membershipId}`.

```text
users/{uid}
organizations/{organizationId}
businesses/{businessId}
memberships/{membershipId}
registrations/{registrationId}
attendance/{attendanceId}
tasks/{taskId}
notifications/{notificationId}
auditLogs/{auditId}
```

## Core Documents

### `users/{uid}`

```js
{
  uid,
  displayName,
  email,
  phone,
  role: "owner" | "admin" | "employee",
  status: "active" | "pending" | "suspended",
  organizationId,
  businessIds: [],
  createdAt,
  updatedAt
}
```

### `organizations/{organizationId}`

```js
{
  name,
  ownerId,
  status: "active" | "suspended",
  createdAt,
  updatedAt
}
```

### `businesses/{businessId}`

```js
{
  organizationId,
  name,
  slug,
  city,
  status: "active" | "inactive",
  acceptingRegistrations,
  location: { name, latitude, longitude, radiusMeters },
  createdAt,
  updatedAt
}
```

### `memberships/{membershipId}`

```js
{
  userId,
  organizationId,
  businessId,
  role: "admin" | "employee",
  permissions: [],
  status: "active" | "pending" | "suspended",
  createdAt,
  updatedAt
}
```

### `shifts/{shiftId}`

```js
{
  organizationId,
  businessId,
  name,
  startTime: "08:00",
  endTime: "17:00",
  breakMinutes,
  toleranceMinutes,
  workDays: ["monday", "tuesday"],
  status: "active",
  createdAt,
  updatedAt
}
```

### `schedules/{scheduleId}`

```js
{
  organizationId,
  businessId,
  userId,
  shiftId,
  date: "2026-11-21",
  effectiveFrom,
  status: "active",
  assignedBy,
  createdAt,
  updatedAt
}
```

Attendance calculations retain both `actualLateMinutes` and
`lateAfterToleranceMinutes`. Schedule changes use new records and effective dates;
they never rewrite historical attendance.

## Rules

The client must never trust a role or organization selector from the browser.
Firestore Rules remain the final authorization boundary. Historical records keep
their original `organizationId` and `businessId` when a person moves businesses.
