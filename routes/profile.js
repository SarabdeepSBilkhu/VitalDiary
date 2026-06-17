const express = require('express');
const router = express.Router();
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

const emptyProfile = {
  name: '',
  age: '',
  gender: '',
  bloodGroup: '',
  height: '',
  allergies: '',
  emergencyContact: '',
};

const mapProfileRow = (row) => ({
  ...emptyProfile,
  ...(row || {}),
  bloodGroup: row?.blood_group ?? row?.bloodGroup ?? '',
  emergencyContact: row?.emergency_contact ?? row?.emergencyContact ?? '',
});

router.get('/', async (req, res) => {
  try {
    const profile = await dbQuery.get('SELECT * FROM profiles WHERE user_id = ?', [req.user.id]);
    res.json(profile ? mapProfileRow(profile) : emptyProfile);
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Server error retrieving profile.' });
  }
});

router.put('/', async (req, res) => {
  const profile = {
    name: req.body.name || '',
    age: req.body.age || '',
    gender: req.body.gender || '',
    bloodGroup: req.body.bloodGroup || '',
    height: req.body.height || '',
    allergies: req.body.allergies || '',
    emergencyContact: req.body.emergencyContact || '',
  };

  try {
    await dbQuery.run(
      `INSERT INTO profiles (user_id, name, age, gender, blood_group, height, allergies, emergency_contact, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         name = excluded.name,
         age = excluded.age,
         gender = excluded.gender,
         blood_group = excluded.blood_group,
         height = excluded.height,
         allergies = excluded.allergies,
         emergency_contact = excluded.emergency_contact,
         updated_at = CURRENT_TIMESTAMP`,
      [
        req.user.id,
        profile.name,
        profile.age,
        profile.gender,
        profile.bloodGroup,
        profile.height,
        profile.allergies,
        profile.emergencyContact,
      ]
    );

    const savedProfile = await dbQuery.get('SELECT * FROM profiles WHERE user_id = ?', [req.user.id]);
    res.json(mapProfileRow(savedProfile));
  } catch (err) {
    console.error('Error saving profile:', err);
    res.status(500).json({ error: 'Server error saving profile.' });
  }
});

module.exports = router;