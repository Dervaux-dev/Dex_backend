const mongoose = require('mongoose');

const instructorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  bio: { type: String, default: '' }
});

const ratingSchema = new mongoose.Schema({
  average: { type: Number, default: 4.8 },
  count: { type: Number, default: 12 }
}, { _id: false });

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  gradeLevel: {
    type: String,
    enum: ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'],
    default: 'Primary 1',
    required: true
  },
  category: {
    type: String,
    enum: ['mathematics', 'science', 'english', 'social-studies', 'creative-arts', 'ict', 'programming', 'french', 'kinyarwanda', 'music', 'physical-education', 'other'],
    default: 'mathematics'
  },
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  price: { type: Number, default: 0 },
  thumbnailEmoji: { type: String, default: '📚' },
  instructor: { type: instructorSchema, required: true },
  rating: { type: ratingSchema, default: () => ({ average: 4.8, count: 15 }) }
}, { timestamps: true });

const Course = mongoose.model('Course', courseSchema);
module.exports = Course;
