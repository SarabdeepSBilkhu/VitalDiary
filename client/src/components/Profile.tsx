import React, { useEffect, useState } from 'react';
import { UserCircle2, Save, RotateCcw } from 'lucide-react';
import { api, type ProfileRecord } from '../utils/api';

type ProfileData = ProfileRecord;

const emptyProfile: ProfileData = {
  name: '',
  age: '',
  gender: '',
  bloodGroup: '',
  height: '',
  allergies: '',
  emergencyContact: '',
};

interface ProfileProps {
  showToast?: (message: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
}

export const Profile: React.FC<ProfileProps> = ({ showToast }) => {
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);
      try {
        const data = await api.getProfile();
        if (!cancelled) {
          setProfile({ ...emptyProfile, ...data });
        }
      } catch (err: any) {
        if (!cancelled) {
          showToast?.(err.message || 'Error loading profile.', 'danger');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await api.saveProfile(profile);
      setProfile({ ...emptyProfile, ...saved });
      showToast?.('Profile saved successfully.', 'success');
    } catch (err: any) {
      showToast?.(err.message || 'Error saving profile.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const saved = await api.saveProfile(emptyProfile);
      setProfile({ ...emptyProfile, ...saved });
      showToast?.('Profile reset.', 'info');
    } catch (err: any) {
      showToast?.(err.message || 'Error resetting profile.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="profile-view" className="view-section active">
      <div className="panel panel-glass mb-4">
        <div className="panel-header border-bottom">
          <div className="panel-title-group">
            <UserCircle2 className="color-primary" size={22} />
            <h3>Profile</h3>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline btn-sm" onClick={handleReset} disabled={loading || saving}>
              <RotateCcw size={14} style={{ marginRight: '4px' }} /> Reset
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={loading || saving}>
              <Save size={14} style={{ marginRight: '4px' }} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-muted py-4 text-center">Loading profile...</div>
        ) : (
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
                  disabled={saving}
                  onChange={(e) => setProfile(prev => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
