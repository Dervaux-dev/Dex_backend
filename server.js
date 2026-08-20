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
const userRoutes = require('./routes/userRoutes');
const courseRoutes = require('./routes/courseRoutes');
const lessonRoutes = require('./routes/lessonRoutes');
const quizRoutes = require('./routes/quizRoutes');
const adminRoutes = require('./routes/adminRoutes');
const Course = require('./models/courseModel');

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5000,https://dexelearning.vercel.app')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Security middleware. Disable CSP for local development so browser/devtools requests
// are not blocked by overstrict headers.
//app.use(helmet({
 // crossOriginResourcePolicy: { policy: "cross-origin" },
  //contentSecurityPolicy: false,
//}));

// Enable CORS for your frontend origin
app.use(cors({
  origin: (origin, callback) => {
    const normalizedOrigin = origin ? origin.replace(/\/+$/, '') : origin;
    if (!origin || allowedOrigins.includes(normalizedOrigin)) {
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
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/admin', adminRoutes);

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

// Dynamic sitemap.xml that includes real course URLs
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || 'https://dexelearning.vercel.app';

    // Static routes to include in the sitemap
    const staticUrls = [
      { loc: `${baseUrl}/`, changefreq: 'daily', priority: '1.00', lastmod: new Date() },
      { loc: `${baseUrl}/courses`, changefreq: 'weekly', priority: '0.90', lastmod: new Date() },
      { loc: `${baseUrl}/login`, changefreq: 'monthly', priority: '0.60', lastmod: new Date() },
      { loc: `${baseUrl}/register`, changefreq: 'monthly', priority: '0.60', lastmod: new Date() },
      { loc: `${baseUrl}/dashboard`, changefreq: 'weekly', priority: '0.85', lastmod: new Date() },
    ];

    // Fetch courses from DB and add each as a sitemap entry
    const courses = await Course.find().select('updatedAt createdAt');

    const courseUrls = courses.map((c) => {
      const last = (c.updatedAt || c.createdAt || new Date()).toISOString().split('T')[0];
      return {
        loc: `${baseUrl}/courses/${c._id}`,
        changefreq: 'monthly',
        priority: '0.70',
        lastmod: last,
      };
    });

    const urls = [...staticUrls.map(u => ({
      ...u,
      lastmod: (u.lastmod instanceof Date) ? u.lastmod.toISOString().split('T')[0] : u.lastmod
    })), ...courseUrls];

    // Build XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    urls.forEach(u => {
      xml += '  <url>\n';
      xml += `    <loc>${u.loc}</loc>\n`;
      if (u.lastmod) xml += `    <lastmod>${u.lastmod}</lastmod>\n`;
      if (u.changefreq) xml += `    <changefreq>${u.changefreq}</changefreq>\n`;
      if (u.priority) xml += `    <priority>${u.priority}</priority>\n`;
      xml += '  </url>\n';
    });
    xml += '</urlset>';

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    next(error);
  }
});

// Serve static files from the React/Vite build folder when the production bundle exists.
const frontendPath = path.resolve(__dirname, '../frontend/dist');

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