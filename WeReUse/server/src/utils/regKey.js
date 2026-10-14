/**
 * One account per university registration number.
 * "241-35-032", "24135032", "241/35/032" and "241 35 032" are all the SAME number, so they all
 * map to the same key (letters and digits only, upper case). The key is stored in `regKey`
 * (unique) and is what duplicates are detected with - not the text the person typed.
 */
const toRegKey = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

module.exports = { toRegKey };
