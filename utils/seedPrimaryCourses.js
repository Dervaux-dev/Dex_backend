require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Course = require('../models/courseModel');
const Lesson = require('../models/lessonModel');
const Quiz = require('../models/quizModel');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Dex_Elearning';
  await mongoose.connect(uri);
  console.log('MongoDB connected for seeding primary courses.');
};

const sampleCourses = [
  // Primary 1
  {
    title: 'Fun Math & Counting Essentials',
    description: 'Learn basic addition, subtraction, shapes, and numbers up to 100 with interactive visual games.',
    gradeLevel: 'Primary 1',
    category: 'mathematics',
    docsUrl:'',
    level: 'beginner',
    price: 0,
    thumbnailEmoji: '🔢',
    instructor: { name: 'Teacher Sarah', bio: 'Primary Math Educator' },
  },
  {
    title: 'Phonics & Reading Adventures',
    description: 'Master ABC phonics, word sounds, and simple sentences to build strong early reading skills.',
    gradeLevel: 'Primary 1',
    category: 'english',
    level: 'beginner',
    price: 0,
    thumbnailEmoji: '🔤',
    instructor: { name: 'Teacher Daniel', bio: 'Early Literacy Specialist' },
  },
  {
    title: 'Discovering My Body & Nature',
    description: 'Explore the 5 senses, body parts, animals, and healthy habits in a fun, colorful environment.',
    gradeLevel: 'Primary 1',
    category: 'science',
    level: 'beginner',
    price: 0,
    thumbnailEmoji: '🌿',
    instructor: { name: 'Teacher Grace', bio: 'Primary Science Enthusiast' },
  },

  // Primary 2
  {
    title: 'Math World: Addition & Tables',
    description: 'Practice 2-digit addition, basic subtraction, time reading, and simple multiplication tables.',
    gradeLevel: 'Primary 2',
    category: 'mathematics',
    level: 'beginner',
    price: 0,
    thumbnailEmoji: '➕',
    instructor: { name: 'Teacher Sarah', bio: 'Primary Math Educator' },
  },
  {
    title: 'Storytelling & Easy Grammar',
    description: 'Build confidence writing short stories, understanding nouns and verbs, and proper punctuation.',
    gradeLevel: 'Primary 2',
    category: 'english',
    level: 'beginner',
    price: 0,
    thumbnailEmoji: '📖',
    instructor: { name: 'Teacher Daniel', bio: 'Early Literacy Specialist' },
  },
  {
    title: 'Animals & Plant Habitats',
    description: 'Learn how living things grow, where wild animals live, and how plants make their own food.',
    gradeLevel: 'Primary 2',
    category: 'science',
    level: 'beginner',
    price: 0,
    thumbnailEmoji: '🦁',
    instructor: { name: 'Teacher Grace', bio: 'Primary Science Enthusiast' },
  },

  // Primary 3
  {
    title: 'Multiplication & Geometry Basics',
    description: 'Master multiplication tables, division basics, money calculations, and 2D/3D shape properties.',
    gradeLevel: 'Primary 3',
    category: 'mathematics',
    level: 'intermediate',
    price: 0,
    thumbnailEmoji: '📐',
    instructor: { name: 'Teacher Sarah', bio: 'Primary Math Educator' },
  },
  {
    title: 'Science Explorer: Matter & Energy',
    description: 'Investigate solid, liquid, gas states, magnetism, and basic energy sources around us.',
    gradeLevel: 'Primary 3',
    category: 'science',
    level: 'intermediate',
    price: 0,
    thumbnailEmoji: '⚡',
    instructor: { name: 'Teacher Grace', bio: 'Primary Science Enthusiast' },
  },
  {
    title: 'Creative Art & Drawing Studio',
    description: 'Learn color theory, drawing techniques, paper crafts, and expressing creativity.',
    gradeLevel: 'Primary 3',
    category: 'creative-arts',
    level: 'intermediate',
    price: 0,
    thumbnailEmoji: '🎨',
    instructor: { name: 'Teacher Leo', bio: 'Art & Design Instructor' },
  },

  // Primary 4
  {
    title: 'Fractions, Decimals & Measurement',
    description: 'Understand equivalent fractions, decimal basics, length, mass, and volume measurement units.',
    gradeLevel: 'Primary 4',
    category: 'mathematics',
    level: 'intermediate',
    price: 0,
    thumbnailEmoji: '📊',
    instructor: { name: 'Teacher Sarah', bio: 'Primary Math Educator' },
  },
  {
    title: 'Human Body Systems & Health',
    description: 'Explore the digestive system, circulatory system, nutrients, and keeping our bodies fit.',
    gradeLevel: 'Primary 4',
    category: 'science',
    level: 'intermediate',
    price: 0,
    thumbnailEmoji: '🩺',
    instructor: { name: 'Teacher Grace', bio: 'Primary Science Enthusiast' },
  },
  {
    title: 'Kids Coding & Computer Basics',
    description: 'Introduction to computer hardware, safe web browsing, and block-based programming concepts.',
    gradeLevel: 'Primary 4',
    category: 'ict',
    level: 'intermediate',
    price: 0,
    thumbnailEmoji: '💻',
    instructor: { name: 'Teacher Alex', bio: 'Tech Lead & Instructor' },
  },

  // Primary 5
  {
    title: 'Advanced Fractions & Problem Solving',
    description: 'Tackle percentage calculations, ratio concepts, area, perimeter, and multi-step word problems.',
    gradeLevel: 'Primary 5',
    category: 'mathematics',
    level: 'advanced',
    price: 0,
    thumbnailEmoji: '🧮',
    instructor: { name: 'Teacher Sarah', bio: 'Primary Math Educator' },
  },
  {
    title: 'Forces, Electricity & Cells',
    description: 'Discover how electrical circuits work, cell structure, gravity, friction, and environmental green energy.',
    gradeLevel: 'Primary 5',
    category: 'science',
    level: 'advanced',
    price: 0,
    thumbnailEmoji: '💡',
    instructor: { name: 'Teacher Grace', bio: 'Primary Science Enthusiast' },
  },
  {
    title: 'World Cultures & Social Studies',
    description: 'Explore world geography, continents, climates, ancient civilizations, and global citizenship.',
    gradeLevel: 'Primary 5',
    category: 'social-studies',
    level: 'advanced',
    price: 0,
    thumbnailEmoji: '🌍',
    instructor: { name: 'Teacher Mark', bio: 'Social Studies & Geography' },
  },

  // Primary 6
  {
    title: 'Primary 6 Math Mastery & Exam Prep',
    description: 'Comprehensive review of algebra basics, speed/time problems, circles, volume, and exam strategies.',
    gradeLevel: 'Primary 6',
    category: 'mathematics',
    level: 'advanced',
    price: 0,
    thumbnailEmoji: '🏆',
    instructor: { name: 'Teacher Sarah', bio: 'Primary Math Educator' },
  },
  {
    title: 'Advanced Science Investigations',
    description: 'Experimental methods, ecosystem food chains, forces in movement, and earth science phenomena.',
    gradeLevel: 'Primary 6',
    category: 'science',
    level: 'advanced',
    price: 0,
    thumbnailEmoji: '🔬',
    instructor: { name: 'Teacher Grace', bio: 'Primary Science Enthusiast' },
  },
  {
    title: 'Grammar, Essay Writing & Vocabulary',
    description: 'Master advanced comprehension, composition writing, idioms, and persuasive speech techniques.',
    gradeLevel: 'Primary 6',
    category: 'english',
    level: 'advanced',
    price: 0,
    thumbnailEmoji: '✍️',
    instructor: { name: 'Teacher Daniel', bio: 'Early Literacy Specialist' },
  },
];

const seed = async () => {
  try {
    await connectDB();

    console.log('Seeding Primary 1 - Primary 6 courses...');

    for (const item of sampleCourses) {
      let course = await Course.findOne({ title: item.title });
      if (!course) {
        course = await Course.create(item);
        console.log(`Created course: ${course.title} (${course.gradeLevel})`);
      }

      // Add a sample PDF lesson & AI quiz if not present
      let lesson = await Lesson.findOne({ course: course._id, chapter: 1 });
      if (!lesson) {
        lesson = await Lesson.create({
          course: course._id,
          chapter: 1,
          title: `Chapter 1: Foundations of ${course.title}`,
          pdfFile: `${course.title.replace(/\s+/g, '_')}_Ch1.pdf`,
          pdfPath: 'sample_lesson.pdf',
          summary: `• Key Concept 1: Welcome to ${course.title}!\n• Key Concept 2: Remember to review core vocabulary and practice daily exercises.\n• Key Concept 3: Complete the interactive quiz below to earn your chapter badge.`,
          rawText: `Welcome to ${course.title}. This chapter covers fundamental concepts designed specifically for ${course.gradeLevel} learners. Practice regularly to master this subject.`,
        });
        console.log(`Created lesson for: ${course.title}`);
      }

      let quiz = await Quiz.findOne({ lesson: lesson._id });
      if (!quiz) {
        await Quiz.create({
          lesson: lesson._id,
          course: course._id,
          title: `Chapter 1 Quiz - ${course.title}`,
          passingScore: 50,
          questions: [
            {
              question: `What grade level is this ${course.title} course designed for?`,
              options: [course.gradeLevel, 'University Level', 'Pre-school', 'High School'],
              correctIndex: 0,
            },
            {
              question: `What is the primary key to succeeding in ${course.category.toUpperCase()}?`,
              options: ['Daily practice and curiosity', 'Guessing answers', 'Skipping lessons', 'Never asking questions'],
              correctIndex: 0,
            },
            {
              question: 'Which of the following is true about this chapter?',
              options: [
                'It contains AI study summaries and chapter quizzes',
                'It has no lessons',
                'It is empty',
                'It requires a physical textbook',
              ],
              correctIndex: 0,
            },
          ],
        });
        console.log(`Created quiz for: ${course.title}`);
      }
    }

    console.log('🎉 Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
};

seed();
