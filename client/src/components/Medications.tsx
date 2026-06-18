import React, { useEffect, useState } from 'react';
import { Pill, Plus, X, Edit2, Trash2 } from 'lucide-react';
import { api, type MedicationRecord } from '../utils/api';

type TimeOfDay = 'morning' | 'afternoon' | 'night' | 'sos';
type Medication = MedicationRecord;

const TIME_OF_DAY_OPTIONS: TimeOfDay[] = ['morning', 'afternoon', 'night', 'sos'];

const TIME_OF_DAY_GROUPS: TimeOfDay[][] = [
  ['morning'],
  ['afternoon'],
  ['night'],
  ['morning', 'night'],
  ['morning', 'afternoon'],
  ['afternoon', 'night'],
  ['morning', 'afternoon', 'night'],
  ['sos'],
];

const normalizeTimeOfDay = (value: unknown): TimeOfDay[] => {
  if (Array.isArray(value)) {
    return TIME_OF_DAY_OPTIONS.filter(option => value.includes(option));
  }

  if (value === 'morning' || value === 'afternoon' || value === 'night') {
    return [value];
  }

  if (value === 'sos') {
    return ['sos'];
  }

  return ['morning'];
};

const formatTimeOfDay = (timeOfDay: TimeOfDay[]) =>
  timeOfDay.map(time => (time === 'sos' ? 'SOS' : time.charAt(0).toUpperCase() + time.slice(1))).join(', ');

const getTimeOfDayKey = (timeOfDay: TimeOfDay[]) =>
  [...timeOfDay].sort().join('+');

const formatTimeOfDayGroup = (timeOfDay: TimeOfDay[]) =>
  timeOfDay.map(time => (time === 'sos' ? 'SOS' : time.charAt(0).toUpperCase() + time.slice(1))).join(' + ');

interface MedicationsProps {
  showToast?: (message: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
}

export const Medications: React.FC<MedicationsProps> = ({ showToast }) => {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    timeOfDay: TimeOfDay[];
    instructions: string;
  }>({
    name: '',
    timeOfDay: [],
    instructions: '',
  });

  useEffect(() => {
    let cancelled = false;

    const loadMedications = async () => {
      setLoading(true);
      try {
        const data = await api.getMedications();
        if (!cancelled) {
          setMedications(
            data.map(medication => ({
              id: String(medication.id),
              name: String(medication.name || ''),
              timeOfDay: normalizeTimeOfDay(medication.timeOfDay),
              instructions: String(medication.instructions || ''),
            }))
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          showToast?.(err.message || 'Error loading medications.', 'danger');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadMedications();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const resetForm = () => {
    setFormData({ name: '', timeOfDay: [], instructions: '' });
    setEditingId(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (medication: Medication) => {
    setFormData({
      name: medication.name,
      timeOfDay: medication.timeOfDay,
      instructions: medication.instructions,
    });
    setEditingId(medication.id);
    setShowModal(true);
  };

  const toggleTimeOfDay = (time: TimeOfDay) => {
    setFormData(prev => {
      const selected = prev.timeOfDay.includes(time)
        ? prev.timeOfDay.filter(item => item !== time)
        : [...prev.timeOfDay, time];

      return {
        ...prev,
        timeOfDay: TIME_OF_DAY_OPTIONS.filter(option => selected.includes(option)),
      };
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim() || formData.timeOfDay.length === 0) {
      return;
    }

    const payload = {
      id: editingId || `med-${Date.now()}`,
      name: formData.name.trim(),
      timeOfDay: formData.timeOfDay,
      instructions: formData.instructions.trim(),
    };

    setSaving(true);
    try {
      if (editingId) {
        const updated = await api.updateMedication(editingId, payload);
        setMedications(prev =>
          prev.map(med =>
            med.id === editingId
              ? {
                  id: updated.id,
                  name: updated.name,
                  timeOfDay: normalizeTimeOfDay(updated.timeOfDay),
                  instructions: updated.instructions || '',
                }
              : med
          )
        );
        showToast?.('Medication updated successfully.', 'success');
      } else {
        const created = await api.createMedication(payload);
        setMedications(prev => [
          ...prev,
          {
            id: created.id,
            name: created.name,
            timeOfDay: normalizeTimeOfDay(created.timeOfDay),
            instructions: created.instructions || '',
          },
        ]);
        showToast?.('Medication added successfully.', 'success');
      }

      resetForm();
      setShowModal(false);
    } catch (err: any) {
      showToast?.(err.message || 'Error saving medication.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMedication(id);
      setMedications(prev => prev.filter(med => med.id !== id));
      showToast?.('Medication deleted.', 'success');
    } catch (err: any) {
      showToast?.(err.message || 'Error deleting medication.', 'danger');
    }
  };

  const medicationsByTimeOfDay = TIME_OF_DAY_GROUPS.map(group => ({
    group,
    medications: medications.filter(medication => getTimeOfDayKey(medication.timeOfDay) === getTimeOfDayKey(group)),
  }));

  return (
    <section id="medications-view" className="view-section active">
      <div className="panel panel-glass mb-4">
        <div className="panel-header border-bottom">
          <div className="panel-title-group">
            <Pill className="color-primary" size={22} />
            <h3>Medications</h3>
          </div>
          <button className="btn btn-success btn-sm" onClick={openAddModal} disabled={loading}>
            <Plus size={14} style={{ marginRight: '4px' }} /> Add Medication
          </button>
        </div>

        {loading ? (
          <div className="text-muted py-4 text-center">Loading medications...</div>
        ) : (
          <div className="summary-list">
            {medications.length === 0 ? (
              <div className="text-muted py-4 text-center">No medications added yet.</div>
            ) : (
              medicationsByTimeOfDay.map(({ group, medications: groupedMedications }) => (
                groupedMedications.length > 0 ? (
                  <div key={getTimeOfDayKey(group)} className="mb-4">
                    <div className="panel-title-group mb-2">
                      <h4 style={{ margin: 0 }}>{formatTimeOfDayGroup(group)}</h4>
                    </div>
                    <div className="summary-list">
                      {groupedMedications.map(medication => (
                        <div key={`${getTimeOfDayKey(group)}-${medication.id}`} className="summary-item">
                          <div>
                            <div className="summary-value">{medication.name}</div>
                            {medication.instructions && (
                                <div className="text-secondary text-sm">
                                {medication.instructions}
                                </div>
                            )}
                            </div>
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => openEditModal(medication)}
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="btn btn-outline btn-sm color-danger"
                              onClick={() => handleDelete(medication.id)}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              ))
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className={`modal-overlay ${showModal ? 'active' : ''}`} onClick={() => !saving && setShowModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Medication' : 'Add New Medication'}</h2>
              <button className="btn btn-ghost" onClick={() => !saving && setShowModal(false)} disabled={saving}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Medication Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g., Aspirin"
                  value={formData.name}
                  disabled={saving}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Time of Day *</label>
                <div className="radio-group">
                  {TIME_OF_DAY_OPTIONS.map(time => (
                    <label key={time} className="radio-label">
                      <input
                        type="checkbox"
                        value={time}
                        checked={formData.timeOfDay.includes(time)}
                        disabled={saving}
                        onChange={() => toggleTimeOfDay(time)}
                        className="radio-input"
                      />
                      <span className="radio-text">{time === 'sos' ? 'SOS' : time.charAt(0).toUpperCase() + time.slice(1)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Instructions</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g., Taken while fasting, With food, etc."
                  value={formData.instructions}
                  disabled={saving}
                  onChange={e => setFormData({ ...formData, instructions: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => !saving && setShowModal(false)} disabled={saving}>
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={handleSave}
                disabled={saving || !formData.name.trim() || formData.timeOfDay.length === 0}
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Add'} Medication
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
