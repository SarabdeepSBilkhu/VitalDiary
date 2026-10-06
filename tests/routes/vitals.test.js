const request = require('supertest');
const app = require('../../server');

describe('Vitals Routes', () => {
  const testUser = {
    email: 'vitals@example.com',
    password: 'password123'
  };
  let token;

  const testVital = {
    id: 'vital-12345',
    timestamp: new Date().toISOString(),
    systolic: 120,
    diastolic: 80,
    hr: 72,
    spo2: 98,
    notes: 'Feeling good'
  };

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send(testUser);
    token = res.body.token;
  });

  describe('POST /api/vitals', () => {
    it('should create a new vitals record', async () => {
      const res = await request(app)
        .post('/api/vitals')
        .set('Authorization', `Bearer ${token}`)
        .send(testVital);
      
      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.systolic).toEqual(120);
    });

    it('should fail if mandatory fields are missing', async () => {
      const res = await request(app)
        .post('/api/vitals')
        .set('Authorization', `Bearer ${token}`)
        .send({ systolic: 120 }); // Missing timestamp, diastolic, hr
      
      expect(res.statusCode).toEqual(400);
    });
  });

  describe('GET /api/vitals', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/vitals')
        .set('Authorization', `Bearer ${token}`)
        .send(testVital);
    });

    it('should get all vitals for the user', async () => {
      const res = await request(app)
        .get('/api/vitals')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      expect(res.body.length).toEqual(1);
      expect(res.body[0].systolic).toEqual(120);
    });
  });

  describe('PUT /api/vitals/:id', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/vitals')
        .set('Authorization', `Bearer ${token}`)
        .send(testVital);
    });

    it('should update an existing vitals record', async () => {
      const updatedVital = { ...testVital, systolic: 125, diastolic: 85 };
      const res = await request(app)
        .put(`/api/vitals/${testVital.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updatedVital);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.systolic).toEqual(125);
      expect(res.body.diastolic).toEqual(85);
    });
  });

  describe('DELETE /api/vitals/:id', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/vitals')
        .set('Authorization', `Bearer ${token}`)
        .send(testVital);
    });

    it('should delete a vitals record', async () => {
      const res = await request(app)
        .delete(`/api/vitals/${testVital.id}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      
      // Verify it's gone
      const getRes = await request(app)
        .get('/api/vitals')
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.body.length).toEqual(0);
    });
  });
});
