const mongoose = require('mongoose');

const { Schema } = mongoose;

// "  Lab   Equipment " and "lab equipment" are the SAME category name
const toNameKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const categorySchema = new Schema(
{
    name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    minlength: 2,
    maxlength: 50,
    },
    // Lower-case version of the name. UNIQUE, so two categories can never differ only by capital letters.
    nameKey: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true }, // an admin can disable a category without deleting it
},
{
    timestamps: true,
    toJSON: {
    virtuals: true,
    versionKey: false,
    transform(doc, ret) {
        delete ret._id;
        delete ret.nameKey;
        return ret;
    },
    },
}
);

categorySchema.pre('validate', function setNameKey() {
if (this.name) this.nameKey = toNameKey(this.name);
});

categorySchema.statics.toNameKey = toNameKey;

module.exports = mongoose.model('Category', categorySchema);