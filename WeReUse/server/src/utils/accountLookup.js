/** Duplicate checks that look in BOTH account collections (students and admins). */
const User = require('../models/User');
const Admin = require('../models/Admin');

const withExcept = (filter, id) => (id ? { ...filter, _id: { $ne: id } } : filter);

/** Is this e-mail already the login of a student or an admin? */
async function emailInUse(email, { exceptUserId, exceptAdminId } = {}) {
  const [student, admin] = await Promise.all([
    User.exists(withExcept({ email }, exceptUserId)),
    Admin.exists(withExcept({ email }, exceptAdminId)),
  ]);
  return Boolean(student || admin);
}

/** Does a student OR an admin already hold this university registration number (in any spelling)? */
async function regKeyInUse(regKey, { exceptUserId, exceptAdminId } = {}) {
  const [student, admin] = await Promise.all([
    User.exists(withExcept({ regKey }, exceptUserId)),
    Admin.exists(withExcept({ regKey }, exceptAdminId)),
  ]);
  return Boolean(student || admin);
}

module.exports = { emailInUse, regKeyInUse };
