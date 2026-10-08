// Populates data/db.json with a demo admin, demo users, a realistic spread of
// lost/found reports and a few claims, so the feed and dashboards are not empty
// for a demo or screenshots. Dates are relative to "today" so the data always
// looks recent.
//
// !! This WIPES the existing database first. Never run it on real data. !!
//
// Usage: npm run seed

require('dotenv').config({ path: '.env2' });
const bcrypt = require('bcryptjs');
const { resetDB, createUser, createItem, createClaim, updateItem } = require('./utils/db');
const { verificationTier } = require('./utils/constants');
const { officeToday } = require('./services/itemService');
const { officeNow } = require('./services/claimService');

function daysAgo(n) {
  const d = new Date(`${officeToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Next weekday (Mon-Fri) at least `offset` days from today, as YYYY-MM-DD.
function nextWeekday(offset) {
  const d = new Date(`${officeNow().date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  resetDB();

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@bpsu.edu.ph').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  const admin = createUser({
    name: process.env.ADMIN_NAME || 'BPSU Lost and Found Admin',
    email: adminEmail,
    studentId: null,
    passwordHash: await bcrypt.hash(adminPassword, 10),
    role: 'admin',
  });

  const demoHash = await bcrypt.hash('Demo@1234', 10);
  const mk = (name, email, studentId, role) => createUser({ name, email, studentId, passwordHash: demoHash, role });
  const maria = mk('Maria Santos', 'maria.santos@bpsu.edu.ph', '22-10234', 'student');
  const juan = mk('Juan Dela Cruz', 'juan.delacruz@bpsu.edu.ph', '21-08871', 'student');
  const prof = mk('Prof. Ana Reyes', 'ana.reyes@bpsu.edu.ph', null, 'faculty');

  const sample = [
    {
      type: 'lost', title: 'Black North Face backpack', category: 'Bags', status: 'lost',
      description: 'Lost near the library entrance. Contains a laptop charger and a blue notebook.',
      location: 'Main Library, ground floor entrance', date: daysAgo(2), time: '15:30',
      additionalDetails: 'Has a small yellow keychain on the zipper.', contactInfo: '0917-123-4567', by: maria,
    },
    {
      type: 'found', title: 'Silver iPhone with cracked screen protector', category: 'Electronics', status: 'found',
      description: 'Found on a bench outside the CICT building. Lock screen shows a dog wallpaper.',
      location: 'CICT Building, outdoor benches', date: daysAgo(3), time: '10:15',
      additionalDetails: 'Turned in to the guard at the main gate.', contactInfo: 'juan.delacruz@bpsu.edu.ph', by: juan,
    },
    {
      type: 'lost', title: 'BPSU student ID — Dela Cruz, Juan', category: 'ID / Cards', status: 'returned',
      description: 'Dropped somewhere between the gymnasium and the parking lot during intramurals.',
      location: 'Gymnasium to parking lot', date: daysAgo(9), time: null,
      additionalDetails: null, contactInfo: 'juan.delacruz@bpsu.edu.ph', by: juan,
    },
    {
      type: 'found', title: 'Set of keys with a maroon lanyard', category: 'Keys', status: 'pending_verification',
      description: 'Found on the floor of Room 204 after a Thursday afternoon class.',
      location: 'Room 204, Engineering Building', date: daysAgo(1), time: '16:40',
      additionalDetails: null, contactInfo: 'ana.reyes@bpsu.edu.ph', by: prof,
    },
    {
      type: 'lost', title: 'Scientific calculator (Casio fx-991)', category: 'Electronics', status: 'claimed',
      description: 'Left on a table in the canteen during lunch break. Has "M. Santos" written on the back.',
      location: 'University Canteen', date: daysAgo(6), time: '12:20',
      additionalDetails: null, contactInfo: 'maria.santos@bpsu.edu.ph', by: maria,
    },
    {
      type: 'found', title: 'Blue umbrella', category: 'Other', status: 'found',
      description: 'Left behind in a lecture hall after heavy rain last week.',
      location: 'Lecture Hall B, Admin Building', date: daysAgo(4), time: null,
      additionalDetails: null, contactInfo: null, by: admin,
    },
    {
      type: 'found', title: 'Grey hoodie with BPSU patch', category: 'Clothing', status: 'found',
      description: 'Medium-size grey hoodie with a small BPSU patch on the sleeve, folded on a chair.',
      location: 'CAS Building, Room 101', date: daysAgo(5), time: '09:00',
      additionalDetails: null, contactInfo: null, by: prof,
    },
    {
      type: 'lost', title: 'Blue ring-bound notebook', category: 'Books & Supplies', status: 'pending_verification',
      description: 'Blue notebook with handwritten Calculus notes and a sticker of a cat on the cover.',
      location: 'Library, 2nd floor reading area', date: daysAgo(0), time: '11:05',
      additionalDetails: 'Name written inside the front cover.', contactInfo: '0928-555-0101', by: juan,
    },
  ];

  const created = {};
  sample.forEach((s) => {
    const { by, status, ...fields } = s;
    const item = createItem({ ...fields, imageUrl: null, reportedBy: by.id, reportedByName: by.name });
    updateItem(item.id, { status });
    created[s.title] = item;
  });

  const claimOn = (title, claimant, status, extra = {}) =>
    createClaim({
      itemId: created[title].id,
      itemTitle: title,
      itemCategory: created[title].category,
      claimType: created[title].type === 'found' ? 'ownership' : 'finder',
      claimantId: claimant.id,
      claimantName: claimant.name,
      claimantEmail: claimant.email,
      contactInfo: claimant.email,
      verificationTier: verificationTier(created[title].category),
      appointmentDate: nextWeekday(1),
      appointmentTime: '10:00',
      status,
      ...extra,
    });

  claimOn('Silver iPhone with cracked screen protector', maria, 'pending', {
    proofDescription: 'It is my phone. Lock screen is my dog Bruno, there is a Pusheen sticker inside the case and I can unlock it in front of the office.',
  });
  claimOn('Grey hoodie with BPSU patch', juan, 'pending', {
    proofDescription: 'I left this hoodie after a Wednesday class. There is a small ink stain near the left cuff and my initials JDC inside the collar.',
  });
  claimOn('Scientific calculator (Casio fx-991)', prof, 'approved', {
    proofDescription: 'I found this calculator on the canteen table at lunch and kept it safe. Handing it in to the office.',
    officeNotes: 'Verified. Bring a valid ID on the appointment day.',
  });

  console.log('Seed complete:');
  console.log(`  Admin login:   ${admin.email} / ${adminPassword}`);
  console.log('  Demo students: maria.santos@bpsu.edu.ph, juan.delacruz@bpsu.edu.ph  (password: Demo@1234)');
  console.log('  Demo faculty:  ana.reyes@bpsu.edu.ph  (password: Demo@1234)');
  console.log(`  ${sample.length} reports and 3 claims created.`);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
