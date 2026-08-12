require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');
const registerRoutes = require('./routes/registerRoutes');
const loginRoutes = require('./routes/loginRoutes');
const courseRoutes = require('./routes/courseRoutes');
const lessonRoutes = require('./routes/lessonRoutes');
const quizRoutes = require('./routes/quizRoutes');

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);

// Security middleware. Disable CSP for local development so browser/devtools requests
// are not blocked by overstrict headers.
//app.use(helmet({
 // crossOriginResourcePolicy: { policy: "cross-origin" },
  //contentSecurityPolicy: false,
//}));

// Enable CORS for your frontend origin
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Rate limiting to prevent brute force and DoS attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use(limiter);

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api/register', registerRoutes);
app.use('/api/login', loginRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/quizzes', quizRoutes);

// Serve uploaded PDF files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString() 
  });
});

// Respond to Chrome devtools well-known probe without triggering a 404
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(200).json({});
});

// Serve static files from the React/Vite build folder when the production bundle exists.
const frontendPath = path.resolve(__dirname, '../Dex Elearning/dist');

if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));

  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
} else {
  app.get(/^\/(?!api).*/, (req, res) => {
    res.status(404).json({
      message: 'Frontend build not found. Run the frontend build before deploying this app.',
      path: frontendPath,
    });
  });
}

// Global error handling middleware
app.use(errorHandler);

const portArg = process.argv[2];
const PORT = portArg || process.env.PORT || 5000;

console.log(`Starting backend with PORT=${PORT}, args=[${process.argv.slice(2).join(',')}], env.PORT=${process.env.PORT}`);

// Initialize Database Connection
connectDB();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port http://0.0.0.0:${PORT}`);
});