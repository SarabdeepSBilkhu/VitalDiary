import React, { useEffect, useState } from 'react';
import { UserCircle2, Save, RotateCcw } from 'lucide-react';

type ProfileData = {
  name: string;
  age: string;
  gender: string;
  bloodGroup: string;
  height: string;
  allergies: string;
  emergencyContact: string;
};

const STORAGE_KEY = 'vital_diary_profile';

const emptyProfile: ProfileData = {
  name: '',
  age: '',
  gender: '',
  bloodGroup: '',
  height: '',
  allergies: '',
  emergencyContact: '',
};

const loadProfile = (): ProfileData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...emptyProfile, ...JSON.parse(stored) } : emptyProfile;
  } catch {
    return emptyProfile;
  }
};

export const Profile: React.FC = () => {
  const [profile, setProfile] = useState<ProfileData>(loadProfile);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  return (
    <section id="profile-view" className="view-section active">
      <div className="panel panel-glass mb-4">
        <div className="panel-header border-bottom">
          <div className="panel-title-group">
            <UserCircle2 className="color-primary" size={22} />
            <h3>Profile</h3>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline btn-sm" onClick={() => setProfile(emptyProfile)}>
              <RotateCcw size={14} style={{ marginRight: '4px' }} /> Reset
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))}>
              <Save size={14} style={{ marginRight: '4px' }} /> Save
            </button>
          </div>
        </div>

        <div className="form-grid">
          {([
            ['name', 'Name'],
            ['age', 'Age'],
            ['gender', 'Gender'],
            ['bloodGroup', 'Blood Group'],
            ['height', 'Height'],
            ['allergies', 'Allergies'],
            ['emergencyContact', 'Emergency Contact'],
          ] as const).map(([key, label]) => (
            <div className="form-group" key={key}>
              <label htmlFor={`profile-${key}`}>{label}</label>
              <input
                id={`profile-${key}`}
                className="form-control"
                value={profile[key]}
                placeholder={label}
                onChange={(e) => setProfile(prev => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};