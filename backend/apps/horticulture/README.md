# Horticulture Module

## API Endpoints
- `GET /api/horticulture/summary/`
  - Auth: required (`IsAuthenticated`)
  - Response: `zones`, `workers`, `tasks`
- `GET /horticulture/dashboard/`
  - Auth: required (`login_required`)
  - Access: `admin`, `horticulture_manager`

## Task Checklist
- [x] Horticulture app wiring in project routes
- [x] Core models for zones, areas, roads, seasons, task logs, attendance
- [x] Initial migration for horticulture schema
- [x] Seed command for horticulture base data
- [x] Dashboard page route with role validation
- [x] Summary API route and stub response
- [ ] CRUD APIs for masters and task logs
- [ ] Attendance submission APIs
- [ ] Frontend integration for horticulture APIs
