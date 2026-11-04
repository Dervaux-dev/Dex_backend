# Dex E-Learning Backend

Node.js/Express API for Dex E-Learning, a learning platform for primary-school courses. It provides account and administrator management, course enrollment, PDF-backed lessons, learner progress, quizzes, and AI-assisted study materials. MongoDB stores platform data; uploaded PDFs are stored on disk.

## Features

- User registration, login, profile and password management, password reset by email, and role-based administrator access.
- Course discovery by grade, enrollment, and progress tracking across lessons and quizzes.
- Admin tools for managing users, courses, enrollments, lessons, and quizzes.
- PDF lesson uploads with text extraction, summaries, structured study notes, course outlines, and multiple-choice quizzes.
- Gemini and Anthropic AI provider support, with local NLP fallbacks for summaries, study notes, and quizzes when providers are unavailable.
- JWT authentication, request validation, rate limiting, Helmet security headers, CORS allowlisting, compressed responses, and centralized error handling.
- REB Primary 1–6 structured curriculum import utilities.

## Technology

- **Runtime:** Node.js 20 (also the Docker base image)
- **HTTP:** Express 4
- **Database:** MongoDB with Mongoose 7
- **Authentication:** JWT (`jsonwebtoken`) and `bcryptjs`
- **Other key packages:** Multer (PDF uploads), `pdf-parse` (PDF text extraction), `@google/genai` (Gemini), Nodemailer (SMTP email), `express-validator`

## Project layout

```text
.
├── config/        MongoDB connection configuration
├── controllers/   API request handlers for accounts, courses, lessons, quizzes, and administration
├── middleware/    Authentication, role checks, and error handling
├── models/        Mongoose schemas for users, courses, enrollments, lessons, and quizzes
├── routes/        Express route definitions mounted under /api
├── services/      PDF processing, AI generation, and email delivery
├── uploads/       PDF files used by lessons (runtime storage; persist this directory when deploying)
├── utils/         Validation, JWT/progress helpers, curriculum import and maintenance scripts
├── server.js      Express app setup, route mounting, health check, and server startup
├── package.json   Dependencies and npm scripts
└── Dockerfile     Node 20 Alpine container definition
```

### Request flow

`server.js` configures security, CORS, compression, rate limits, JSON/form parsing, and mounts route modules. Routes apply authentication and administrator authorization as appropriate before calling controllers. Controllers use Mongoose models for persistence and delegate PDF handling, AI generation, and email delivery to `services/`. Lesson uploads extract text and generate content; quiz attempts are graded and feed into enrollment progress.

## Requirements

- Node.js 20 or later and npm.
- MongoDB, local or hosted, accessible through `MONGODB_URI`.
- Optional provider credentials for AI generation and SMTP credentials for password-reset email.

## Quick start

```bash
git clone https://github.com/Dervaux-dev/Dex_backend.git
cd Dex_backend
npm install
cp .env.example .env
```

Edit `.env` and set at minimum a reachable `MONGODB_URI`, a strong unique `JWT_SECRET`, and `CORS_ORIGIN` to the frontend origin(s). Then start the API:

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

The default port is `5000`; override it with `PORT` or pass a port as a `server.js` argument. The server binds to `0.0.0.0`. Check availability at `GET /api/health`.

## Environment variables

Copy `.env.example` to `.env`. Never commit real secrets or put backend provider keys in frontend code.

| Variable | Purpose | Notes |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment | Set to `production` in production deployments. |
| `PORT` | HTTP port | Defaults to `5000`. |
| `MONGODB_URI` | MongoDB connection string | Defaults to `mongodb://localhost:27017/Dex_Elearning`. |
| `JWT_SECRET` | Signs and verifies access tokens | Set a long, random secret; required in production. |
| `JWT_EXPIRE` | Access-token lifetime setting | Example in template: `7d`. |
| `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRE` | Refresh-token settings | Present in the template; confirm usage before relying on them. |
| `CORS_ORIGIN` | Comma-separated allowed browser origins | Defaults in `server.js` include local frontend origins and the deployed Dex frontend. Set this to your frontend origin(s). |
| `FRONTEND_URL` | Frontend base URL used by generated sitemap entries | Defaults to the deployed Dex frontend URL. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini lesson-content generation | Optional; model defaults to `gemini-3.6-flash`. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Optional Anthropic content generation | Model defaults to `claude-sonnet-5-5`. Keep the key on the backend. |
| `ANTHROPIC_WORKSPACE_ID` | Anthropic workspace-scoped key support | Optional; used when set. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | SMTP password-reset email delivery | Email sending requires host, user, and password. Use provider SMTP credentials, not an account password. |
| `APP_URL` | Frontend base URL for password-reset links | Configure for the deployed frontend. |
| `MAX_FILE_SIZE`, `FILE_UPLOAD_PATH` | Upload-related template settings | The lesson upload route currently enforces its Multer limit in code (25 MiB) and stores files in `uploads/`. |
| `BCRYPT_ROUNDS` | Password-hashing template setting | Registration currently hashes with a fixed value in its controller; verify behavior before expecting this variable to change it. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULLNAME` | Initial admin bootstrap | Used by `npm run seed:admin`; set only when running the bootstrap script. |

AI provider keys are optional for the local fallback paths. An Anthropic provider explicitly selected without `ANTHROPIC_API_KEY` returns a configuration error. Scanned/image-only PDFs need OCR before upload; `pdf-parse` extracts selectable text only.

## API

All API routes use the `/api` prefix. Unless stated otherwise, protected routes require `Authorization: Bearer <JWT>`. Administrator routes require an authenticated user with the `admin` role. JSON request and response bodies are used except for multipart PDF uploads and the XML sitemap.

### Health and discovery

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Health status and timestamp. |
| `GET` | `/sitemap.xml` | Public | Sitemap using `FRONTEND_URL` and courses from MongoDB. |

### Authentication and account

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/register` | Public | Register an account. |
| `POST` | `/api/login` | Public | Log in with an identifier and password. |
| `POST` | `/api/auth/forgot-password` | Public, rate-limited | Request a password-reset email. Requires SMTP configuration. |
| `POST` | `/api/auth/reset-password` | Public | Reset a password using the emailed token. |
| `GET` | `/api/users/profile` | Authenticated | Get the current user's profile. |
| `PUT` | `/api/users/profile` | Authenticated | Update the current user's profile. |
| `PUT` | `/api/users/change-password` | Authenticated | Change the current user's password. |

### Courses and enrollment

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/courses` | Public | List courses; supports `limit`, `sort`, `category`, and `gradeLevel` query parameters. |
| `GET` | `/api/courses/by-grade` | Public | List courses grouped by Primary 1–6. |
| `GET` | `/api/courses/:id` | Public | Get a course. |
| `GET` | `/api/courses/enrolled` | Authenticated | List the current user's enrollments. |
| `POST` | `/api/courses/:id/enroll` | Authenticated | Enroll the current user in a course. |
| `POST` | `/api/courses` | Admin | Create a course. |
| `PUT` | `/api/courses/:id` | Admin | Update a course. |
| `DELETE` | `/api/courses/:id` | Admin | Delete a course. |

### Lessons

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/lessons/course/:courseId` | Authenticated | Get a course's lessons and the current user's lesson/quiz progress. |
| `GET` | `/api/lessons/:id` | Authenticated | Get lesson details, excluding extracted raw text. |
| `GET` | `/api/lessons/:id/pdf` | Authenticated | Retrieve or redirect to the lesson PDF. |
| `POST` | `/api/lessons/:id/complete` | Authenticated | Mark a lesson complete; send `{ "toggle": true }` to unmark an already-completed lesson. |
| `POST` | `/api/lessons/upload` | Admin, multipart | Upload a PDF lesson. File field: `pdf`; form fields include `courseId`, `chapter`, `title`, optional `pdfUrl`, and optional `aiProvider` (`gemini` or `anthropic`). |

PDF uploads are stored under `uploads/` and are served behind authentication. A `pdfUrl` is stored as an external reference; it is not downloaded or parsed by the upload handler.

### Quizzes

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/quizzes/lesson/:lessonId` | Authenticated | Get a lesson quiz without correct-answer indices. |
| `GET` | `/api/quizzes/lesson/:lessonId/results` | Authenticated | Get the current user's quiz attempts and best attempt. |
| `POST` | `/api/quizzes/bulk-status` | Authenticated | Check quiz availability for a `lessonIds` array. |
| `POST` | `/api/quizzes/:id/submit` | Authenticated | Submit an `answers` array and receive score, feedback, and updated course progress. |
| `POST` | `/api/quizzes/create` | Admin | Generate a quiz for a lesson; body requires `lessonId`, with optional `title` and `passingScore`. |
| `GET` | `/api/quizzes/admin/:id` | Admin | Get quiz details, including correct answers. |
| `PUT` | `/api/quizzes/:id` | Admin | Update quiz questions, title, or passing score. |

### Administration

All `/api/admin` endpoints require admin authorization.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/admin/stats` | Dashboard statistics. |
| `GET` | `/api/admin/users` | List users. |
| `GET` | `/api/admin/users/:id` | Get a user. |
| `POST` | `/api/admin/users` | Create a user. |
| `PUT` | `/api/admin/users/:id` | Update a user. |
| `DELETE` | `/api/admin/users/:id` | Delete a user. |
| `GET` | `/api/admin/courses` | List courses for administration. |
| `GET` | `/api/admin/enrollments` | List enrollments. |

## AI and PDF lesson workflow

1. An administrator uploads a PDF to `POST /api/lessons/upload` or supplies an external PDF reference.
2. For uploaded PDFs, `services/pdfService.js` extracts selectable text, strips common page artifacts, and computes reading statistics.
3. `services/aiService.js` can create a course outline and generate a lesson summary, study notes, and quiz with Gemini or Anthropic. Local extractive/NLP implementations are available as fallbacks for lesson content.
4. The lesson and generated quiz are saved in MongoDB. Extracted `rawText` is not included in student lesson responses.

PDF upload size is limited to 25 MiB by the route's Multer configuration. Image-only/scanned documents need OCR outside this flow. Configure `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` in the backend environment to use the corresponding hosted provider.

## Curriculum and data utilities

The package scripts include administrator/course/PDF/quiz seeders, quiz repair, study-note backfill, and a structured REB curriculum importer:

```bash
npm run seed:admin
npm run seed:courses
npm run seed:pdfs
npm run seed:quizzes
npm run fix:quizzes
npm run notes:backfill
```

The structured importer expects a curriculum `manifest.json`, structured JSON files, and source PDFs under `pdfs/primary` relative to the workspace by default. Set `REB_PRIMARY_ROOT` to change that location. It previews changes by default; `--apply` connects to MongoDB and writes data.

```bash
# Dry run (default): inspect one book
npm run import:structured -- --grade P1 --subject english

# Import the pilot book
npm run import:structured -- --grade P1 --subject english --apply

# Import all available REB Pupil Books
npm run import:structured -- --all-books --apply
```

The importer is designed to add curriculum records without replacing unrelated courses, lessons, quizzes, or learner progress. Use `--refresh-owned` only when intentionally refreshing records owned by this importer.

## Tests

Run the Jest suite with:

```bash
npm test
```

Tests are colocated with service and utility modules (for example, `services/aiService.test.js`, `services/pdfService.test.js`, and `utils/importStructuredPrimary.test.js`).

## Docker

The repository includes a Node 20 Alpine Dockerfile. Build and run the API with MongoDB and environment variables configured outside the image:

```bash
docker build -t dex-backend .
docker run --rm -p 5000:5000 \
  -e MONGODB_URI='mongodb://host.docker.internal:27017/Dex_Elearning' \
  -e JWT_SECRET='replace-with-a-long-random-secret' \
  -e CORS_ORIGIN='http://localhost:5173' \
  dex-backend
```

The container needs access to a MongoDB service. For persistent lesson PDFs, mount persistent storage at the application's `/usr/src/app/uploads` directory. No Docker Compose file is included.

## Deployment notes

- Set production secrets (`JWT_SECRET`, database credentials, and any provider/SMTP keys) through the hosting platform's secret/environment settings.
- Set `CORS_ORIGIN` to the exact comma-separated frontend origins allowed to call the API, and set `FRONTEND_URL` / `APP_URL` to the public frontend URL.
- Persist `uploads/` or use another durable file-storage strategy; local container filesystems may be ephemeral.
- The server can serve a built frontend if it finds `../Dex_frontend/dist`, `../frontend/dist`, `./dist`, or `../dist`; otherwise non-API paths return a frontend-build-not-found response.
- The `/uploads` static mount requires authentication. Keep the database and uploaded files backed up according to your deployment's recovery needs.

## License

ISC. See `package.json`.
