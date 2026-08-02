import React, { useEffect, useState } from 'react';
import { Pill, Plus, X, Edit2, Trash2, Syringe } from 'lucide-react';
import { api, type MedicationRecord } from '../utils/api';

type TimeOfDay = 'morning' | 'afternoon' | 'night' | 'insulin' | 'sos';
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
    isInsulin: boolean;
  }>({
    name: '',
    timeOfDay: [],
    instructions: '',
    isInsulin: false,
  });

  useEffect(() => {
    let cancelled = false;

    const loadMedications = async () => {
      setLoading(true);
      try {
        const data = await api.getMedications();
        if (!cancelled) {
          setMedications(
            data.map(medication => {
              const rawTime = Array.isArray(medication.timeOfDay) ? medication.timeOfDay : [medication.timeOfDay];
              const isIns = !!medication.isInsulin || rawTime.includes('insulin');
              const cleanTime = rawTime.filter(t => t !== 'insulin') as TimeOfDay[];
              return {
                id: String(medication.id),
                name: String(medication.name || ''),
                timeOfDay: cleanTime.length > 0 ? cleanTime : ['morning'],
                instructions: String(medication.instructions || ''),
                isInsulin: isIns,
              };
            })
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
    setFormData({ name: '', timeOfDay: [], instructions: '', isInsulin: false });
    setEditingId(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openAddInsulinModal = () => {
    resetForm();
    setFormData(prev => ({ ...prev, isInsulin: true }));
    setShowModal(true);
  };

  const openEditModal = (medication: Medication) => {
    setFormData({
      name: medication.name,
      timeOfDay: medication.timeOfDay,
      instructions: medication.instructions,
      isInsulin: !!medication.isInsulin,
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
      isInsulin: formData.isInsulin,
    };

    setSaving(true);
    try {
      if (editingId) {
        const updated = await api.updateMedication(editingId, payload);
        const rawTime = Array.isArray(updated.timeOfDay) ? updated.timeOfDay : [updated.timeOfDay];
        const cleanTime = rawTime.filter(t => t !== 'insulin') as TimeOfDay[];
        setMedications(prev =>
          prev.map(med =>
            med.id === editingId
              ? {
                  id: updated.id,
                  name: updated.name,
                  timeOfDay: cleanTime.length > 0 ? cleanTime : ['morning'],
                  instructions: updated.instructions || '',
                  isInsulin: !!updated.isInsulin || rawTime.includes('insulin'),
                }
              : med
          )
        );
        showToast?.('Medication updated successfully.', 'success');
      } else {
        const created = await api.createMedication(payload);
        const rawTime = Array.isArray(created.timeOfDay) ? created.timeOfDay : [created.timeOfDay];
        const cleanTime = rawTime.filter(t => t !== 'insulin') as TimeOfDay[];
        setMedications(prev => [
          ...prev,
          {
            id: created.id,
            name: created.name,
            timeOfDay: cleanTime.length > 0 ? cleanTime : ['morning'],
            instructions: created.instructions || '',
            isInsulin: !!created.isInsulin || rawTime.includes('insulin'),
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

  const regularMedications = medications.filter(med => !med.isInsulin);
  const insulinMedications = medications.filter(med => med.isInsulin);

  const medicationsByTimeOfDay = TIME_OF_DAY_GROUPS.map(group => ({
    group,
    medications: regularMedications.filter(medication => getTimeOfDayKey(medication.timeOfDay) === getTimeOfDayKey(group)),
  }));

  return (
    <section id="medications-view" className="view-section active">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* General Medications Panel */}
        <div className="panel panel-glass">
          <div className="panel-header border-bottom" style={{ marginBottom: '1rem', paddingBottom: '1rem' }}>
            <div className="panel-title-group">
              <Pill className="color-primary" size={22} />
              <h3>General Medications</h3>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openAddModal} disabled={loading}>
              <Plus size={14} style={{ marginRight: '4px' }} /> Add Medication
            </button>
          </div>

          {loading ? (
            <div className="text-muted py-4 text-center">Loading medications...</div>
          ) : regularMedications.length === 0 ? (
            <div className="text-muted py-4 text-center">No general medications added yet.</div>
          ) : (
            <div className="summary-list">
              {medicationsByTimeOfDay.map(({ group, medications: groupedMedications }) => (
                groupedMedications.length > 0 ? (
                  <div key={getTimeOfDayKey(group)} className="mb-4">
                    <div className="panel-title-group mb-2">
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{formatTimeOfDayGroup(group)}</h4>
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
              ))}
            </div>
          )}
        </div>

        {/* Insulin Panel */}
        <div className="panel panel-glass">
          <div className="panel-header border-bottom" style={{ marginBottom: '1rem', paddingBottom: '1rem' }}>
            <div className="panel-title-group">
              <Syringe className="color-success" size={22} />
              <h3>Insulin</h3>
            </div>
            <button className="btn btn-success btn-sm" onClick={openAddInsulinModal} disabled={loading}>
              <Plus size={14} style={{ marginRight: '4px' }} /> Add Insulin
            </button>
          </div>

          {loading ? (
            <div className="text-muted py-4 text-center">Loading insulin...</div>
          ) : insulinMedications.length === 0 ? (
            <div className="text-muted py-4 text-center">No insulin entries added yet.</div>
          ) : (
            <div className="summary-list">
              {insulinMedications.map(medication => (
                <div key={`insulin-${medication.id}`} className="summary-item" style={{ borderLeft: '3px solid var(--color-success)', paddingLeft: '12px' }}>
                  <div>
                    <div className="summary-value">{medication.name}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-success)' }}>
                        Frequency: {formatTimeOfDayGroup(medication.timeOfDay)}
                      </span>
                      {medication.instructions && (
                        <span className="text-secondary text-sm">
                          {medication.instructions}
                        </span>
                      )}
                    </div>
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
          )}
        </div>

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
                  placeholder="e.g., Aspirin, Lantus"
                  value={formData.name}
                  disabled={saving}
                  onChange={e => {
                    const name = e.target.value;
                    const isIns = name.toLowerCase().includes('insulin');
                    setFormData(prev => ({
                      ...prev,
                      name,
                      isInsulin: isIns ? true : prev.isInsulin
                    }));
                  }}
                />
              </div>

              <div className="form-group">
                <label>Medication Category</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="checkbox"
                      checked={formData.isInsulin}
                      disabled={saving}
                      onChange={e => setFormData({ ...formData, isInsulin: e.target.checked })}
                      className="radio-input"
                    />
                    <span className="radio-text" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Syringe size={14} className="color-success" style={{ display: 'inline' }} /> This is an Insulin medication
                    </span>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Time of Day / Frequency *</label>
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
                {saving ? 'Saving...' : editingId ? 'Update Medication' : 'Add Medication'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
