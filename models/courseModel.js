const mongoose = require('mongoose');

const instructorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  bio: { type: String, default: '' }
});

const ratingSchema = new mongoose.Schema({
  average: { type: Number, default: 0 },
  count: { type: Number, default: 0 }
}, { _id: false });

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    enum: ['programming', 'design', 'business', 'marketing', 'data-science', 'other'],
    default: 'other'
  },
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  price: { type: Number, default: 0 },
  instructor: { type: instructorSchema, required: true },
  rating: { type: ratingSchema, default: () => ({}) }
}, { timestamps: true });

const Course = mongoose.model('Course', courseSchema);
module.exports = Course;
