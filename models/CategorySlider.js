import mongoose from 'mongoose';

const CategorySliderSchema = new mongoose.Schema(
  {
    storeId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subtitle: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    titleAr: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    subtitleAr: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    productIds: {
      type: [String],
      required: true,
      default: [],
    },
    sideImage: {
      type: String,
      default: '',
      trim: true,
    },
    sideImagePosition: {
      type: String,
      default: 'left',
      enum: ['left', 'right'],
    },
    cardsPerRow: {
      type: Number,
      default: 6,
      enum: [5, 6],
    },
    backgroundColor: {
      type: String,
      default: '#f3f0ff',
      trim: true,
    },
    autoSlide: {
      type: Boolean,
      default: false,
    },
    autoSlideIntervalMs: {
      type: Number,
      default: 4000,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true }
);

// Create compound index for efficient querying
CategorySliderSchema.index({ storeId: 1, createdAt: -1 });

if (mongoose.models.CategorySlider && !mongoose.models.CategorySlider.schema.paths.sortOrder) {
  delete mongoose.models.CategorySlider;
}

if (mongoose.models.CategorySlider && !mongoose.models.CategorySlider.schema.paths.sideImagePosition) {
  delete mongoose.models.CategorySlider;
}

if (mongoose.models.CategorySlider && !mongoose.models.CategorySlider.schema.paths.backgroundColor) {
  delete mongoose.models.CategorySlider;
}

if (mongoose.models.CategorySlider && !mongoose.models.CategorySlider.schema.paths.autoSlide) {
  delete mongoose.models.CategorySlider;
}

if (mongoose.models.CategorySlider && !mongoose.models.CategorySlider.schema.paths.autoSlideIntervalMs) {
  delete mongoose.models.CategorySlider;
}

if (process.env.NODE_ENV === 'development' && mongoose.models.CategorySlider) {
  delete mongoose.models.CategorySlider;
}

export default mongoose.models.CategorySlider ||
  mongoose.model('CategorySlider', CategorySliderSchema);
