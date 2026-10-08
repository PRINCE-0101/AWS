# Quick API examples

## Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"organizer@campusforge.local","password":"Builder@123"}'
```

Copy `accessToken` from the response.

## Create workshop

```bash
curl -X POST http://localhost:4000/api/workshops \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"AWS Builders Lab","description":"Event-driven systems","venue":"VIT Cloud Lab","startsAt":"2026-10-20T10:00:00.000Z","capacity":3}'
```

## List workshops

```bash
curl "http://localhost:4000/api/workshops?page=1&limit=10&search=AWS&sort=starts_at&order=asc"
```

## Register

```bash
curl -X POST http://localhost:4000/api/workshops/WORKSHOP_ID/register \
  -H "Authorization: Bearer STUDENT_ACCESS_TOKEN" \
  -H "Idempotency-Key: demo-registration-001"
```

## Cancel

```bash
curl -X DELETE http://localhost:4000/api/workshops/WORKSHOP_ID/register \
  -H "Authorization: Bearer STUDENT_ACCESS_TOKEN"
```
