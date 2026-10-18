const mongoose = require('mongoose');
const Category = require('../models/Category');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const {
  parse,
  createCategorySchema,
  updateCategorySchema,
  listCategoriesSchema,
} = require('../utils/validators');

const DUPLICATE = 'A category with this name already exists.';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tidy = (name) => name.replace(/\s+/g, ' ').trim(); // "Lab   Equipment " -> "Lab Equipment"

const duplicateError = () => new AppError(DUPLICATE, 409, { code: 'DUPLICATE', errors: { name: DUPLICATE } });

const assertId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Category not found.', 404);
};

/** GET /api/admin/categories?status=all|active|disabled&search=  (READ - admin sees every category) */
exports.listCategories = asyncHandler(async (req, res) => {
  const { status, search } = parse(listCategoriesSchema, req.query);

  const filter = {};
  if (status === 'active') filter.isActive = true;
  if (status === 'disabled') filter.isActive = false;
  if (search) filter.nameKey = new RegExp(escapeRegex(tidy(search).toLowerCase()), 'i');

  const [categories, total, active] = await Promise.all([
    Category.find(filter).sort({ nameKey: 1 }),
    Category.countDocuments({}),
    Category.countDocuments({ isActive: true }),
  ]);

  res.json({
    success: true,
    data: { categories, counts: { total, active, disabled: total - active } },
  });
});

/** POST /api/admin/categories   { name, isActive? }   (CREATE) */
exports.createCategory = asyncHandler(async (req, res) => {
  const body = parse(createCategorySchema, req.body);
  const name = tidy(body.name);

  if (await Category.exists({ nameKey: Category.toNameKey(name) })) throw duplicateError();

  const category = await Category.create({ name, isActive: body.isActive ?? true });
  res.status(201).json({ success: true, message: 'Category created.', data: { category } });
});

/** PATCH /api/admin/categories/:id   { name?, isActive? }   (UPDATE: rename, enable, disable) */
exports.updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  assertId(id);
  const body = parse(updateCategorySchema, req.body);
  if (body.name === undefined && body.isActive === undefined) {
    throw new AppError('There is nothing to update.', 400, { code: 'NOTHING_TO_UPDATE' });
  }

  const category = await Category.findById(id);
  if (!category) throw new AppError('Category not found.', 404);

  const set = {};
  if (body.name !== undefined) {
    const name = tidy(body.name);
    const nameKey = Category.toNameKey(name);
    // another category (not this one) must not already have that name
    if (await Category.exists({ nameKey, _id: { $ne: category._id } })) throw duplicateError();
    set.name = name;
    set.nameKey = nameKey;
  }
  if (body.isActive !== undefined) set.isActive = body.isActive;

  await Category.updateOne({ _id: category._id }, { $set: set }, { runValidators: true });
  const updated = await Category.findById(category._id);
  res.json({ success: true, message: 'Category updated.', data: { category: updated } });
});

/** DELETE /api/admin/categories/:id   (DELETE) */
exports.deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  assertId(id);

  const category = await Category.findById(id);
  if (!category) throw new AppError('Category not found.', 404);

  // When the listings module exists (a model named "Listing" with a "category" field that holds the
  // category's _id), a category that is still in use cannot be deleted - it can be disabled instead.
  const Listing = mongoose.models.Listing;
  if (Listing && (await Listing.exists({ category: category._id }))) {
    throw new AppError('This category is used by listings, so it cannot be deleted. Disable it instead.', 409, {
      code: 'CATEGORY_IN_USE',
    });
  }

  await Category.deleteOne({ _id: category._id });
  res.json({ success: true, message: `Category "${category.name}" deleted.` });
});

/** GET /api/categories - the ACTIVE categories, for any logged-in user (listing forms and filters) */
exports.listActiveCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort({ nameKey: 1 });
  res.json({ success: true, data: { categories } });
});