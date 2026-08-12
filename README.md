# Dex E-Learning Backend

A comprehensive backend API for the Dex E-Learning platform built with Node.js, Express, and MongoDB.

## Features

- **User Management**: Registration, authentication, profile management
- **Course Management**: Create, update, enroll, and review courses
- **Quiz System**: Create quizzes with multiple question types, track results
- **Admin Panel**: Dashboard analytics, user/course management
- **Security**: JWT authentication, password hashing, rate limiting
- **Validation**: Input validation and sanitization
- **Error Handling**: Centralized error handling middleware

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Express Validator
- **Security**: Helmet, CORS, bcryptjs
- **Development**: Nodemon, Jest

## Project Structure

```
backend/
├── controllers/          # Route controllers
│   ├── adminController.js
│   ├── authController.js
│   ├── courseController.js
│   ├── quizController.js
│   └── userController.js
├── middleware/           # Custom middleware
│   ├── auth.js
│   └── errorHandler.js
├── models/              # MongoDB models
│   ├── Course.js
│   ├── Quiz.js
│   ├── Question.js
│   └── User.js
├── routes/              # API routes
│   ├── admin.js
│   ├── auth.js
│   ├── courses.js
│   ├── quizzes.js
│   └── users.js
├── utils/               # Utility functions
│   ├── jwt.js
│   └── validation.js
├── config/              # Configuration files
│   └── database.js
├── server.js            # Main server file
├── package.json
├── .env.example
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd dex-elearning/backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start MongoDB**
   Make sure MongoDB is running on your system or update the `MONGODB_URI` in `.env`

5. **Run the server**
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/change-password` - Change password

### Courses
- `GET /api/courses` - Get all courses (with filtering)
- `GET /api/courses/:id` - Get single course
- `POST /api/courses` - Create course (Instructor/Admin)
- `PUT /api/courses/:id` - Update course (Instructor/Admin)
- `DELETE /api/courses/:id` - Delete course (Instructor/Admin)
- `POST /api/courses/:id/enroll` - Enroll in course
- `POST /api/courses/:id/wishlist` - Add to wishlist
- `DELETE /api/courses/:id/wishlist` - Remove from wishlist
- `POST /api/courses/:id/reviews` - Add course review

### Quizzes
- `GET /api/quizzes/course/:courseId` - Get quizzes by course
- `GET /api/quizzes/:id` - Get single quiz
- `POST /api/quizzes` - Create quiz (Instructor/Admin)
- `PUT /api/quizzes/:id` - Update quiz (Instructor/Admin)
- `DELETE /api/quizzes/:id` - Delete quiz (Instructor/Admin)
- `POST /api/quizzes/:id/submit` - Submit quiz answers
- `GET /api/quizzes/:id/results` - Get quiz results

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/courses` - Get enrolled courses
- `PUT /api/users/courses/:courseId/progress` - Update course progress
- `GET /api/users/wishlist` - Get user wishlist
- `GET /api/users/quiz-results` - Get quiz results

### Admin (Admin only)
- `GET /api/admin/dashboard` - Dashboard statistics
- `GET /api/admin/courses` - All courses management
- `PUT /api/admin/courses/:id/status` - Update course status
- `GET /api/admin/quizzes` - All quizzes management
- `PUT /api/admin/quizzes/:id/status` - Update quiz status
- `GET /api/admin/analytics/users` - User analytics
- `GET /api/admin/analytics/courses` - Course analytics

## Data Models

### User
- Personal information (username, email, profile)
- Role-based access (student/admin)
- Course enrollments and progress
- Wishlist
- Quiz results

### Course
- Basic info (title, description, category, level)
- Instructor information
- Pricing and enrollment data
- Lessons and content
- Reviews and ratings

### Quiz
- Quiz configuration (time limit, passing score)
- Questions relationship
- Course association

### Question
- Multiple question types (multiple-choice, true-false, short-answer)
- Answer options and correct answers
- Points and explanations

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcryptjs for secure password storage
- **Rate Limiting**: Prevents brute force attacks
- **Input Validation**: Comprehensive validation using express-validator
- **CORS**: Configured for frontend integration
- **Helmet**: Security headers

## Development

### Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests

### Testing

```bash
npm test
```

### Code Style

- Use ESLint for code linting
- Follow consistent naming conventions
- Add JSDoc comments for functions

## Deployment

1. Set `NODE_ENV=production` in environment
2. Configure production MongoDB URI
3. Set secure JWT secrets
4. Configure CORS for production frontend URL
5. Use a process manager like PM2

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License.