import mongoose from 'mongoose'

const EmailBlockSchema = new mongoose.Schema({
  id: String,
  type: { type: String, required: true },
  emoji: String,
  title: String,
  subtitle: String,
  color: String,
  colorEnd: String,
  text: String,
  html: String,
  align: String,
  label: String,
  url: String,
  src: String,
  alt: String,
  heading: String,
  tagline: String,
  height: Number,
}, { _id: false })

const EmailTemplateSchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  templateType: {
    type: String,
    enum: ['product_notification', 'marketing'],
    default: 'product_notification',
  },
  name: { type: String, required: true },
  subject: { type: String, required: true },
  preheader: { type: String, default: '' },
  fontFamily: { type: String, default: 'helvetica' },
  template: { type: String, default: '' },
  blocks: { type: [mongoose.Schema.Types.Mixed], default: [] },
  category: { type: String, default: 'Custom' },
  sourcePresetId: { type: String, default: '' },
  placeholders: [{
    name: String,
    description: String,
  }],
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true })

EmailTemplateSchema.index({ storeId: 1, templateType: 1 });
EmailTemplateSchema.index({ storeId: 1, updatedAt: -1 });

export default mongoose.models.EmailTemplate || mongoose.model('EmailTemplate', EmailTemplateSchema)
