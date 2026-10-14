/**
 * Creates (or updates) the admin account stored in the separate `admins` collection.
 *
 *   npm run seed:admin
 *   ADMIN_ID_CARD=/full/path/to/id-card.jpg npm run seed:admin     (use your real ID card photo)
 *
 * Settings come from server/.env: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, ADMIN_REG_NUMBER,
 * ADMIN_PASSWORD and the optional ADMIN_ID_CARD. Safe to run again (it updates the same admin).
 *
 * If an admin created by the FIRST version of this project still sits inside `users`
 * (with role "admin"), it is moved to `admins` and keeps its id, so old audit-log entries and
 * "reviewed by" links stay valid.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { initIndexes } = connectDB;
const User = require('../models/User');
const Admin = require('../models/Admin');
const AppError = require('../utils/AppError');
const { parse, createAdminSchema } = require('../utils/validators');
const { saveIdCard, deleteIdCard } = require('../utils/fileStore');
const { detectImageType } = require('../utils/imageType');
const { createPlaceholderIdCard } = require('../utils/placeholderIdCard');
const { toRegKey } = require('../utils/regKey');
const { backfillRegKeys } = require('../utils/backfillRegKeys');

function readIdCard(idCardPath) {
  if (!idCardPath) return { buffer: createPlaceholderIdCard(), ext: 'png', placeholder: true };
  const resolved = path.resolve(idCardPath.replace(/^~(?=$|\/)/, os.homedir()));
  let buffer;
  try {
    buffer = fs.readFileSync(resolved);
  } catch {
    throw new AppError(`Cannot read the ID card photo at "${resolved}". Check the path.`, 400);
  }
  const ext = detectImageType(buffer);
  if (!ext) throw new AppError('The ID card file must be a JPG or PNG image.', 400);
  return { buffer, ext, placeholder: false };
}

async function seedAdmin(input = {}) {
  const data = parse(createAdminSchema, {
    name: input.name ?? 'WeReUse Admin',
    email: input.email ?? 'admin@wereuse.com',
    phone: input.phone ?? '01700000000',
    universityRegNumber: input.universityRegNumber ?? 'ADMIN-0001',
    password: input.password ?? 'Admin@12345',
  });

  // Raw driver calls on purpose: `role` no longer exists in the User schema, and Mongoose would
  // silently drop an unknown filter field (which could turn a delete into "delete everything").
  const legacy = await User.collection.findOne({ email: data.email, role: 'admin' });
  if (!legacy) {
    const student = await User.collection.findOne({ email: data.email });
    if (student) {
      throw new AppError(
        `A student account already uses ${data.email}. Choose a different ADMIN_EMAIL in server/.env.`,
        409
      );
    }
  }

  // One account per registration number: no OTHER student and no OTHER admin may hold it
  const regKey = toRegKey(data.universityRegNumber);
  const studentFilter = legacy ? { regKey, _id: { $ne: legacy._id } } : { regKey };
  if (await User.collection.findOne(studentFilter)) {
    throw new AppError(`A student already uses the registration number ${data.universityRegNumber}. Choose a different ADMIN_REG_NUMBER.`, 409);
  }
  if (await Admin.exists({ regKey, email: { $ne: data.email } })) {
    throw new AppError(`Another admin already uses the registration number ${data.universityRegNumber}.`, 409);
  }

  let admin = await Admin.findOne({ email: data.email }).select('+passwordHash');
  const passwordHash = await Admin.hashPassword(data.password);
  const result = { created: false, migrated: false, placeholderIdCard: false, admin: null };

  if (!admin) {
    const { buffer, ext, placeholder } = readIdCard(input.idCardPath);
    const filename = await saveIdCard(buffer, ext);
    const fields = {
      name: data.name,
      email: data.email,
      phone: data.phone,
      universityRegNumber: data.universityRegNumber,
      idCardImageUrl: filename,
      passwordHash,
    };
    if (legacy) fields._id = legacy._id; // keep the id => old logs / reviewedBy links still match
    try {
      admin = await Admin.create(fields);
    } catch (err) {
      await deleteIdCard(filename);
      throw err;
    }
    result.created = true;
    result.placeholderIdCard = placeholder;
  } else {
    admin.name = data.name;
    admin.phone = data.phone;
    admin.universityRegNumber = data.universityRegNumber;
    admin.passwordHash = passwordHash;
    admin.status = 'active';
    if (input.idCardPath) {
      const { buffer, ext } = readIdCard(input.idCardPath);
      const filename = await saveIdCard(buffer, ext);
      const old = admin.idCardImageUrl;
      admin.idCardImageUrl = filename;
      await admin.save();
      await deleteIdCard(old);
    } else {
      await admin.save();
    }
  }

  if (legacy) {
    await User.collection.deleteOne({ _id: legacy._id });
    result.migrated = true;
  }
  result.otherLegacyAdmins = await User.collection.countDocuments({ role: 'admin' });
  result.admin = await Admin.findById(admin._id);
  return result;
}

async function main() {
  try {
    await connectDB();
    await backfillRegKeys([
      { name: 'users', collection: User.collection },
      { name: 'admins', collection: Admin.collection },
    ]);
    await initIndexes([User, Admin]);

    const flag = process.argv.find((a) => a.startsWith('--id-card='));
    const result = await seedAdmin({
      name: process.env.ADMIN_NAME,
      email: process.env.ADMIN_EMAIL,
      phone: process.env.ADMIN_PHONE,
      universityRegNumber: process.env.ADMIN_REG_NUMBER,
      password: process.env.ADMIN_PASSWORD,
      idCardPath: flag ? flag.slice('--id-card='.length) : process.env.ADMIN_ID_CARD,
    });

    const a = result.admin;
    console.log(`\n${result.created ? 'Admin account created' : 'Admin account updated (password reset)'}.`);
    if (result.migrated) console.log('The old admin entry was moved from "users" to "admins" (same id kept).');
    console.log(`  name:     ${a.name}   [${a.adminBadge.label} badge, ${a.adminBadge.color}]`);
    console.log(`  email:    ${a.email}`);
    console.log(`  phone:    ${a.phone}`);
    console.log(`  reg no:   ${a.universityRegNumber}`);
    console.log(`  password: ${process.env.ADMIN_PASSWORD || 'Admin@12345'}`);
    if (result.placeholderIdCard) {
      console.log('\nNote: a PLACEHOLDER ID card image was stored. To use the real photo run:');
      console.log('  ADMIN_ID_CARD=/full/path/to/your-id-card.jpg npm run seed:admin');
    }
    if (result.otherLegacyAdmins) {
      console.log(`\nWarning: ${result.otherLegacyAdmins} other old admin entr${result.otherLegacyAdmins === 1 ? 'y' : 'ies'} still in "users". Delete them in Compass.`);
    }
    console.log('');
  } catch (err) {
    console.error(`\nSeeding failed: ${err.message}`);
    if (err.fieldErrors) Object.entries(err.fieldErrors).forEach(([k, v]) => console.error(`  - ${k}: ${v}`));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main();

module.exports = { seedAdmin };
